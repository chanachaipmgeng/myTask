import { BadRequestException } from '@nestjs/common';
import { NextFunction, Request, Response } from 'express';

const MUTATING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

export function securityHeadersMiddleware(production: boolean) {
  return (_req: Request, res: Response, next: NextFunction): void => {
    res.removeHeader('X-Powered-By');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(self), geolocation=()');
    if (production) {
      res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    }
    next();
  };
}

export function originCsrfMiddleware(allowedOrigins: ReadonlySet<string>, production: boolean) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const path = req.path || req.originalUrl || '';
    if (!path.startsWith('/api/') || !MUTATING_METHODS.has(req.method.toUpperCase())) {
      next();
      return;
    }
    if (path === '/api/integrations/gitlab/webhook') {
      next();
      return;
    }

    const originHeader = typeof req.headers.origin === 'string' ? req.headers.origin.trim() : '';
    const refererHeader = typeof req.headers.referer === 'string' ? req.headers.referer.trim() : '';
    const hostHeader = typeof req.headers.host === 'string' ? req.headers.host.trim() : '';

    const isAllowedOrigin = (candidate: string): boolean => {
      if (allowedOrigins.has(candidate)) {
        return true;
      }
      if (hostHeader) {
        try {
          const parsed = new URL(candidate);
          const reqProto =
            typeof req.headers['x-forwarded-proto'] === 'string'
              ? req.headers['x-forwarded-proto'].split(',')[0]?.trim().toLowerCase()
              : req.protocol?.toLowerCase();
          if (production && reqProto === 'https' && parsed.protocol !== 'https:') {
            return false;
          }
          if (parsed.host === hostHeader) {
            return true;
          }
        } catch {
          return false;
        }
      }
      return false;
    };

    if (originHeader) {
      if (!isAllowedOrigin(originHeader)) {
        res.status(403).json({ statusCode: 403, message: 'Forbidden origin' });
        return;
      }
      next();
      return;
    }

    if (production && refererHeader) {
      try {
        const refOrigin = new URL(refererHeader).origin;
        if (!isAllowedOrigin(refOrigin)) {
          res.status(403).json({ statusCode: 403, message: 'Forbidden referer origin' });
          return;
        }
      } catch {
        res.status(403).json({ statusCode: 403, message: 'Invalid referer header' });
        return;
      }
    } else if (production && !refererHeader && typeof req.headers.cookie === 'string' && req.headers.cookie.trim()) {
      res.status(403).json({ statusCode: 403, message: 'Missing Origin or Referer header' });
      return;
    }

    next();
  };
}

interface RateBucket {
  count: number;
  resetAt: number;
}

const MAX_RATE_BUCKETS = 10_000;

export function createRateLimiterMiddleware() {
  const buckets = new Map<string, RateBucket>();
  const windowMs = 60_000;

  const cleanup = setInterval(() => {
    const now = Date.now();
    for (const [k, v] of buckets) {
      if (v.resetAt <= now) {
        buckets.delete(k);
      }
    }
  }, 60_000);
  cleanup.unref();

  return (req: Request, res: Response, next: NextFunction): void => {
    const path = req.path || req.originalUrl || '';
    if (!path.startsWith('/api/') || path === '/api/health' || path === '/api/health/live') {
      next();
      return;
    }

    let bucketName = 'default';
    let limit = 300;
    if (path.startsWith('/api/auth/') && path !== '/api/auth/me') {
      bucketName = 'auth';
      limit = 30;
    } else if (path.startsWith('/api/ai/') || path.startsWith('/api/analytics/')) {
      bucketName = 'heavy';
      limit = 20;
    } else if (
      (path.startsWith('/api/integrations/') && path.includes('/sync')) ||
      path === '/api/integrations/gitlab/webhook'
    ) {
      bucketName = 'sync';
      limit = 30;
    }

    const ip = req.ip || req.socket.remoteAddress || 'unknown';
    const key = `${bucketName}:${ip}`;
    const now = Date.now();
    let entry = buckets.get(key);
    if (!entry || entry.resetAt <= now) {
      if (!entry && buckets.size >= MAX_RATE_BUCKETS) {
        const oldestKey = buckets.keys().next().value;
        if (oldestKey !== undefined) {
          buckets.delete(oldestKey);
        }
      }
      entry = { count: 0, resetAt: now + windowMs };
      buckets.set(key, entry);
    }
    entry.count++;

    if (entry.count > limit) {
      const retryAfterSec = Math.max(1, Math.ceil((entry.resetAt - now) / 1000));
      res.setHeader('Retry-After', String(retryAfterSec));
      res.status(429).json({
        statusCode: 429,
        message: 'Too many requests, please retry later',
      });
      return;
    }

    next();
  };
}

const BLOCKED_HOSTS = new Set([
  '0.0.0.0',
  '169.254.169.254',
  'metadata.google.internal',
  'metadata',
]);

function isLoopbackHost(host: string): boolean {
  return (
    host === 'localhost' ||
    host === '::1' ||
    host.startsWith('127.') ||
    host.startsWith('::ffff:127.') ||
    /^::ffff:7f[0-9a-f]{2}:/i.test(host)
  );
}

function isLinkLocalOrUnspecified(host: string): boolean {
  return (
    BLOCKED_HOSTS.has(host) ||
    host.startsWith('169.254.') ||
    host.startsWith('fe80:') ||
    host === '::' ||
    host === '::ffff:0:0' ||
    /^::ffff:a9fe:/i.test(host)
  );
}

export function validateExternalUrl(
  raw: string,
  opts: { production: boolean; allowedHosts?: readonly string[]; allowEmpty?: boolean },
): string {
  const trimmed = raw.trim();
  if (!trimmed) {
    if (opts.allowEmpty) return '';
    throw new BadRequestException('URL is required');
  }
  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    throw new BadRequestException('Invalid URL format');
  }

  const protocol = parsed.protocol.toLowerCase();
  if (opts.production) {
    if (protocol !== 'https:') {
      throw new BadRequestException('HTTPS URL is required in production');
    }
  } else if (protocol !== 'https:' && protocol !== 'http:') {
    throw new BadRequestException('Only http/https URLs are allowed');
  }

  const host = parsed.hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (!host || isLinkLocalOrUnspecified(host)) {
    throw new BadRequestException('Disallowed target host');
  }
  if (opts.production && isLoopbackHost(host)) {
    throw new BadRequestException('Loopback host is not allowed in production');
  }

  if (opts.allowedHosts && opts.allowedHosts.length > 0 && !opts.allowedHosts.includes(host)) {
    throw new BadRequestException(`Host "${host}" is not in ALLOWED_INTEGRATION_HOSTS`);
  }

  return trimmed.replace(/\/+$/, '');
}

export function sanitizeEvidenceUrl(raw: string | undefined): string | undefined {
  if (raw === undefined || raw === null) return undefined;
  const trimmed = String(raw).trim();
  if (!trimmed) return undefined;
  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    throw new BadRequestException('Invalid evidenceUrl format');
  }
  const protocol = parsed.protocol.toLowerCase();
  if (protocol !== 'https:' && protocol !== 'http:') {
    throw new BadRequestException('evidenceUrl must use http or https');
  }
  return trimmed;
}
