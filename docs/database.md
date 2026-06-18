# Database — Neon (PostgreSQL)

## Why Neon

Neon is a serverless PostgreSQL provider. It's chosen here because:
- Serverless-first: scales to zero, no idle cost for a community app
- Standard PostgreSQL — no vendor-specific query language
- Works well with Cloudflare Workers via the `@neondatabase/serverless` driver, which uses HTTP or WebSocket transport instead of the TCP-based `pg` driver (which Workers can't use)
- Neon Auth (Better Auth) integration manages user records directly in the database
- Generous free tier

## Connection from Workers

Use `@neondatabase/serverless` (not `pg`). Workers do not support raw TCP, so the standard `pg` package will not work.

The helper lives at `src/worker/db.ts`:

```ts
import { createDb } from "./db";

// Inside a Hono handler:
const sql = createDb(c.env.DATABASE_URL);
const rows = await sql`SELECT * FROM public.profiles WHERE verified = true`;
```

Call `createDb` inside each request handler — not at module scope. The `DATABASE_URL` connection string is stored as a Cloudflare Worker secret:

```bash
wrangler secret put DATABASE_URL
```

After adding the secret, run `pnpm cf-typegen` to surface it in the `Env` type. For local dev, add it to `.dev.vars` (gitignored).

## Auth Table — `neon_auth.users_sync` (read-only)

Neon Auth (powered by Better Auth) manages this table. **Do not write to it directly.** The table name is `users_sync` (not `user`).

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid` PRIMARY KEY | Better Auth user ID |
| `name` | `text` | Display name |
| `email` | `text` | User's email address |
| `email_verified` | `boolean` | Whether the email has been verified |
| `image` | `text` | Avatar URL from OAuth provider, if any |
| `created_at` | `timestamptz` | |
| `updated_at` | `timestamptz` | |
| `deleted_at` | `timestamptz` | Soft-delete timestamp — always filter `WHERE deleted_at IS NULL` |

Better Auth also creates session, account, and related tables in the `neon_auth` schema — all managed automatically.

## Schema

### `public.profiles`

One row per authenticated user. Created during onboarding after first login.

| Column | Type | Notes |
|---|---|---|
| `user_id` | `uuid` PRIMARY KEY | Matches `neon_auth.user.id` — no FK constraint (Neon Auth schema is externally managed) |
| `username` | `text` UNIQUE NOT NULL | URL slug — `loulink.com/<username>`, 3–30 chars, lowercase alphanumeric with `-` and `_` |
| `display_name` | `text` NOT NULL | Public name shown on profile and directory |
| `bio` | `text` | Short description, max 300 chars |
| `avatar_asset_id` | `text` | R2 object key (e.g. `avatars/<user_id>/<timestamp>.jpg`) — resolved to a URL via `https://loul.ink/avatars/<key>` |
| `categories` | `text[]` | Array of granular subcategory slugs. 25 valid values grouped under 5 parent labels — see category hierarchy in `docs/features.md`. Validated server-side in `PUT /api/me/categories`. Admin PATCH uses simplified 5-item parent slugs only. |
| `verified` | `boolean` DEFAULT false | Admin-controlled Louisville verification flag |
| `hide_from_directory` | `boolean` DEFAULT false | Verified users can opt out of the home page directory; only honoured when `verified = true` |
| `social_links` | `jsonb` DEFAULT `'{}'` | Platform → URL map for profile header social icons. Allowed keys: `YouTube`, `Instagram`, `Facebook`, `Twitter`, `Twitch`, `Spotify`, `Bandcamp`, `SoundCloud` |
| `accent_color` | `text` | Pipe-delimited appearance string: `themeKeyOrHex\|headerHex\|mono\|shape\|cardColor\|cardTextColor`. Theme keys: `ink`, `bluegrass`, `river`, `bourbon`, `midnight`, `terminal`. Avatar shapes: `circle`, `1`, `5`, `6`. Parsed/built by `parseAccentColor()` / `buildAccentColor()` in `src/react-app/types.ts`. |
| `created_at` | `timestamptz` DEFAULT now() | |
| `updated_at` | `timestamptz` DEFAULT now() | Auto-updated by trigger |

Email is not stored here — read it by joining `neon_auth.user`.

### `public.links`

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid` PRIMARY KEY | Default `gen_random_uuid()` |
| `user_id` | `uuid` NOT NULL | FK → `public.profiles(user_id)` ON DELETE CASCADE |
| `kind` | `text` NOT NULL DEFAULT `'link'` | `'link'` or `'header'` — headers are section dividers with no URL |
| `title` | `text` NOT NULL | Display text, e.g. "My Bandcamp" |
| `url` | `text` | External URL — required when `kind = 'link'`, NULL when `kind = 'header'` |
| `icon` | `text` | Icon name from the app's ICON_MAP (brand icons: `Instagram`, `YouTube`, etc.; general: `Globe`, `Mail`, etc.) |
| `sort_order` | `integer` NOT NULL DEFAULT 0 | Controls display order |
| `visible` | `boolean` DEFAULT true | User can hide links without deleting |
| `created_at` | `timestamptz` DEFAULT now() | |
| `updated_at` | `timestamptz` DEFAULT now() | Auto-updated by trigger |

### `public.page_view_events`

Raw analytics events. Rows are purged after 30 days by a nightly Cron Trigger (see Analytics in `docs/features.md`). No IP addresses are stored — geolocation comes from `request.cf` on the Worker.

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid` PRIMARY KEY | Default `gen_random_uuid()` |
| `profile_id` | `uuid` NOT NULL | FK → `public.profiles(user_id)` ON DELETE CASCADE |
| `occurred_at` | `timestamptz` DEFAULT now() | When the page view happened |
| `country` | `text` | From `request.cf.country` |
| `city` | `text` | From `request.cf.city` |
| `browser` | `text` | Parsed from User-Agent |
| `os` | `text` | Parsed from User-Agent |
| `device_type` | `text` | `desktop`, `mobile`, or `tablet` |
| `referrer` | `text` | From `Referer` header, nullable |
| `visit_kind` | `text` | `direct`, `social`, `search`, or `referral` — classified from referrer |
| `duration_ms` | `integer` | Time on page in ms, sent via `navigator.sendBeacon` on unmount; capped at 4 hours |

### `public.page_view_daily`

Aggregated rollups kept indefinitely. One row per profile per calendar day, written by the nightly Cron Trigger before raw events are purged.

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid` PRIMARY KEY | Default `gen_random_uuid()` |
| `profile_id` | `uuid` NOT NULL | FK → `public.profiles(user_id)` ON DELETE CASCADE |
| `day` | `date` NOT NULL | The calendar day being summarized |
| `total_views` | `integer` NOT NULL | Total page views that day |
| `by_country` | `jsonb` | `{ "US": 42, "CA": 3 }` |
| `by_city` | `jsonb` | `{ "Louisville": 38, "Lexington": 4 }` |
| `by_browser` | `jsonb` | `{ "Chrome": 30, "Safari": 12 }` |
| `by_os` | `jsonb` | `{ "iOS": 20, "Android": 10 }` |
| `by_device` | `jsonb` | `{ "mobile": 25, "desktop": 17 }` |
| `by_referrer` | `jsonb` | `{ "instagram.com": 18, "direct": 24 }` |
| `by_visit_kind` | `jsonb` | `{ "social": 18, "direct": 24, "search": 5, "referral": 3 }` |
| `avg_duration_ms` | `integer` | Weighted average time on page for that day, nullable |

Unique constraint on `(profile_id, day)` — each day is written once and never updated.

### `public.link_click_events`

Raw link click events. Rows are purged after 30 days alongside page view events. `profile_id` is denormalized to avoid joins in the nightly cron.

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid` PRIMARY KEY | Default `gen_random_uuid()` |
| `link_id` | `uuid` NOT NULL | FK → `public.links(id)` ON DELETE CASCADE |
| `profile_id` | `uuid` NOT NULL | FK → `public.profiles(user_id)` ON DELETE CASCADE — denormalized |
| `occurred_at` | `timestamptz` DEFAULT now() | When the click happened |
| `country` | `text` | From `request.cf.country` |
| `referrer` | `text` | From `Referer` header, nullable |
| `visit_kind` | `text` | `direct`, `social`, `search`, or `referral` |

### `public.link_click_daily`

Aggregated link click rollups kept indefinitely. One row per link per calendar day.

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid` PRIMARY KEY | Default `gen_random_uuid()` |
| `link_id` | `uuid` NOT NULL | FK → `public.links(id)` ON DELETE CASCADE |
| `profile_id` | `uuid` NOT NULL | FK → `public.profiles(user_id)` ON DELETE CASCADE |
| `day` | `date` NOT NULL | The calendar day being summarized |
| `total_clicks` | `integer` NOT NULL | Total clicks on this link that day |
| `by_country` | `jsonb` | `{ "US": 10, "CA": 2 }` |

Unique constraint on `(link_id, day)`.

## Indexes

```sql
-- profiles
CREATE UNIQUE INDEX profiles_username_idx ON public.profiles (username);
CREATE INDEX profiles_verified_category_idx ON public.profiles (categories) WHERE verified = true;

-- links
CREATE INDEX links_user_sort_idx ON public.links (user_id, sort_order ASC);

-- page_view_events
CREATE INDEX page_view_events_profile_time_idx ON public.page_view_events (profile_id, occurred_at DESC);
CREATE INDEX page_view_events_occurred_at_idx  ON public.page_view_events (occurred_at ASC);

-- page_view_daily
CREATE UNIQUE INDEX page_view_daily_profile_day_idx ON public.page_view_daily (profile_id, day);
CREATE INDEX        page_view_daily_day_idx          ON public.page_view_daily (day ASC);

-- link_click_events
CREATE INDEX link_click_events_link_time_idx    ON public.link_click_events (link_id, occurred_at DESC);
CREATE INDEX link_click_events_profile_time_idx ON public.link_click_events (profile_id, occurred_at DESC);
CREATE INDEX link_click_events_occurred_at_idx  ON public.link_click_events (occurred_at ASC);

-- link_click_daily
CREATE UNIQUE INDEX link_click_daily_link_day_idx    ON public.link_click_daily (link_id, day);
CREATE INDEX        link_click_daily_profile_day_idx ON public.link_click_daily (profile_id, day DESC);
```

The partial index on `profiles` makes the home page directory query (all verified profiles) efficient. The `occurred_at ASC` indexes on raw event tables support the nightly cron's range-delete queries.

## Common Query Patterns

**Profile page** — join to get email:
```sql
SELECT p.*, u.email
FROM public.profiles p
JOIN neon_auth.users_sync u ON u.id = p.user_id
WHERE p.username = $1 AND u.deleted_at IS NULL
```

**Home page directory** — all verified profiles:
```sql
SELECT username, display_name, bio, categories, avatar_asset_id
FROM public.profiles
WHERE verified = true
ORDER BY display_name
```

**Profile links** — ordered for display (includes headers):
```sql
SELECT kind, title, url, icon
FROM public.links
WHERE user_id = $1 AND visible = true
ORDER BY sort_order ASC
```

## Migrations

Migrations are plain SQL files in `db/migrations/`. Run them against the Neon database using the Neon console SQL editor or `psql`. No ORM is assumed — raw SQL with the `neon()` tagged template is the default.

## Environment Variables

| Variable | Where | Purpose |
|---|---|---|
| `DATABASE_URL` | Wrangler secret | Neon connection string |

Never commit `DATABASE_URL` to the repo. It lives only as a Wrangler secret and in `.dev.vars` locally (which is gitignored).
