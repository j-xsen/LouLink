# Media Storage — Cloudflare R2

## Current State

Avatar images are stored in **Cloudflare R2**, not Contentful. Contentful is no longer used for avatar storage.

The R2 bucket is named `loulink-avatars` and is bound to the Worker as `AVATAR_BUCKET`.

## Avatar Upload Flow

1. User selects an image in the React app (Settings page → `AvatarUpload` component)
2. Client validates: JPEG, PNG, WebP, or GIF only; max 5 MB (`ALLOWED_IMAGE_TYPES_CLIENT` / `MAX_AVATAR_BYTES_CLIENT` in `src/react-app/lib/avatar.ts`)
3. Client resizes and re-encodes via `resizeAndEncode()` — center-crops to a square, downscales to max 200×200 px
4. React app `POST`s the resized binary to `POST /api/me/avatar` with the image's `Content-Type` header
5. Worker validates MIME type and size again server-side, plus magic-byte sniffing — the first bytes must match the declared type (JPEG/PNG/GIF/WebP/AVIF signatures), else 415
6. Worker generates an R2 key: `<user_id>/<timestamp>.<ext>` (no `avatars/` prefix — that's only in the URL path)
7. Worker calls `c.env.AVATAR_BUCKET.put(key, body, { httpMetadata: { contentType } })`
8. Worker updates `profiles.avatar_asset_id` to the R2 key
9. Worker deletes the old R2 object if one existed
10. Worker busts the profile + directory edge cache and returns `{ avatarUrl: "<origin>/avatars/<key>" }`

## Avatar URL Construction

```ts
// src/worker/lib/utils.ts
export function avatarUrl(assetId: string | null, origin: string): string | null {
  if (!assetId) return null;
  const key = assetId.startsWith("avatars/") ? assetId.slice("avatars/".length) : assetId;
  return `${origin}/avatars/${key}`;
}
```

`avatar_asset_id` in the DB stores the R2 key (e.g. `uuid/1234567890.jpg`), not a full URL. URLs are built from the request origin at read time (no hardcoded domain). The `startsWith("avatars/")` strip handles legacy rows whose stored key included the prefix.

## Serving Avatars

The Worker has a `GET /avatars/*` route that proxies R2 objects:

```ts
app.get("/avatars/*", async (c) => {
  const key = c.req.path.slice("/avatars/".length);
  const obj = await c.env.AVATAR_BUCKET.get(key);
  // returns with Cache-Control: public, max-age=31536000, immutable
  // (keys are timestamped, so a new upload gets a new URL)
  // and X-Content-Type-Options: nosniff
});
```

## R2 Binding

Declared in `wrangler.json`:

```json
"r2_buckets": [
  {
    "binding": "AVATAR_BUCKET",
    "bucket_name": "loulink-avatars"
  }
]
```

The `Env` type picks this up automatically via `pnpm cf-typegen` (written to `worker-configuration.d.ts`). The manual `env.d.ts` file documents secrets only.

## KV — `UNAVATAR_CACHE`

A KV namespace (bound as `UNAVATAR_CACHE` in `wrangler.json`) acts as a budget guard for unavatar.io fetches in `GET /api/og-img`:

- `miss:<url>` — negative cache for failed avatar lookups, 7-day TTL. A cached miss short-circuits to 404 without hitting unavatar.
- `count:<YYYY-MM-DD>` — daily request counter, 2-day TTL. Once it reaches 40 (below the unavatar 50/day plan limit), further unavatar fetches that day return 429.

Successful images are cached in the Worker Cache API (`caches.default`) — 3 days for unavatar, 7 days for other hosts.

## Environment Variables

| Variable | Purpose |
|---|---|
| `UNAVATAR_API_KEY` | (optional) Sent as `x-api-key` to `unavatar.io` from `GET /api/og-img` when fetching social profile avatars. If absent, unauthenticated requests are made. |
| `CONTENTFUL_SPACE_ID` | (future) Contentful space — not referenced by any active code |
| `CONTENTFUL_DELIVERY_TOKEN` | (future) Content Delivery API — not referenced by any active code |
| `CONTENTFUL_MANAGEMENT_TOKEN` | (future) Content Management API — not referenced by any active code |

If Contentful is wired up in the future (e.g. for editorial content types like announcements or featured profiles), store only the asset ID in Neon and construct URLs at render time.
