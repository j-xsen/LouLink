# Database — Neon (PostgreSQL)

## Why Neon

Neon is a serverless PostgreSQL provider. It's chosen here because:
- Serverless-first: scales to zero, no idle cost for a community app
- Standard PostgreSQL — no vendor-specific query language
- Works well with Cloudflare Workers via the `@neondatabase/serverless` driver, which uses HTTP or WebSocket transport instead of the TCP-based `pg` driver (which Workers can't use)
- Generous free tier

## Connection from Workers

Use `@neondatabase/serverless` (not `pg`). Workers do not support raw TCP, so the standard `pg` package will not work.

```ts
import { neon } from "@neondatabase/serverless";

const sql = neon(env.DATABASE_URL);
const rows = await sql`SELECT * FROM users WHERE verified = true`;
```

The `DATABASE_URL` connection string is stored as a Cloudflare Worker secret:
```bash
wrangler secret put DATABASE_URL
```

After adding the secret, run `pnpm cf-typegen` to surface it in the `Env` type.

## Schema

### `users`
| Column | Type | Notes |
|---|---|---|
| `id` | `uuid` PRIMARY KEY | Default `gen_random_uuid()` |
| `username` | `text` UNIQUE NOT NULL | URL slug, e.g. `loulink.com/jaxart` |
| `display_name` | `text` NOT NULL | Public name shown on profile and directory |
| `bio` | `text` | Short description, ~160 chars recommended |
| `avatar_asset_id` | `text` | Contentful asset ID (not a URL — resolved at render time) |
| `email` | `text` UNIQUE NOT NULL | Private, never shown publicly |
| `verified` | `boolean` DEFAULT false | Admin-controlled Louisville verification flag |
| `category` | `text` | e.g. `music`, `visual-art`, `food`, `retail`, `community` |
| `created_at` | `timestamptz` DEFAULT now() | |
| `updated_at` | `timestamptz` DEFAULT now() | |

### `links`
| Column | Type | Notes |
|---|---|---|
| `id` | `uuid` PRIMARY KEY | |
| `user_id` | `uuid` NOT NULL | FK → `users.id` ON DELETE CASCADE |
| `label` | `text` NOT NULL | Display text, e.g. "My Bandcamp" |
| `url` | `text` NOT NULL | The external URL |
| `sort_order` | `integer` NOT NULL DEFAULT 0 | Controls display order |
| `visible` | `boolean` DEFAULT true | User can hide links without deleting |
| `created_at` | `timestamptz` DEFAULT now() | |

### `sessions` (if doing custom auth)
| Column | Type | Notes |
|---|---|---|
| `id` | `uuid` PRIMARY KEY | Session token |
| `user_id` | `uuid` NOT NULL | FK → `users.id` |
| `expires_at` | `timestamptz` NOT NULL | |
| `created_at` | `timestamptz` DEFAULT now() | |

## Indexes

```sql
CREATE INDEX ON users (verified) WHERE verified = true;
CREATE INDEX ON links (user_id, sort_order);
```

The partial index on `users` makes the home page query (all verified users) efficient.

## Migrations

Migrations are plain SQL files. Run them against the Neon database using the Neon console or a migration CLI. No ORM is assumed — use raw SQL with the `neon()` tagged template for type-safe-ish queries, or add Drizzle ORM if typed queries become important.

## Environment Variables

| Variable | Where | Purpose |
|---|---|---|
| `DATABASE_URL` | Wrangler secret | Neon connection string |

Never commit `DATABASE_URL` to the repo. It lives only as a Wrangler secret and in `.dev.vars` locally (which is gitignored).
