# Architecture

## Runtime Target: Cloudflare Workers

The entire application runs on Cloudflare's edge network. There is no traditional Node.js server. The single Worker binary handles both API requests and static asset serving.

**Why Cloudflare Workers:**
- Zero cold starts, global edge distribution
- Free tier is generous for a community app with bursty traffic
- Integrated asset serving eliminates a separate CDN/hosting layer
- Workers KV and D1 are available as native bindings if needed later

## Repository Layout

```
src/
  react-app/              # React 19 SPA (compiled by Vite)
    main.tsx              # Entry point
    App.tsx               # Router only — routes + ScrollToTop + IndexRoute
    auth.tsx              # AuthProvider + route guards (components only, for Vite fast refresh)
    auth-context.ts       # AuthContext + useAuth hook (split out of auth.tsx)
    types.ts              # Shared TypeScript types + CATEGORY_LABELS constant
    index.css
    App.css
    auth-client.ts        # Better Auth client SDK initialization + getJwt()
    lib/
      avatar.ts           # Client-side avatar validation limits + resizeAndEncode() (200px center-crop)
      cache.ts            # localStorage-backed API response cache (getCached/setCached/deleteCached)
      color.ts            # autoTextColor(), extractDominantColor(), generateCardPalette()
      draft.ts            # localStorage link-builder draft (getDraft/saveDraft/clearDraft)
      seo.ts              # useSeo hook (document.title + noindex meta)
      username.ts         # validateUsername + useUsernameCheck (debounced availability check)
      useNavigationWarning.ts  # useNavigationWarning(isDirty) — blocks in-app navigation + beforeunload when form has unsaved changes
    components/
      icons.tsx           # Icon, IconPicker components
      icon-map.ts         # ICON_MAP + BRAND_COLORS registry (split out of icons.tsx)
      ui.tsx              # ShapeButton, PageHeader, ShapeTitle, BlobButton (shared shape-based UI)
      blob-shapes.ts      # AVATAR_BLOB_SHAPES + BLOB_SHAPES SVG path data (split out of ui.tsx)
      Avatar.tsx          # AvatarImage, AvatarUpload
      Directory.tsx       # MemberCard, GroupedDirectory (home/dashboard member list)
    pages/
      Home.tsx            # Public landing page + directory (logged-out)
      Dashboard.tsx       # Authenticated home (logged-in with profile) — lazy-loaded
      CreatePage.tsx      # Link builder — works without an account; draft saved to localStorage
      SignIn.tsx          # Sign in form
      SignUp.tsx          # Account creation + onboarding (calls POST /api/onboarding)
      ForgotPassword.tsx  # Email-based password reset request (RedirectIfAuthed)
      ResetPassword.tsx   # Set new password via ?token= from email link
      Settings.tsx        # Avatar, display name, bio, appearance (theme/colors/shape), categories, directory visibility, username change
      ProfilePage.tsx     # Public /:username profile page — fires view/duration/click beacons
      Analytics.tsx       # /analytics dashboard — stat cards, bar charts, link performance table
      AdminDashboard.tsx  # /admin — localhost-only admin panel, ADMIN_KEY bearer auth
    assets/               # SVG logos, shape blobs, brand icons
  worker/
    index.ts              # Hono app wiring — thin entrypoint (~40 lines), registers all route modules
    analytics.ts          # isBot(), parseUserAgent(), classifyReferrer(), computeVisitorHash(), mergeJsonbCounts()
    cron.ts               # handleScheduled() — nightly rollup aggregation + raw event purge
    auth.ts               # requireAuth, optionalAuth, requireAdmin middleware
    db.ts                 # createDb() — Neon postgres connection factory
    lib/
      constants.ts        # Shared validation constants: USERNAME_RE, UUID_RE, MAX_*, RESERVED_USERNAMES, ALLOWED_IMAGE_TYPES
      utils.ts            # Shared helpers: mimeToExt, avatarUrl, bustProfileCache, sanitizeUrl, sanitizeItems, readJson, escHtml, escJsonForScript, isBlockedHost, safeFetch (SSRF guards)
      csp.ts              # htmlCsp() — Content-Security-Policy string for HTML responses (optional per-request nonce)
    routes/
      me.ts               # All /api/me/* routes + /api/onboarding (auth-gated)
      profile.ts          # /api/profile/:username, /api/username/:username/available, /avatars/*, /api/directory
      og.ts               # /api/og (OG metadata fetch), /api/fetch-title, /api/og-img (image proxy with cf.image resizing)
      admin.ts            # /api/admin/* routes (requireAdmin)
      analytics.ts        # /api/track/view|duration|click, /api/me/analytics
      ssr.ts              # GET /:username — server-injects OG meta tags and performance hints into the SPA HTML
scripts/
  parse-lighthouse.mjs    # CLI — summarize a Lighthouse JSON report: node scripts/parse-lighthouse.mjs <report.json> [--category perf|a11y|seo|bp]
```

