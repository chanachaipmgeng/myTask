import crypto from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import type { Db } from '../db/db.service';

export interface RequestWithId extends Request {
  requestId?: string;
}

const SAFE_REQUEST_ID_RE = /^[A-Za-z0-9._-]{1,64}$/;
const MAX_DURATION_SAMPLES = 500;
const MAX_ERROR_ROUTES = 50;

interface MetricsState {
  startedAt: string;
  totalRequests: number;
  statusBuckets: {
    '2xx': number;
    '3xx': number;
    '4xx': number;
    '5xx': number;
  };
  durationsMs: number[];
  maxDurationMs: number;
  errorRoutes: Map<string, number>;
}

function createInitialState(): MetricsState {
  return {
    startedAt: new Date().toISOString(),
    totalRequests: 0,
    statusBuckets: {
      '2xx': 0,
      '3xx': 0,
      '4xx': 0,
      '5xx': 0,
    },
    durationsMs: [],
    maxDurationMs: 0,
    errorRoutes: new Map<string, number>(),
  };
}

let metricsState: MetricsState = createInitialState();

export function resetMetricsForTest(): void {
  metricsState = createInitialState();
}

export function sanitizeRequestId(raw: unknown): string | null {
  if (typeof raw !== 'string') {
    return null;
  }
  const trimmed = raw.trim();
  if (!SAFE_REQUEST_ID_RE.test(trimmed)) {
    return null;
  }
  return trimmed;
}

export function getRequestId(req: Pick<Request, 'headers'> & { requestId?: string }): string {
  return req.requestId ?? '';
}

function recordRequestMetric(method: string, path: string, statusCode: number, durationMs: number): void {
  metricsState.totalRequests += 1;
  if (statusCode >= 500) {
    metricsState.statusBuckets['5xx'] += 1;
  } else if (statusCode >= 400) {
    metricsState.statusBuckets['4xx'] += 1;
  } else if (statusCode >= 300) {
    metricsState.statusBuckets['3xx'] += 1;
  } else {
    metricsState.statusBuckets['2xx'] += 1;
  }

  const roundedMs = Math.round(durationMs * 100) / 100;
  metricsState.durationsMs.push(roundedMs);
  if (metricsState.durationsMs.length > MAX_DURATION_SAMPLES) {
    metricsState.durationsMs.shift();
  }
  if (roundedMs > metricsState.maxDurationMs) {
    metricsState.maxDurationMs = roundedMs;
  }

  if (statusCode >= 400) {
    const cleanPath = path.split('?')[0] || '/';
    const routeKey = `${method.toUpperCase()} ${cleanPath}`;
    if (metricsState.errorRoutes.size < MAX_ERROR_ROUTES || metricsState.errorRoutes.has(routeKey)) {
      metricsState.errorRoutes.set(routeKey, (metricsState.errorRoutes.get(routeKey) ?? 0) + 1);
    }
  }
}

export function requestObservabilityMiddleware(production: boolean) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const incoming = sanitizeRequestId(req.headers['x-request-id']);
    const requestId = incoming ?? crypto.randomUUID();
    (req as RequestWithId).requestId = requestId;
    res.setHeader('X-Request-Id', requestId);

    const startNs = process.hrtime.bigint();
    res.on('finish', () => {
      const elapsedNs = Number(process.hrtime.bigint() - startNs);
      const durationMs = Math.max(0, elapsedNs / 1_000_000);
      const cleanPath = (req.path || req.originalUrl || '/').split('?')[0] || '/';
      const status = res.statusCode;

      if (cleanPath !== '/api/health/live') {
        recordRequestMetric(req.method, cleanPath, status, durationMs);
      }

      const isHealth = cleanPath === '/api/health' || cleanPath === '/api/health/live';
      const shouldLog = !isHealth || status >= 400 || durationMs >= 1_000;
      if (!shouldLog) {
        return;
      }

      const roundedMs = Math.round(durationMs * 10) / 10;
      if (production) {
        const entry = {
          ts: new Date().toISOString(),
          level: status >= 500 ? 'error' : status >= 400 || durationMs >= 1_000 ? 'warn' : 'info',
          requestId,
          method: req.method,
          path: cleanPath,
          status,
          durationMs: roundedMs,
        };
        const line = JSON.stringify(entry);
        if (status >= 500) {
          console.error(line);
        } else {
          console.log(line);
        }
      } else if (status >= 400 || durationMs >= 500) {
        console.log(
          `[HTTP ${status}] ${req.method} ${cleanPath} ${roundedMs}ms reqId=${requestId}`,
        );
      }
    });

    next();
  };
}

function percentile95(values: readonly number[]): number {
  if (values.length === 0) {
    return 0;
  }
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * 0.95) - 1));
  return Math.round(sorted[idx] * 100) / 100;
}

export function getRuntimeMetricsSnapshot(db?: Db) {
  const mem = process.memoryUsage();
  const samples = metricsState.durationsMs;
  const avgMs =
    samples.length > 0
      ? Math.round((samples.reduce((sum, n) => sum + n, 0) / samples.length) * 100) / 100
      : 0;
  const errorRoutes = [...metricsState.errorRoutes.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 15)
    .map(([route, count]) => ({ route, count }));

  return {
    status: 'ok' as const,
    timestamp: new Date().toISOString(),
    startedAt: metricsState.startedAt,
    uptimeSec: Math.round(process.uptime()),
    nodeVersion: process.version,
    memory: {
      rssMb: Math.round((mem.rss / 1_048_576) * 10) / 10,
      heapUsedMb: Math.round((mem.heapUsed / 1_048_576) * 10) / 10,
      heapTotalMb: Math.round((mem.heapTotal / 1_048_576) * 10) / 10,
    },
    dbPool: db
      ? {
          total: db.pool.totalCount,
          idle: db.pool.idleCount,
          waiting: db.pool.waitingCount,
        }
      : null,
    http: {
      totalRequests: metricsState.totalRequests,
      statusBuckets: { ...metricsState.statusBuckets },
      latencyMs: {
        avg: avgMs,
        p95: percentile95(samples),
        max: Math.round(metricsState.maxDurationMs * 100) / 100,
      },
      errorRoutes,
    },
  };
}
