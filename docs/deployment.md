# Deployment

## Platform: Cloudflare Workers

The app is deployed as a single Cloudflare Worker that serves both the API and the static React SPA.

### Deploy to Production

```bash
pnpm deploy
# equivalent to: wrangler deploy
```

This builds the Worker and uploads it to Cloudflare. The `dist/client/` static assets are uploaded as part of the Worker bundle and served via Cloudflare's asset handling.

### wrangler.json Key Settings

```json
{
  "name": "loulink",
  "main": "./src/worker/index.ts",
  "compatibility_date": "2025-10-08",
  "compatibility_flags": ["nodejs_compat"],
  "assets": {
    "directory": "./dist/client",
    "not_found_handling": "single-page-application"
  }
}
```

- `nodejs_compat` flag enables Node.js compatibility APIs in the Worker runtime (needed for some npm packages)
- `not_found_handling: single-page-application` means any path not matching a static file returns `index.html`, enabling React Router client-side navigation
- `observability.enabled: true` turns on Cloudflare's built-in Worker analytics and logging

## Environment Variables & Secrets

Local development uses `.dev.vars` (gitignored). Production values are Wrangler secrets.

```bash
# Add a secret to production
wrangler secret put DATABASE_URL
wrangler secret put CONTENTFUL_SPACE_ID
wrangler secret put CONTENTFUL_DELIVERY_TOKEN
wrangler secret put CONTENTFUL_MANAGEMENT_TOKEN

# List all secrets
wrangler secret list
```

After adding secrets, run `pnpm cf-typegen` to regenerate `worker-configuration.d.ts` so the `Env` type includes them.

**.dev.vars format:**
```
DATABASE_URL=postgresql://...
CONTENTFUL_SPACE_ID=abc123
CONTENTFUL_DELIVERY_TOKEN=...
CONTENTFUL_MANAGEMENT_TOKEN=...
```

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