## Two Compilation Targets

### Frontend (`src/react-app/`)
- **Compiler**: Vite with `@vitejs/plugin-react`
- **Config**: `tsconfig.app.json`
- **Output**: `dist/client/` (static HTML/JS/CSS)
- Standard React 19 SPA. Talks to the API via `/api/*` fetch calls.

### Backend (`src/worker/`)
- **Compiler**: Vite via `@cloudflare/vite-plugin`, targeting the Workers runtime
- **Config**: `tsconfig.worker.json`
- **Framework**: Hono — a lightweight, edge-native HTTP framework
- **Env bindings**: typed via `worker-configuration.d.ts`, generated by `pnpm cf-typegen`
- **Entry**: `src/worker/index.ts` — a thin wiring layer that applies global middleware and calls `registerXxxRoutes(app)` for each module. All route logic lives in `src/worker/routes/`.

Note: Cloudflare Workers always run as a single bundled file. The `routes/` split is source organization only — Vite bundles everything into one `index.js` at build time. There is zero runtime overhead from the split.

## How They Connect

`vite.config.ts` loads both `@vitejs/plugin-react` and `@cloudflare/vite-plugin`. This wires the two targets into a single build and dev server:

- **Dev**: `pnpm dev` starts Vite on `http://localhost:5173`. `/api/*` requests are proxied to a local Workers runtime (Miniflare). Hot reload works for both React and the Worker.
- **Production**: `wrangler deploy` uploads the Worker. `wrangler.json` configures it to serve `dist/client/` as static assets with SPA fallback, and route `/api/*` to the Hono app.

## API Routing (Hono)

Routes are registered via module functions in `src/worker/routes/`. To add a route, edit the relevant module (or create a new one and call `registerXxxRoutes(app)` from `index.ts`).

```
GET  /api/                             → health check
GET  /api/me                               → current user's profile (auth-gated)
POST /api/onboarding                       → create profile + initial links (auth-gated)
PUT  /api/me/links                         → replace all links in bulk (auth-gated)
PUT  /api/me/bio                           → update bio, max 300 chars (auth-gated)
PUT  /api/me/display-name                  → update display name, max 100 chars (auth-gated)
PUT  /api/me/categories                    → update categories array (auth-gated)
PUT  /api/me/accent                        → update accent_color (theme/colors/avatar shape/card colors) (auth-gated)
PUT  /api/me/social-links                  → update social_links jsonb; validated platform allowlist (auth-gated)
PUT  /api/me/directory-visibility          → toggle hide_from_directory; verified users only (auth-gated)
PUT  /api/me/username                      → change username (auth-gated)
POST /api/me/avatar                        → upload avatar to R2 (auth-gated)
GET  /api/me/analytics                     → analytics dashboard data, ?period=7d|30d|90d|all (auth-gated)
GET  /api/username/:username/available     → username availability check (public, rate-limited)
GET  /api/profile/:username                → public profile + links (public, rate-limited)
GET  /api/directory                        → all verified users, ordered by display_name, capped at 500 rows (public, rate-limited)
GET  /api/og                               → fetch og:image from an external URL (public, OG_RATE_LIMITER)
GET  /api/fetch-title                      → fetch a URL's <title> for link-editor auto-fill (public, OG_RATE_LIMITER)
GET  /api/og-img                           → proxy-fetch an image server-side; adds UNAVATAR_API_KEY for unavatar.io (public, OG_RATE_LIMITER)
POST /api/track/view                       → record a page view event (public, bot-filtered, self-view prevention)
POST /api/track/duration                   → update duration_ms on an existing view event via sendBeacon; requires the caller's visitor_hash (recomputed from IP + User-Agent) to match the event row; returns 204
POST /api/track/click                      → record a link click event (public, bot-filtered, self-click prevention)
GET  /api/admin/users                      → list all profiles (requireAdmin)
PATCH /api/admin/profiles/:username        → update verified flag and/or categories (requireAdmin)
DELETE /api/admin/profiles/:username       → delete profile; cascades links + analytics events (requireAdmin)
GET  /avatars/*                            → serve R2 avatar objects
GET  /:username                            → SPA HTML with server-injected OG meta + performance hints (see SSR section)
GET  *                                     → static assets / SPA fallback
```

