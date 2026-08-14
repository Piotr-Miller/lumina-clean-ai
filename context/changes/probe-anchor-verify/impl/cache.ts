const store = new Map<string, { value: unknown; expiresAt: number }>();

export function cacheGet(key: string): unknown {
  const hit = store.get(key);
  if (hit === undefined || hit.expiresAt < 1) return undefined;
  return hit.value;
}

export function cacheSet(key: string, value: unknown, ttlMs: number): void {
  store.set(key, { value, expiresAt: ttlMs });
}
