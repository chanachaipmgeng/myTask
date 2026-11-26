/** Shared HTTP resilience helpers: idempotent retry checks, Retry-After parsing, jittered backoff, and circuit breaker. */

export function parseRetryAfterMs(header: string | null | undefined, maxMs = 30_000): number | null {
  if (!header) return null;
  const trimmed = header.trim();
  if (!trimmed) return null;
  const secs = Number(trimmed);
  if (Number.isFinite(secs) && secs >= 0) {
    return Math.min(maxMs, Math.round(secs * 1000));
  }
  const targetMs = Date.parse(trimmed);
  if (Number.isFinite(targetMs)) {
    const delta = targetMs - Date.now();
    return delta > 0 ? Math.min(maxMs, delta) : 0;
  }
  return null;
}

/** Only retry safe/idempotent read methods by default (never blind-retry POST/PATCH mutations). */
export function isIdempotentMethod(method?: string): boolean {
  const m = (method ?? 'GET').trim().toUpperCase();
  return m === 'GET' || m === 'HEAD';
}

export function backoffWithJitterMs(attempt: number, retryAfterMs?: number | null): number {
  if (retryAfterMs != null && retryAfterMs >= 0) {
    return Math.min(30_000, retryAfterMs);
  }
  const base = Math.min(8_000, 400 * 2 ** attempt);
  const jitter = Math.floor(Math.random() * 250);
  return base + jitter;
}

export class CircuitBreaker {
  private failures = 0;
  private openUntil = 0;

  constructor(
    private readonly failureThreshold = 5,
    private readonly cooldownMs = 30_000,
    private readonly nowFn: () => number = () => Date.now(),
  ) {}

  assertClosed(serviceName: string): void {
    const now = this.nowFn();
    if (this.openUntil > now) {
      const waitSec = Math.ceil((this.openUntil - now) / 1000);
      throw new Error(`${serviceName} circuit breaker open — retrying in ~${waitSec}s`);
    }
  }

  recordSuccess(): void {
    this.failures = 0;
    this.openUntil = 0;
  }

  recordFailure(): void {
    this.failures += 1;
    if (this.failures >= this.failureThreshold) {
      this.openUntil = this.nowFn() + this.cooldownMs;
    }
  }

  isOpen(): boolean {
    return this.openUntil > this.nowFn();
  }
}