Note: link management is bulk-replace only (`PUT /api/me/links` deletes all existing links and re-inserts the full array). There is no per-link create/update/delete endpoint.

Admin routes (`/api/admin/*`) require `Authorization: Bearer <ADMIN_KEY>` — compared directly against `c.env.ADMIN_KEY` (not a JWT). See `requireAdmin` in `src/worker/auth.ts`.

Analytics tracking routes accept an optional `Authorization` header — if the JWT matches the profile owner, the event is silently dropped (self-view/self-click prevention). Bots are also filtered by User-Agent before any DB write.

Cloudflare bindings (secrets, R2) are accessed via `c.env` inside Hono handlers. Add new bindings to `wrangler.json` first, then run `pnpm cf-typegen` to update the `Env` type.

## SSR and Performance Hints (`src/worker/routes/ssr.ts`)

The `GET /:username` route is handled by the Worker rather than the SPA fallback. It fetches the SPA's `index.html` from ASSETS, then uses HTMLRewriter to inject into `<head>`:

**OG / social meta tags** — `<title>`, `<meta name="description">`, all `og:*` and `twitter:*` tags, `<link rel="canonical">`, and a `<script type="application/ld+json">` block. Social crawlers (Twitter, Discord, Slack) don't run JavaScript, so these must be in the initial HTML.

**Performance hints** (all injected at HTML-arrival time, before JS downloads):
- `<link rel="preload" as="image" href="...">` — preloads the avatar so it starts downloading before React renders.
- `<script nonce="...">window.__PROFILE__ = {...}; window.__PROFILE_USER__ = "...";</script>` — if the profile JSON is already in the Worker Cache API (`caches.default`), the full data is embedded inline. `ProfilePage.tsx` reads `window.__PROFILE__` before issuing a fetch, skipping the API round trip entirely on repeat visits. JSON is XSS-safe via `escJsonForScript()`, which replaces `<`, `>`, `&` with their `\uXXXX` JSON escapes so user data can never break out of the script tag. The script carries a per-request CSP nonce — the route sets its own `Content-Security-Policy` header via `htmlCsp(nonce)`.

Note: there is deliberately **no** `<link rel="preload" as="fetch">` for the profile API. `fetch()` uses `credentials: same-origin` but a `crossorigin` preload uses `credentials: omit` — the mismatched credential modes mean the preload is never reused, causing a double-fetch that hurts LCP. The `window.__PROFILE__` embed covers the warm-cache case instead.

## Build-time Performance Hints (`vite.config.ts`)

`vite.config.ts` includes a custom `htmlPatchPlugin` with a `closeBundle` hook that post-processes `dist/client/index.html` after Vite builds the client bundle. It:

1. Inlines the compiled CSS `<link>` as a `<style>` block (eliminates a render-blocking request).
2. Adds `fetchpriority="high"` to the logo `<img>` preload.
3. Scans `dist/client/assets/` for JS chunks whose filenames start with `ProfilePage`, `icons`, `color`, or `link`, and injects `<link rel="modulepreload" href="/assets/CHUNK">` for each. This tells the browser to download these chunks in parallel with the main bundle rather than sequentially after it executes, shaving ~600ms off FCP on mobile.

## Code Splitting

The React app uses `React.lazy` + `Suspense` for route-level code splitting:

- `ProfilePage` — lazy (the most common landing page; its chunk is modulepreloaded at build time so it downloads in parallel, not sequentially)
- `Dashboard` — lazy (never rendered on public profile pages; keeping it eager would bloat the main bundle with dead weight)
- All other pages are also lazy-loaded by default via the router

## TypeScript Config

`tsconfig.json` is a composite root referencing three projects:
- `tsconfig.app.json` — frontend
- `tsconfig.node.json` — Vite config and build tooling
- `tsconfig.worker.json` — Worker

Always run `tsc -b` (not bare `tsc`) to build all three together.

## Frontend Routing

React Router handles client-side navigation. Routes:

