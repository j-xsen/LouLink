import type { Hono } from "hono";
import { ALLOWED_IMAGE_TYPES } from "../lib/constants";
import { sanitizeUrl } from "../lib/utils";

type App = Hono<{ Bindings: Env; Variables: { userId: string } }>;

const OG_BODY_LIMIT = 512 * 1024;  // caps external page reads in /api/og
const OG_IMG_LIMIT  = 300 * 1024;  // link cards render at 110×72 px
const UNAVATAR_DAILY_CAP = 40;      // stay below the 50/day plan limit

const OG_BLOCKED_HOSTS = new Set([
  "www.instagram.com", "instagram.com",
  "www.facebook.com", "facebook.com", "fb.com",
  "www.tiktok.com", "tiktok.com",
  "twitter.com", "x.com",
]);

// Returns an unavatar.io URL for recognized social profile URLs, or null.
// API key is NOT included here — it is injected server-side in /api/og-img.
function getSocialAvatarUrl(url: string): string | null {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.replace(/^www\./, "");
    const parts = parsed.pathname.split("/").filter(Boolean);
    if (!parts.length) return null;
    const slug = parts[0].replace(/^@/, "");

    if (host === "instagram.com") {
      if (["p", "reel", "stories", "explore", "tv", "direct"].includes(slug)) return null;
      return `https://unavatar.io/instagram/${encodeURIComponent(slug)}`;
    }
    if (host === "twitter.com" || host === "x.com") {
      if (["i", "home", "search", "explore", "notifications", "messages"].includes(slug)) return null;
      return `https://unavatar.io/twitter/${encodeURIComponent(slug)}`;
    }
    if (host === "tiktok.com") {
      return `https://unavatar.io/tiktok/${encodeURIComponent(slug)}`;
    }
    return null;
  } catch {
    return null;
  }
}

