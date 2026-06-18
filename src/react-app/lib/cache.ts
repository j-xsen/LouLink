// ---------------------------------------------------------------------------
// localStorage-backed API cache — survives page refreshes and Safari reloads
// ---------------------------------------------------------------------------

const CACHE_TTL = 5 * 60 * 1000;
const PREFIX = "loulink_cache_";

export function getCached<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(PREFIX + key);
    if (!raw) return null;
    const { data, ts } = JSON.parse(raw);
    if (Date.now() - ts > CACHE_TTL) { localStorage.removeItem(PREFIX + key); return null; }
    return data as T;
  } catch { return null; }
}

export function setCached(key: string, data: unknown) {
  try { localStorage.setItem(PREFIX + key, JSON.stringify({ data, ts: Date.now() })); } catch {}
}

export function deleteCached(key: string) {
  try { localStorage.removeItem(PREFIX + key); } catch {}
}
