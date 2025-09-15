const buckets = new Map<string, { count: number; ts: number }>();
export function rateLimit(key: string, limit = 15, windowMs = 10_000) {
  const now = Date.now();
  const item = buckets.get(key);
  if (!item || now - item.ts > windowMs) {
    buckets.set(key, { count: 1, ts: now });
    return { ok: true } as const;
  }
  item.count += 1;
  if (item.count > limit) return { ok: false, retryAfterMs: windowMs - (now - item.ts) } as const;
  return { ok: true } as const;
}
