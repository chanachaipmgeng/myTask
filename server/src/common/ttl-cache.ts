/** Tiny process-local TTL cache for GitLab/OP fan-out hot paths. */

type Entry<T> = { value: T; expiresAt: number };

export class TtlCache<T> {
  private readonly store = new Map<string, Entry<T>>();

  constructor(
    private readonly defaultTtlMs: number,
    private readonly maxEntries = 500,
  ) {}

  get(key: string): T | undefined {
    const hit = this.store.get(key);
    if (!hit) return undefined;
    if (Date.now() > hit.expiresAt) {
      this.store.delete(key);
      return undefined;
    }
    return hit.value;
  }

  set(key: string, value: T, ttlMs = this.defaultTtlMs): void {
    if (this.store.size >= this.maxEntries) {
      const first = this.store.keys().next().value;
      if (first != null) this.store.delete(first);
    }
    this.store.set(key, { value, expiresAt: Date.now() + ttlMs });
  }

  async getOrSet(key: string, factory: () => Promise<T>, ttlMs = this.defaultTtlMs): Promise<T> {
    const cached = this.get(key);
    if (cached !== undefined) return cached;
    const value = await factory();
    this.set(key, value, ttlMs);
    return value;
  }
}

/** Run async work over items with a fixed concurrency pool. */
export async function mapPool<T, R>(
  items: readonly T[],
  concurrency: number,
  worker: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const limit = Math.max(1, Math.min(concurrency, items.length || 1));
  const results: R[] = new Array(items.length);
  let next = 0;
  const runners = Array.from({ length: limit }, async () => {
    while (true) {
      const i = next;
      next += 1;
      if (i >= items.length) return;
      results[i] = await worker(items[i]!, i);
    }
  });
  await Promise.all(runners);
  return results;
}
