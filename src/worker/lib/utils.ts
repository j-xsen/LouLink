import { MAX_LINK_URL, MAX_LINKS, MAX_LINK_TITLE } from "./constants";

export function mimeToExt(mime: string): string {
  return (
    { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/gif": "gif", "image/avif": "avif" } as Record<string, string>
  )[mime] ?? "bin";
}

export function avatarUrl(assetId: string | null, origin: string): string | null {
  if (!assetId) return null;
  const key = assetId.startsWith("avatars/") ? assetId.slice("avatars/".length) : assetId;
  return `${origin}/avatars/${key}`;
}

export async function bustProfileCache(origin: string, username: string): Promise<void> {
  await Promise.allSettled([
    caches.default.delete(`${origin}/api/profile/${username}`),
    caches.default.delete(`${origin}/api/directory`),
  ]);
}

export function sanitizeUrl(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  if (trimmed.length === 0 || trimmed.length > MAX_LINK_URL) return null;
  try {
    const url = new URL(trimmed);
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    return trimmed;
  } catch {
    return null;
  }
}

export type SanitizedItem =
  | { kind: "link"; title: string; url: string; icon?: string }
  | { kind: "header"; title: string };

export function sanitizeItems(raw: unknown): SanitizedItem[] | null {
  if (raw == null) return [];
  if (!Array.isArray(raw)) return null;
  if (raw.length > MAX_LINKS) return null;
  const items: SanitizedItem[] = [];
  for (const l of raw) {
    if (typeof l !== "object" || l === null) return null;
    const kind = l.kind === "header" ? "header" : "link";
    const title = typeof l.title === "string" ? l.title.trim() : "";
    if (!title || title.length > MAX_LINK_TITLE) continue;
    if (kind === "header") {
      items.push({ kind: "header", title });
    } else {
      const url = sanitizeUrl(l.url);
      if (!url) continue;
      const icon = typeof l.icon === "string" && l.icon ? l.icon : undefined;
      items.push({ kind: "link", title, url, ...(icon ? { icon } : {}) });
    }
  }
  return items;
}

export async function readJson<T>(c: { req: { json: () => Promise<T> } }): Promise<T | null> {
  try {
    return await c.req.json();
  } catch {
    return null;
  }
}

export function escHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