```
/          → IndexRoute: Home (logged-out) or Dashboard (logged-in with profile)
/signin           → SignIn page (RedirectIfAuthed)
/signup           → SignUp + profile creation (RedirectIfAuthed)
/forgot-password  → ForgotPassword: email-based reset request (RedirectIfAuthed)
/reset-password   → ResetPassword: set new password via ?token= from email link
/create    → CreatePage: link builder (works without an account; draft saved to localStorage)
/settings  → Settings: avatar, display name, bio, profile appearance (theme/colors/avatar shape/social icon toggle), categories, directory visibility, username change (RequireProfile guard)
/analytics → Analytics: views/clicks dashboard (RequireProfile guard)
/admin     → AdminDashboard: localhost-only admin panel (hostname check inside component; no route guard)
/:username → ProfilePage: public profile
```

The SPA fallback in `wrangler.json` (`"not_found_handling": "single-page-application"`) ensures all unmatched routes return `index.html`, so deep links work correctly.

## Cron Trigger

`wrangler.json` registers a single Cron Trigger: `"0 6 * * *"` (06:00 UTC daily, which is 1–2 AM Louisville time). The Worker exports `scheduled: handleScheduled` alongside `fetch: app.fetch`.

`handleScheduled` (in `src/worker/cron.ts`) runs two operations each night:
1. Aggregates the previous day's raw events from `page_view_events` and `link_click_events` into their respective `_daily` rollup tables.
2. Purges events older than 30 days from both raw event tables.

## Security Middleware (`src/worker/index.ts` + `src/worker/lib/`)

Three layers applied globally in `index.ts`:

- **CORS (same-origin only)** — `hono/cors` on `/api/*` with a dynamic origin callback that only echoes the request's own origin. Browsers may not read API responses from any other origin; the API is consumed exclusively by the SPA.
- **Secure headers** — `hono/secure-headers` on `/api/*`.
- **CSP on all HTML** — a response middleware sets `Content-Security-Policy` (from `htmlCsp()` in `lib/csp.ts`) on every `text/html` response that doesn't already carry one. The SSR profile route sets its own nonce-bearing header first (for the inline `window.__PROFILE__` script), so the middleware only fills in the default. `script-src` allows `'self'`, the umami analytics origin, an `'unsafe-hashes'` sha256 for the font-preload `onload=""` handler in `index.html`, and the optional per-request nonce. If the `onload` handler in `index.html` changes, the hash in `csp.ts` must be recomputed. `style-src`/`img-src`/`connect-src` are deliberately unrestricted (inline styles everywhere; SPA talks to the external Neon Auth origin).

**SSRF protection** (`lib/utils.ts`) — all server-side fetches of user-supplied URLs (`/api/og`, `/api/fetch-title`, `/api/og-img`) go through `safeFetch()`, which follows redirects manually and re-validates every hop with `isBlockedHost()` (loopback, link-local incl. cloud metadata, RFC-1918/CGNAT private ranges, IPv6 equivalents, `.local`/`.internal` hostnames). `sanitizeUrl()` also rejects blocked hosts at input-validation time.

## Rate Limiting

Two Cloudflare Workers rate limiter bindings are configured in `wrangler.json` under `unsafe.bindings`:

| Binding | Limit | Applied to |
|---|---|---|
| `OG_RATE_LIMITER` | 200 req/min | `GET /api/og`, `GET /api/fetch-title`, `GET /api/og-img` |
| `UNAUTHED_RATE_LIMITER` | 100 req/min | `GET /api/profile/:username`, `GET /api/directory`, `GET /api/username/:username/available` |

These use the Cloudflare Workers rate limiting API (namespace IDs `1001` and `1002`), keyed by `CF-Connecting-IP` in each handler.

## Caching

- **Worker Cache API (`caches.default`)** — `GET /api/profile/:username` and `GET /api/directory` responses are cached at the edge (`s-maxage=86400`); `bustProfileCache()` in `lib/utils.ts` deletes both entries on any profile/link mutation. `/api/og-img` responses (including negative results) are also cached here.
- **KV (`UNAVATAR_CACHE` binding)** — budget guard for unavatar.io fetches in `/api/og-img`: `miss:<url>` keys negative-cache failed lookups for 7 days, and `count:<YYYY-MM-DD>` enforces a 40-requests/day cap (below the unavatar 50/day plan limit).
