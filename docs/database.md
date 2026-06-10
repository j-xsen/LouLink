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

## Auth Table — `neon_auth.user` (read-only)

Neon Auth (powered by Better Auth) manages this table. **Do not write to it directly.**

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid` PRIMARY KEY | Better Auth user ID |
| `name` | `text` | Display name |
| `email` | `text` | User's email address |
| `emailVerified` | `boolean` | Whether the email has been verified |
| `image` | `text` | Avatar URL from OAuth provider, if any |
| `createdAt` | `timestamptz` | |
| `updatedAt` | `timestamptz` | |
| `role` | `text` | |
| `banned` | `boolean` | |

Better Auth also creates `neon_auth.session`, `neon_auth.account`, `neon_auth.organization`, and related tables — all managed automatically.

## Schema

### `public.profiles`

One row per authenticated user. Created during onboarding after first login.

| Column | Type | Notes |
|---|---|---|
| `user_id` | `uuid` PRIMARY KEY | Matches `neon_auth.user.id` — no FK constraint (Neon Auth schema is externally managed) |
| `username` | `text` UNIQUE NOT NULL | URL slug — `loulink.com/<username>`, 3–30 chars, lowercase alphanumeric with `-` and `_` |
| `display_name` | `text` NOT NULL | Public name shown on profile and directory |
| `bio` | `text` | Short description, max 300 chars |
| `avatar_asset_id` | `text` | Contentful asset ID (not a URL — resolved at render time via Contentful CDN) |
| `category` | `profile_category` enum | `music`, `visual-art`, `food`, `retail`, `community` |
| `verified` | `boolean` DEFAULT false | Admin-controlled Louisville verification flag |
| `created_at` | `timestamptz` DEFAULT now() | |
| `updated_at` | `timestamptz` DEFAULT now() | Auto-updated by trigger |

Email is not stored here — read it by joining `neon_auth.user`.

### `public.links`

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid` PRIMARY KEY | Default `gen_random_uuid()` |
| `user_id` | `uuid` NOT NULL | FK → `public.profiles(user_id)` ON DELETE CASCADE |
| `title` | `text` NOT NULL | Display text, e.g. "My Bandcamp" |
| `url` | `text` NOT NULL | The external URL — must start with `http://` or `https://` |
| `icon` | `text` | Lucide React icon name, e.g. `"Instagram"`, `"Globe"`, `"Music"` |
| `sort_order` | `integer` NOT NULL DEFAULT 0 | Controls display order |
| `visible` | `boolean` DEFAULT true | User can hide links without deleting |
| `created_at` | `timestamptz` DEFAULT now() | |
| `updated_at` | `timestamptz` DEFAULT now() | Auto-updated by trigger |

## Indexes

```sql
CREATE UNIQUE INDEX profiles_username_idx ON public.profiles (username);
CREATE INDEX profiles_verified_category_idx ON public.profiles (category) WHERE verified = true;
CREATE INDEX links_user_sort_idx ON public.links (user_id, sort_order ASC);
```

The partial index on `profiles` makes the home page directory query (all verified profiles) efficient.

## Common Query Patterns

**Profile page** — join to get email:
```sql
SELECT p.*, u.email, u."emailVerified"
FROM public.profiles p
JOIN neon_auth.user u ON u.id = p.user_id
WHERE p.username = $1
```

**Home page directory** — verified profiles by category:
```sql
SELECT p.*, u.name
FROM public.profiles p
JOIN neon_auth.user u ON u.id = p.user_id
WHERE p.verified = true
  AND ($1::profile_category IS NULL OR p.category = $1)
ORDER BY p.display_name
```

**Profile links** — ordered for display:
```sql
SELECT * FROM public.links
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