export function registerOgRoutes(app: App): void {
  // Scrapes og:image / twitter:image from a URL's <head>.
  app.get("/api/og", async (c) => {
    const ip = c.req.header("CF-Connecting-IP") ?? "unknown";
    const { success } = ip === "unknown" ? { success: true } : await c.env.OG_RATE_LIMITER.limit({ key: ip });
    if (!success) return c.json({ error: "Too many requests" }, 429);
    const url = sanitizeUrl(c.req.query("url") ?? "");
    if (!url) return c.json({ ogImage: null }, 400);

    const socialAvatar = getSocialAvatarUrl(url);
    if (socialAvatar) {
      const ogImgCacheKey = new URL(c.req.url).origin + `/api/og-img?url=${encodeURIComponent(socialAvatar)}`;
      const ogImgCached = await caches.default.match(ogImgCacheKey);
      if (ogImgCached && !ogImgCached.ok) {
        c.header("Cache-Control", "public, max-age=3600");
        return c.json({ ogImage: null });
      }
      c.header("Cache-Control", "public, max-age=86400");
      return c.json({ ogImage: socialAvatar });
    }

    try {
      const host = new URL(url).hostname;
      if (OG_BLOCKED_HOSTS.has(host)) {
        c.header("Cache-Control", "public, max-age=86400");
        return c.json({ ogImage: null });
      }
    } catch { /* sanitizeUrl already validated */ }

    let ogImage: string | null = null;
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 5000);
      const res = await fetch(url, {
        signal: controller.signal,
        headers: { "User-Agent": "LouLink/1.0 (+https://loul.ink)" },
        redirect: "follow",
      });
      clearTimeout(timer);
      if (res.ok) {
        const finalUrl = res.url || url;
        let ogBytes = 0;
        const limiter = new TransformStream<Uint8Array, Uint8Array>({
          transform(chunk, ctrl) {
            ogBytes += chunk.byteLength;
            if (ogBytes > OG_BODY_LIMIT) { ctrl.terminate(); }
            else { ctrl.enqueue(chunk); }
          },
        });
        const limited = new Response(res.body?.pipeThrough(limiter) ?? null, { headers: new Headers(res.headers) });
        const found: string[] = [];
        await new HTMLRewriter()
          .on("meta", {
            element(el) {
              if (found.length > 0) return;
              const prop = el.getAttribute("property") ?? el.getAttribute("name");
              if (prop === "og:image" || prop === "twitter:image") {
                const content = el.getAttribute("content");
                if (content) found.push(content);
              }
            },
          })
          .transform(limited)
          .arrayBuffer();
        let raw: string | null = found[0] ?? null;
        if (raw) raw = raw.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"');
        if (raw && !raw.startsWith("http")) {
          try { raw = new URL(raw, finalUrl).href; } catch { raw = null; }
        }
        ogImage = raw;
      }
    } catch { /* timeout or network error */ }

    c.header("Cache-Control", "public, max-age=86400");
    return c.json({ ogImage });
  });

  // Fetches the <title> of a URL — used by the link editor to auto-fill titles.
  app.get("/api/fetch-title", async (c) => {
    const ip = c.req.header("CF-Connecting-IP") ?? "unknown";
    const { success } = ip === "unknown" ? { success: true } : await c.env.OG_RATE_LIMITER.limit({ key: ip });
    if (!success) return c.json({ error: "Too many requests" }, 429);
    const url = sanitizeUrl(c.req.query("url") ?? "");
    if (!url) return c.json({ title: null }, 400);
    let title: string | null = null;
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 5000);
      const res = await fetch(url, {
        signal: controller.signal,
        headers: { "User-Agent": "LouLink/1.0 (+https://loul.ink)" },
        redirect: "follow",
      });
      clearTimeout(timer);
      if (res.ok) {
        const chunks: string[] = [];
        await new HTMLRewriter()
          .on("title", { text(chunk) { chunks.push(chunk.text); } })
          .transform(res)
          .arrayBuffer();
        title = chunks.join("").trim() || null;
        if (title) title = title
          .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
          .replace(/&quot;/g, '"').replace(/&#39;/g, "'");
      }
    } catch { /* timeout or network error */ }
    c.header("Cache-Control", "public, max-age=3600");
    return c.json({ title });
  });

  // Proxies OG images so hotlink-protected CDNs (e.g. Instagram scontent) are
  // served from our domain instead of the browser hitting them and receiving 403.
  app.get("/api/og-img", async (c) => {
    const ip = c.req.header("CF-Connecting-IP") ?? "unknown";
    const { success } = await c.env.OG_RATE_LIMITER.limit({ key: ip });
    if (!success) return new Response("Too many requests", { status: 429 });
    const url = sanitizeUrl(c.req.query("url") ?? "");
    if (!url) return new Response("Bad request", { status: 400 });

    const cacheKey = new URL(c.req.url).origin + `/api/og-img?url=${encodeURIComponent(url)}`;
    const cached = await caches.default.match(cacheKey);
    if (cached) return new Response(cached.body, { status: cached.status, headers: new Headers(cached.headers) });

    const isUnavatar = new URL(url).hostname === "unavatar.io";
    if (isUnavatar) {
      const dayKey = new Date().toISOString().slice(0, 10);
      const [isMiss, countStr] = await Promise.all([
        c.env.UNAVATAR_CACHE.get(`miss:${url}`),
        c.env.UNAVATAR_CACHE.get(`count:${dayKey}`),
      ]);
      if (isMiss !== null) return new Response("Not found", { status: 404 });
      if (parseInt(countStr ?? "0", 10) >= UNAVATAR_DAILY_CAP) return new Response("Not found", { status: 429 });
    }

    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 15000);
      const res = await fetch(url, {
        signal: controller.signal,
        // cf.image is silently ignored if Cloudflare Image Resizing is not enabled on the account.
        cf: { image: { width: 800, height: 420, fit: "cover", format: "webp", quality: 85 } },
        headers: {
          "User-Agent": "Mozilla/5.0 (compatible; LouLink/1.0; +https://loul.ink)",
          "Referer": "https://loul.ink/",
          "Origin": "https://loul.ink",
          ...(isUnavatar && c.env.UNAVATAR_API_KEY ? { "x-api-key": c.env.UNAVATAR_API_KEY } : {}),
        },
        redirect: "follow",
      });
      clearTimeout(timer);
      if (!res.ok) return new Response("Not found", { status: 404 });

      const contentType = res.headers.get("content-type") ?? "";
      const mimeBase = contentType.split(";")[0].trim();
      if (!ALLOWED_IMAGE_TYPES.has(mimeBase)) return new Response("Not an image", { status: 415 });

      if (isUnavatar && mimeBase !== "image/jpeg") {
        const miss = new Response("Not found", { status: 404, headers: { "Cache-Control": "public, max-age=3600" } });
        caches.default.put(cacheKey, miss.clone()).catch(() => {});
        c.executionCtx.waitUntil(c.env.UNAVATAR_CACHE.put(`miss:${url}`, "1", { expirationTtl: 604800 }));
        return miss;
      }

      let imgBytes = 0;
      const limiter = new TransformStream<Uint8Array, Uint8Array>({
        transform(chunk, ctrl) {
          imgBytes += chunk.byteLength;
          if (imgBytes > OG_IMG_LIMIT) { ctrl.terminate(); }
          else { ctrl.enqueue(chunk); }
        },
      });
      const imageBuffer = await new Response(res.body?.pipeThrough(limiter) ?? null).arrayBuffer();
      const maxAge = isUnavatar ? 259200 : 604800;
      const imageRes = new Response(imageBuffer, {
        headers: {
          "Content-Type": mimeBase,
          "Cache-Control": `public, max-age=${maxAge}`,
          "X-Content-Type-Options": "nosniff",
        },
      });
      caches.default.put(cacheKey, imageRes.clone()).catch(() => {});
      if (isUnavatar) {
        c.executionCtx.waitUntil((async () => {
          const dayKey = new Date().toISOString().slice(0, 10);
          const prev = await c.env.UNAVATAR_CACHE.get(`count:${dayKey}`);
          const next = parseInt(prev ?? "0", 10) + 1;
          await c.env.UNAVATAR_CACHE.put(`count:${dayKey}`, String(next), { expirationTtl: 172800 });
        })());
      }
      return imageRes;
    } catch {
      return new Response("Failed to fetch image", { status: 502 });
    }
  });
}
