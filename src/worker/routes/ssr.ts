import type { Hono } from "hono";
import { createDb } from "../db";
import { USERNAME_RE } from "../lib/constants";
import { avatarUrl, escHtml, escJsonForScript } from "../lib/utils";
import { htmlCsp } from "../lib/csp";

type App = Hono<{ Bindings: Env; Variables: { userId: string } }>;

// Inlined because the worker can't import from the React app tsconfig target.
const CATEGORY_LABELS: Record<string, string> = {
  musician: "Musician", composer: "Composer", painter: "Painter", sculptor: "Sculptor",
  photographer: "Photographer", illustrator: "Illustrator", filmmaker: "Filmmaker",
  dancer: "Dancer", writer: "Writer / Poet",
  retail: "Retail", thrift: "Thrift", restaurant: "Restaurant",
  "coffee-shop": "Coffee Shop", bar: "Bar / Nightlife", services: "Services",
  journalist: "Journalist", reporter: "Reporter", "news-outlet": "News Outlet",
  podcast: "Podcast", blogger: "Blogger",
  "music-venue": "Music Venue", gallery: "Art Gallery", "event-space": "Event Space",
  nonprofit: "Nonprofit", organization: "Organization", collective: "Collective",
};

const BUSINESS_CATEGORIES = new Set([
  "retail", "thrift", "restaurant", "coffee-shop", "bar", "services",
  "news-outlet", "podcast", "music-venue", "gallery", "event-space",
  "nonprofit", "organization", "collective",
]);

export function registerSsrRoutes(app: App): void {
  // Server-side meta injection for public profile pages.
  // Social sharing bots (Twitter, Discord, Slack) don't execute JS, so OG tags
  // must be present in the initial HTML. We also inject performance hints:
  //   - <link rel="preload" as="fetch"> so the browser fires the profile API call
  //     as soon as HTML arrives, in parallel with JS download.
  //   - <link rel="preload" as="image"> for the avatar.
  //   - window.__PROFILE__ inline data (if the profile is in the Worker cache)
  //     so React can skip the API call entirely on first render.
  app.get("/:username", async (c) => {
    const username = c.req.param("username").toLowerCase();
    const assetResp = await c.env.ASSETS.fetch(c.req.raw);
    const mutableAsset = () => new Response(assetResp.body, { status: assetResp.status, statusText: assetResp.statusText, headers: new Headers(assetResp.headers) });
    if (!USERNAME_RE.test(username)) return mutableAsset();

    const sql = createDb(c.env.DATABASE_URL);
    const [profile] = await sql`
      SELECT display_name, bio, categories, avatar_asset_id FROM public.profiles WHERE username = ${username}
    `;
    if (!profile) return mutableAsset();

    const displayName = profile.display_name as string;
    const rawCategories = (profile.categories as string[] | null) ?? [];
    const categoryLabels = rawCategories.map((c) => CATEGORY_LABELS[c]).filter((l): l is string => Boolean(l));
    const url = `https://loul.ink/${username}`;

    const cats = categoryLabels.slice(0, 2).join(" & ");
    const title = cats ? `${displayName} — Louisville ${cats}` : `${displayName} — Louisville`;

    let description: string;
    if (categoryLabels.length > 0) {
      const bioText = (profile.bio as string | null)?.trim() ?? "";
      description = bioText
        ? `${cats} in Louisville — ${displayName}. ${bioText}`
        : `${cats} in Louisville — ${displayName}. Find all their links in one place.`;
    } else {
      description = (profile.bio as string | null)?.trim() || `Explore ${displayName}'s links — a Louisville creator on LouLink.`;
    }
    if (description.length > 155) description = description.slice(0, 152) + "…";

    const assetId = profile.avatar_asset_id as string | null;
    const avatarImgUrl = avatarUrl(assetId, "https://loul.ink");
    const ogImage = avatarImgUrl ?? "https://loul.ink/og-image.jpg";
    const twitterCard = assetId ? "summary" : "summary_large_image";

    const isBusiness = rawCategories.some((cat) => BUSINESS_CATEGORIES.has(cat));
    const jsonLd: Record<string, unknown> = {
      "@context": "https://schema.org",
      "@type": isBusiness ? "LocalBusiness" : "Person",
      "name": displayName,
      "url": url,
      "description": description,
      ...(assetId ? { "image": ogImage } : {}),
      ...(categoryLabels.length > 0 ? { "keywords": categoryLabels.join(", ") } : {}),
      "address": { "@type": "PostalAddress", "addressLocality": "Louisville", "addressRegion": "KY", "addressCountry": "US" },
      "sameAs": url,
    };

    // Preload avatar image so the browser starts downloading it before JS executes.
    // Note: we intentionally skip <link rel="preload" as="fetch"> for the profile API.
    // fetch() uses credentials:same-origin but a preload with crossorigin uses credentials:omit —
    // mismatched credential modes cause the preload to never be reused, resulting in a double-fetch
    // that wastes bandwidth and hurts LCP. The window.__PROFILE__ approach below is better anyway.
    const avatarPreloadLink = avatarImgUrl
      ? `<link rel="preload" as="image" href="${escHtml(avatarImgUrl)}">`
      : "";

    // Embed full profile data from Worker Cache API so React skips the API call entirely.
    // The inline script carries a per-request CSP nonce; without it, script-src blocks it.
    const cspNonce = crypto.randomUUID();
    let profileDataScript = "";
    try {
      const profileCacheKey = `${new URL(c.req.url).origin}/api/profile/${username}`;
      const profileCached = await caches.default.match(profileCacheKey);
      if (profileCached?.ok) {
        const rawData = await profileCached.json();
        profileDataScript = `<script nonce="${cspNonce}">window.__PROFILE__=${escJsonForScript(rawData)};window.__PROFILE_USER__=${escJsonForScript(username)};</script>`;
      }
    } catch { /* cache miss or malformed — skip embedding */ }

    const injected = [
      `<title>${escHtml(title)}</title>`,
      `<meta name="description" content="${escHtml(description)}">`,
      `<meta property="og:site_name" content="LouLink">`,
      `<meta property="og:title" content="${escHtml(title)}">`,
      `<meta property="og:description" content="${escHtml(description)}">`,
      `<meta property="og:url" content="${escHtml(url)}">`,
      `<meta property="og:type" content="profile">`,
      `<meta property="profile:username" content="${escHtml(username)}">`,
      `<meta property="og:image" content="${escHtml(ogImage)}">`,
      `<meta name="twitter:card" content="${twitterCard}">`,
      `<meta name="twitter:title" content="${escHtml(title)}">`,
      `<meta name="twitter:description" content="${escHtml(description)}">`,
      `<meta name="twitter:image" content="${escHtml(ogImage)}">`,
      `<link rel="canonical" href="${escHtml(url)}">`,
      `<script type="application/ld+json">${escJsonForScript(jsonLd)}</script>`,
      avatarPreloadLink,
      profileDataScript,
    ].filter(Boolean).join("\n\t\t");

    const rewritten = new HTMLRewriter()
      .on("title", { element(el) { el.remove(); } })
      .on("head", { element(el) { el.prepend(injected, { html: true }); } })
      .transform(assetResp);
    const res = new Response(rewritten.body, rewritten);
    res.headers.set("Content-Security-Policy", htmlCsp(cspNonce));
    return res;
  });
}
