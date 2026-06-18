# Media Storage — Cloudflare R2

## Current State

Avatar images are stored in **Cloudflare R2**, not Contentful. Contentful is no longer used for avatar storage.

The R2 bucket is named `loulink-avatars` and is bound to the Worker as `AVATAR_BUCKET`.

## Avatar Upload Flow

1. User selects an image in the React app (Settings page → `AvatarUpload` component)
2. Client validates: JPEG, PNG, WebP, or GIF only; max 5 MB
3. React app `POST`s the raw binary to `POST /api/me/avatar` with the image's `Content-Type` header
4. Worker validates MIME type and size again server-side
5. Worker generates an R2 key: `avatars/<user_id>/<timestamp>.<ext>`
6. Worker calls `c.env.AVATAR_BUCKET.put(key, body, { httpMetadata: { contentType } })`
7. Worker updates `profiles.avatar_asset_id` to the R2 key
8. Worker deletes the old R2 object if one existed
9. Worker returns `{ avatarUrl: "https://loul.ink/avatars/<key>" }`

## Avatar URL Construction

```ts
function avatarUrl(assetId: string | null): string | null {
  if (!assetId) return null;
  return `https://loul.ink/avatars/${assetId}`;
}
```

`avatar_asset_id` in the DB stores the R2 key (e.g. `avatars/uuid/1234567890.jpg`), not a full URL.

## Serving Avatars

The Worker has a `GET /avatars/*` route that proxies R2 objects:

```ts
app.get("/avatars/*", async (c) => {
  const key = c.req.path.slice("/avatars/".length);
  const obj = await c.env.AVATAR_BUCKET.get(key);
  // returns with Cache-Control: public, max-age=300, s-maxage=3600
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

## Environment Variables

| Variable | Purpose |
|---|---|
| `UNAVATAR_API_KEY` | (optional) Sent as `x-api-key` to `unavatar.io` from `GET /api/og-img` when fetching social profile avatars. If absent, unauthenticated requests are made. |
| `CONTENTFUL_SPACE_ID` | (future) Contentful space — not referenced by any active code |
| `CONTENTFUL_DELIVERY_TOKEN` | (future) Content Delivery API — not referenced by any active code |
| `CONTENTFUL_MANAGEMENT_TOKEN` | (future) Content Management API — not referenced by any active code |

If Contentful is wired up in the future (e.g. for editorial content types like announcements or featured profiles), store only the asset ID in Neon and construct URLs at render time.
