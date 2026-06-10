# Contentful — Media & Content CDN

## Why Contentful

Contentful is used as the CDN for user-uploaded media (profile photos) and any editorial/marketing content on the site. It is chosen because:
- The Images API provides on-the-fly resizing, format conversion (WebP/AVIF), and cropping — no image processing pipeline needed in the Worker
- Free tier covers thousands of assets, appropriate for a community app
- Assets are served from Contentful's global CDN (`images.ctfassets.net`)
- Content types allow structured editorial content (e.g., featured profiles, announcements) without a CMS build

## What Lives in Contentful

| Content Type | Purpose |
|---|---|
| **Profile Image** | User avatar uploads. Workers don't do multipart upload; the React app uploads directly to Contentful's Upload API and stores only the asset ID in Neon. |
| **Announcement** (future) | Site-wide banners or news managed by admins |
| **Featured Profile** (future) | Editorial picks for the home page hero section |

## Asset Storage Pattern

Contentful asset IDs (not URLs) are stored in the Neon `users.avatar_asset_id` column. URLs are constructed at render time:

```ts
function avatarUrl(assetId: string, width = 200): string {
  return `https://images.ctfassets.net/${CONTENTFUL_SPACE_ID}/${assetId}/avatar.jpg?w=${width}&fm=webp&fit=thumb`;
}
```

**Why store ID not URL:** Contentful URLs include the space ID and can be constructed from just the asset ID. Storing the URL would couple the DB to a specific CDN hostname and make format/size changes require DB updates.

## Upload Flow

1. User selects an image in the React app
2. React app calls `POST /api/upload-token` → Worker generates a short-lived Contentful Management API token or signed URL
3. React app uploads directly to Contentful Upload API
4. On success, Contentful returns an asset ID
5. React app calls `PUT /api/users/:id` with the new `avatar_asset_id`
6. Worker stores it in Neon

This keeps binary data off the Worker entirely.

## Environment Variables

| Variable | Where | Purpose |
|---|---|---|
| `CONTENTFUL_SPACE_ID` | Wrangler secret | Space identifier |
| `CONTENTFUL_DELIVERY_TOKEN` | Wrangler secret | Read-only Content Delivery API token |
| `CONTENTFUL_MANAGEMENT_TOKEN` | Wrangler secret | Write access for uploads (keep minimal scope) |

Store all three as Wrangler secrets. Add them to `.dev.vars` for local development (gitignored).

## Image Optimization Parameters

Contentful Images API supports these query params, use them on every `<img>`:
- `w=` width in pixels
- `h=` height (optional, use with `fit=`)
- `fm=webp` format (prefer `webp`, fallback `jpg`)
- `fit=thumb` for avatar crops (square, centered)
- `q=80` quality (default is fine, 80 saves bandwidth)

Always request the smallest size that looks good at the display size. Don't load a 1200px image for a 48px avatar.
