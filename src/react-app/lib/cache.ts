// ---------------------------------------------------------------------------
// In-memory API cache — survives SPA navigations, cleared on tab close
// ---------------------------------------------------------------------------

const _apiCache = new Map<string, { data: unknown; ts: number }>();
const CACHE_TTL = 5 * 60 * 1000;

export function getCached<T>(key: string): T | null {
  const entry = _apiCache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.ts > CACHE_TTL) { _apiCache.delete(key); return null; }
  return entry.data as T;
}

export function setCached(key: string, data: unknown) {
  _apiCache.set(key, { data, ts: Date.now() });
}

export function deleteCached(key: string) {
  _apiCache.delete(key);
}
