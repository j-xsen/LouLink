# Deployment

## Platform: Cloudflare Workers

The app is deployed as a single Cloudflare Worker that serves both the API and the static React SPA.

### Deploy to Production

```bash
pnpm deploy
# runs: tsc -b && vite build && wrangler deploy
```

This builds the Worker and uploads it to Cloudflare. The `dist/client/` static assets are uploaded as part of the Worker bundle and served via Cloudflare's asset handling.

### wrangler.json Key Settings

```json
{
  "name": "loulink",
  "main": "./src/worker/index.ts",
  "compatibility_date": "2025-10-08",
  "compatibility_flags": ["nodejs_compat"],
  "observability": { "enabled": true },
  "upload_source_maps": true,
  "assets": {
    "directory": "./dist/client",
    "binding": "ASSETS",
    "not_found_handling": "single-page-application"
  },
  "r2_buckets": [{ "binding": "AVATAR_BUCKET", "bucket_name": "loulink-avatars" }],
  "kv_namespaces": [{ "binding": "UNAVATAR_CACHE", "id": "…", "preview_id": "…" }],
  "triggers": { "crons": ["0 6 * * *"] },
  "unsafe": {
    "bindings": [
      { "name": "OG_RATE_LIMITER",      "type": "ratelimit", "namespace_id": "1001", "simple": { "limit": 200, "period": 60 } },
      { "name": "UNAUTHED_RATE_LIMITER", "type": "ratelimit", "namespace_id": "1002", "simple": { "limit": 100, "period": 60 } }
    ]
  }
}
```

- `nodejs_compat` flag enables Node.js compatibility APIs in the Worker runtime
- `not_found_handling: single-page-application` returns `index.html` for any path not matching a static file, enabling React Router client-side navigation
- `observability.enabled: true` turns on Cloudflare's built-in Worker analytics and logging
- `triggers.crons` registers the nightly analytics cron (see Architecture docs)
- `kv_namespaces` binds the `UNAVATAR_CACHE` KV namespace (unavatar.io miss-cache + daily budget counter — see `docs/storage.md`)
- `unsafe.bindings` provisions the two rate limiter namespaces (Cloudflare Workers Rate Limiting API)

## Environment Variables & Secrets

Local development uses `.dev.vars` (gitignored). Production values are Wrangler secrets.

```bash
# Add secrets to production
wrangler secret put DATABASE_URL
wrangler secret put AUTH_JWKS_URL
wrangler secret put ADMIN_KEY          # Required for admin dashboard operations
wrangler secret put UNAVATAR_API_KEY   # Optional — authenticated social avatar fetches via unavatar.io

# List all secrets
wrangler secret list
```

After adding secrets, run `pnpm cf-typegen` to regenerate `worker-configuration.d.ts` so the `Env` type includes them.

**.dev.vars format:**
```
DATABASE_URL=<your-neon-connection-string>
AUTH_JWKS_URL=<your-neon-jwks-url>
ADMIN_KEY=<your-admin-key>
# UNAVATAR_API_KEY=<your-key>   # optional
```

`VITE_AUTH_URL` (the Better Auth client URL for the frontend) is not a Wrangler secret — it goes in `.env.local` and is baked into the React bundle at build time.

## Check Before Deploy

```bash
pnpm check
# runs: tsc && vite build && wrangler deploy --dry-run
```

The dry-run validates the Worker bundle can be uploaded without actually deploying.

## Logs

```bash
npx wrangler tail
```

Streams live Worker logs (console.log, errors, request traces) to your terminal. Useful for debugging production issues.

## Custom Domain

In the Cloudflare dashboard, assign a custom domain (e.g., `loulink.com`) to the Worker under Workers & Pages → your worker → Settings → Domains & Routes.

## Build Output

```
dist/
  client/       ← React SPA (static assets uploaded with Worker)
```

The Worker source is compiled inline by Wrangler — it does not appear as a separate artifact in `dist/`.
