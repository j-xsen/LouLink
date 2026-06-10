# Authentication

## Approach

Authentication is session-based. Users log in with email + password (or OAuth in the future). The Worker issues a session token stored as an HttpOnly cookie, and validates it on protected routes.

**Why not a third-party auth service:** LouLink is a community-focused app with a tight local identity. Keeping auth in-house avoids external dependencies for login, keeps user data local, and keeps costs at zero. If this becomes a burden, migrating to Clerk or a similar service is straightforward.

## Session Flow

1. `POST /api/auth/register` — create account, hash password (bcrypt or similar), insert user row, create session, set cookie
2. `POST /api/auth/login` — verify credentials, create session row, set `Set-Cookie: session=<token>; HttpOnly; Secure; SameSite=Strict`
3. `POST /api/auth/logout` — delete session row, clear cookie
4. All protected routes call a `requireAuth` middleware that reads the cookie, validates the session against the DB, and attaches the user to context

## Password Hashing

Workers support Web Crypto API. Use PBKDF2 or bcrypt via a Wasm port. Do not store plaintext passwords.

```ts
// hashing with Web Crypto (PBKDF2)
async function hashPassword(password: string): Promise<string> { ... }
async function verifyPassword(password: string, hash: string): Promise<boolean> { ... }
```

## Hono Middleware Pattern

```ts
const requireAuth: MiddlewareHandler = async (c, next) => {
  const sessionId = getCookie(c, "session");
  if (!sessionId) return c.json({ error: "Unauthorized" }, 401);
  const user = await getSessionUser(sessionId, c.env);
  if (!user) return c.json({ error: "Unauthorized" }, 401);
  c.set("user", user);
  await next();
};

app.put("/api/users/:id", requireAuth, async (c) => {
  const user = c.get("user");
  // ...
});
```

## Authorization Rules

- A user may only edit their own profile and links (`user.id === param.id`)
- The `verified` flag may only be set by an admin — add an `is_admin` boolean to the `users` table and check it in a separate `requireAdmin` middleware
- Profile pages and the directory listing are fully public — no auth required

## Cookie Configuration

```
HttpOnly    — JS cannot read the token, mitigates XSS
Secure      — HTTPS only (Cloudflare always terminates TLS)
SameSite=Strict — mitigates CSRF for same-origin requests
Path=/api   — scoped to API, not served with static assets
```

## Future: OAuth

If added later, OAuth providers (Google, GitHub) would flow through `/api/auth/oauth/:provider`. The end result is the same: a session row in Neon and an HttpOnly cookie. The user record gets a nullable `oauth_provider` + `oauth_id` column pair instead of a password hash.
