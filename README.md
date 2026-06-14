<p align="center">
  <img src="https://raw.githubusercontent.com/j-xsen/loulink/main/src/react-app/assets/logo-full-color.svg" alt="LouLink" width="480" />
</p>

<p align="center">
  A Louisville-only link-in-bio platform and public directory for local artists, businesses, and creators.
</p>

<p align="center">
  <a href="https://github.com/j-xsen/loulink">GitHub</a> · <a href="https://loulink.com">loulink.com</a>
</p>

---

## What It Is

LouLink gives Louisville artists and businesses a single shareable URL that aggregates all their online presences — Instagram, Bandcamp, Etsy, website, and more — into one public profile page at `loulink.com/<username>`.

Unlike Linktree, LouLink is **Louisville-only**. Every user must be verified as Louisville-based, and the home page is a browsable directory of the entire local creative and business community.

## Stack

| Layer | Technology |
|---|---|
| Frontend | React 19, TypeScript, Vite |
| Backend | Hono on Cloudflare Workers |
| Database | Neon (PostgreSQL) |
| Media | Contentful CDN |
| Auth | Session-based (cookie + Hono middleware) |
| Deployment | Cloudflare Workers + Wrangler |

## Getting Started

Install dependencies:

```bash
pnpm install
```

Start the dev server:

```bash
pnpm dev
```

App runs at [http://localhost:5173](http://localhost:5173). The Vite plugin proxies `/api/*` to the local Worker runtime automatically.

## Commands

```bash
pnpm dev          # Start dev server
pnpm build        # Type-check + Vite build (outputs to dist/)
pnpm preview      # Build then preview locally
pnpm lint         # ESLint
pnpm deploy       # Deploy to Cloudflare Workers
pnpm check        # tsc + build + wrangler dry-run
pnpm cf-typegen   # Regenerate worker-configuration.d.ts from wrangler bindings
npx wrangler tail # Stream live worker logs
```

## Architecture

The app runs entirely on a single Cloudflare Worker that serves both the API and the static React SPA.

- **`src/react-app/`** — React 19 frontend, compiled by Vite. Entry: `src/react-app/main.tsx`
- **`src/worker/index.ts`** — Hono API backend, compiled for the Workers runtime

In dev, Vite proxies `/api/*` to the Worker runtime. In production, the Worker serves `dist/client/` as static assets with SPA fallback, and handles `/api/*` via Hono.

## Deployment

Requires [Wrangler](https://developers.cloudflare.com/workers/wrangler/) and a Cloudflare account with the required secrets set.

```bash
pnpm deploy
```

See `docs/deployment.md` for secrets management and custom domain setup.

## Docs

Full documentation lives in `docs/`:

- `docs/overview.md` — What LouLink is, target users, core user flows, verification model
- `docs/architecture.md` — Technical architecture, build targets, routing
- `docs/database.md` — Neon (PostgreSQL) schema, connection pattern, migrations
- `docs/contentful.md` — Contentful CDN, asset upload flow, image optimization
- `docs/auth.md` — Session-based auth, Hono middleware pattern, authorization rules
- `docs/deployment.md` — Cloudflare Workers deployment, secrets management, custom domain
- `docs/features.md` — MVP scope, post-MVP roadmap
