# Authentication

## Approach

Authentication is handled by **Neon Auth**, powered by [Better Auth](https://www.better-auth.com/). It manages registration, login, OAuth providers, and session lifecycle — no custom session tables or password hashing in this app.

Better Auth issues JWTs. The Worker verifies them using the JWKS URL provided by Neon Auth, accepting RS256/RS384/RS512, ES256/ES384/ES512, and EdDSA — but only asymmetric algorithms (HS\* and `alg:none` are rejected). The JWT is fetched from the Neon Auth `/token` endpoint via `authClient.$fetch<{ token: string }>("/token")` (not the opaque session token returned by `getSession()`).

## Environment Variables

Both URLs come from the Neon Console → Auth section:

| Variable | Value | Purpose |
|---|---|---|
| `DATABASE_URL` | Neon Console → Connection string | Neon PostgreSQL connection |
| `AUTH_JWKS_URL` | `https://…neonauth…/neondb/auth/.well-known/jwks.json` | Worker uses this to verify JWTs |

The **Auth URL** (`https://…neonauth…/neondb/auth`) is for the **frontend** React app (Better Auth client SDK). It is passed as the `VITE_AUTH_URL` environment variable and read via `import.meta.env.VITE_AUTH_URL` in `src/react-app/auth-client.ts`. It is not a Wrangler secret.

For local dev, put these in `.dev.vars` (gitignored). For production:
```bash
wrangler secret put DATABASE_URL
wrangler secret put AUTH_JWKS_URL
```

## How It Works

1. The React frontend uses the Better Auth client SDK (initialized with the Auth URL) to handle login/signup and obtain a JWT.
2. The frontend sends the JWT in the `Authorization: Bearer <token>` header on protected API calls.
3. The Worker's `requireAuth` middleware verifies the JWT signature using the JWKS URL and extracts the user ID from the `sub` claim.
4. On first login, the user exists in `neon_auth.user` but has no row in `public.profiles`. The app redirects them to `/onboarding` to pick a username and complete profile setup.

## `requireAuth` Middleware

The middleware lives at `src/worker/auth.ts`. It rejects requests without a valid JWT with `401`.

```ts
import { requireAuth } from "./auth";

app.put("/api/profiles/:username", requireAuth, async (c) => {
  const userId = c.get("userId"); // Better Auth user ID
  // ...
});
```

## `optionalAuth` Middleware

Also in `src/worker/auth.ts`. Like `requireAuth` but never rejects — if a valid JWT is present it sets `c.get("userId")`; if absent or invalid it sets it to `null`. Used on public analytics tracking routes so the handler can detect owner requests and drop self-views/self-clicks without blocking unauthenticated visitors.

```ts
import { optionalAuth } from "./auth";

app.post("/api/track/view", optionalAuth, async (c) => {
  const userId = c.get("userId"); // string | null
  // ...
});
```

## Onboarding Flow

After first login, Better Auth has a user record but `public.profiles` does not. The frontend detects this via `GET /api/me` returning `{ profile: null }` and keeps the user on the home page until they complete signup.

Profile creation happens via `POST /api/onboarding` (auth-gated), which inserts a row into `public.profiles` and optionally inserts initial links. There is no `/onboarding` frontend route — the `SignUp` page and `CreatePage` both call this endpoint.

Protected routes that require a profile should detect missing profiles:

```ts
const [profile] = await sql`
  SELECT user_id FROM public.profiles WHERE user_id = ${userId}
`;
if (!profile) return c.json({ error: "Profile not set up", code: "ONBOARDING_REQUIRED" }, 403);
```

## Password Reset Flow

Better Auth handles the full email-based reset flow — no custom Worker routes are needed.

1. User visits `/forgot-password`, enters their email.
2. The frontend calls `authClient.$fetch("/request-password-reset", { method: "POST", body: { email, redirectTo: ".../reset-password" } })`. Better Auth emails a time-limited reset link.
3. The link lands on `/reset-password?token=<token>`. The page reads `?token` from the URL; if absent it shows an "invalid link" message.
4. User submits a new password. The frontend calls `authClient.$fetch("/reset-password", { method: "POST", body: { newPassword, token } })`.
5. On success, the user is redirected to `/signin` with a notice. On failure (expired token, etc.), an inline error is shown.

Both pages carry `noindex` meta and are wrapped in `RedirectIfAuthed` (`/forgot-password` only — `/reset-password` is not, since a logged-in user with a valid token should still be able to reset).

## Authorization Rules

- A user may only edit their own profile and links — compare `c.get("userId")` to the `profiles.user_id`
- The `verified` flag may only be set by an admin — gate it behind a `requireAdmin` middleware
- Profile pages and the directory listing are fully public — no auth required
- Admin routes (`GET /api/admin/users`, `PATCH /api/admin/profiles/:username`, `DELETE /api/admin/profiles/:username`) require `Authorization: Bearer <ADMIN_KEY>`. This is a plain string comparison against the `ADMIN_KEY` Wrangler secret — not a JWT. Handled by `requireAdmin` in `src/worker/auth.ts`. The admin dashboard frontend (`/admin`) is localhost-only.
