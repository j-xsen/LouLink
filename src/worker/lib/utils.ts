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

// Blocks hosts that point at internal infrastructure to prevent SSRF when the
// URL is later fetched server-side (og, fetch-title, og-img). Covers loopback,
// link-local (incl. cloud metadata 169.254.169.254), and RFC-1918 private
// ranges for IPv4/IPv6, plus obvious internal hostnames. Note: a hostname that
// resolves to a private IP via DNS is not caught here — callers that follow
// redirects must re-validate each resolved hop.
export function isBlockedHost(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local") || host.endsWith(".internal")) return true;

  // IPv6 loopback / unspecified / unique-local (fc00::/7) / link-local (fe80::/10)
  if (host === "::1" || host === "::") return true;
  if (/^f[cd][0-9a-f]{2}:/.test(host)) return true;
  if (/^fe[89ab][0-9a-f]:/.test(host)) return true;
  // IPv4-mapped IPv6 (::ffff:a.b.c.d) — fall through to the IPv4 check below
  const mapped = host.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  const ipv4Candidate = mapped ? mapped[1] : host;

  const m = ipv4Candidate.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (m) {
    const [a, b] = m.slice(1).map(Number);
    if ([a, b, Number(m[3]), Number(m[4])].some((n) => n > 255)) return true; // malformed → block
    if (a === 0 || a === 10 || a === 127) return true;                // this-network, private, loopback
    if (a === 169 && b === 254) return true;                          // link-local incl. metadata
    if (a === 172 && b >= 16 && b <= 31) return true;                 // private
    if (a === 192 && b === 168) return true;                          // private
    if (a === 100 && b >= 64 && b <= 127) return true;               // CGNAT
    if (a >= 224) return true;                                        // multicast / reserved
  }
  return false;
}

export function sanitizeUrl(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  if (trimmed.length === 0 || trimmed.length > MAX_LINK_URL) return null;
  try {
    const url = new URL(trimmed);
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    if (isBlockedHost(url.hostname)) return null;
    return trimmed;
  } catch {
    return null;
  }
}

// Fetch that follows redirects manually, re-validating every hop against
// isBlockedHost. Prevents redirect-based SSRF where an allowed public host
// 30x-redirects into an internal address. Throws if a hop is blocked or the
// redirect chain exceeds maxRedirects.
export async function safeFetch(
  url: string,
  init: RequestInit,
  maxRedirects = 4,
): Promise<Response> {
  let current = url;
  for (let i = 0; i <= maxRedirects; i++) {
    const res = await fetch(current, { ...init, redirect: "manual" });
    if (res.status < 300 || res.status >= 400) return res;
    const location = res.headers.get("location");
    if (!location) return res;
    let next: URL;
    try {
      next = new URL(location, current);
    } catch {
      throw new Error("SSRF: malformed redirect target");
    }
    if ((next.protocol !== "https:" && next.protocol !== "http:") || isBlockedHost(next.hostname)) {
      throw new Error("SSRF: blocked redirect target");
    }
    current = next.href;
  }
  throw new Error("SSRF: too many redirects");
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

// Serialize a value for safe embedding inside an inline <script> tag.
// JSON.stringify alone does NOT escape "</script>" or "<", so a user-controlled
// string could break out of the script element. Escaping <, >, & to \u-escapes
// keeps the JSON valid while making breakout impossible.
export function escJsonForScript(value: unknown): string {
  return JSON.stringify(value)
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026");
}
