import { Hono } from "hono";
import { secureHeaders } from "hono/secure-headers";
import { requireAuth } from "./auth";
import { createDb } from "./db";

const USERNAME_RE = /^[a-z0-9][a-z0-9_-]{1,28}[a-z0-9]$/;
const MAX_DISPLAY_NAME = 100;
const MAX_LINKS = 50;
const MAX_LINK_TITLE = 100;
const MAX_LINK_URL = 2048;

const app = new Hono<{ Bindings: Env; Variables: { userId: string } }>();

app.use("/api/*", secureHeaders());

// Never leak internal error details (DB messages, stack traces) to clients.
app.onError((err, c) => {
  console.error(err);
  return c.json({ error: "Internal server error" }, 500);
});

async function readJson<T>(c: { req: { json: () => Promise<T> } }): Promise<T | null> {
  try {
    return await c.req.json();
  } catch {
    return null;
  }
}

// Only http(s) URLs are accepted — parsing with new URL() blocks javascript:,
// data:, and other schemes that a prefix regex alone can miss.
function sanitizeUrl(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  if (trimmed.length === 0 || trimmed.length > MAX_LINK_URL) return null;
  try {
    const url = new URL(trimmed);
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    return trimmed;
  } catch {
    return null;
  }
}

type SanitizedItem =
  | { kind: "link"; title: string; url: string; icon?: string }
  | { kind: "header"; title: string };

function sanitizeItems(raw: unknown): SanitizedItem[] | null {
  if (raw == null) return [];
  if (!Array.isArray(raw)) return null;
  if (raw.length > MAX_LINKS) return null;
  const items: SanitizedItem[] = [];
  for (const l of raw) {
    if (typeof l !== "object" || l === null) return null;
    const kind = l.kind === "header" ? "header" : "link";
    const title = typeof l.title === "string" ? l.title.trim() : "";
    if (!title || title.length > MAX_LINK_TITLE) continue;
    if (kind === "header") {
      items.push({ kind: "header", title });
    } else {
      const url = sanitizeUrl(l.url);
      if (!url) continue;
      const icon = typeof l.icon === "string" && l.icon ? l.icon : undefined;
      items.push({ kind: "link", title, url, ...(icon ? { icon } : {}) });
    }
  }
  return items;
}

app.get("/api/", (c) => c.json({ name: "LouLink" }));

app.get("/api/me", requireAuth, async (c) => {
  const userId = c.get("userId");
  const sql = createDb(c.env.DATABASE_URL);
  const [profile] = await sql`
    SELECT username, display_name, bio, category, verified
    FROM public.profiles WHERE user_id = ${userId}
  `;
  return c.json({ profile: profile ?? null });
});

app.post("/api/onboarding", requireAuth, async (c) => {
  const userId = c.get("userId");
  const body = await readJson<{
    username?: unknown;
    display_name?: unknown;
    links?: unknown;
  }>(c);
  if (!body || typeof body !== "object") {
    return c.json({ error: "Invalid request body" }, 400);
  }

  const username =
    typeof body.username === "string" ? body.username.toLowerCase().trim() : "";
  const display_name =
    typeof body.display_name === "string" ? body.display_name.trim() : "";

  if (!USERNAME_RE.test(username)) {
    return c.json({ error: "Invalid username" }, 400);
  }
  if (!display_name || display_name.length > MAX_DISPLAY_NAME) {
    return c.json({ error: "Display name is required (max 100 characters)" }, 400);
  }
  const items = sanitizeItems(body.links);
  if (items === null) {
    return c.json({ error: "Invalid links" }, 400);
  }

  const sql = createDb(c.env.DATABASE_URL);
  const [existing] = await sql`SELECT user_id FROM public.profiles WHERE user_id = ${userId}`;
  if (existing) return c.json({ error: "Profile already exists" }, 409);

  try {
    const [profile] = await sql`
      INSERT INTO public.profiles (user_id, username, display_name)
      VALUES (${userId}, ${username}, ${display_name})
      RETURNING username, display_name
    `;

    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (item.kind === "header") {
        await sql`
          INSERT INTO public.links (user_id, kind, title, url, sort_order)
          VALUES (${userId}, 'header', ${item.title}, NULL, ${i})
        `;
      } else {
        await sql`
          INSERT INTO public.links (user_id, kind, title, url, icon, sort_order)
          VALUES (${userId}, 'link', ${item.title}, ${item.url}, ${item.icon ?? null}, ${i})
        `;
      }
    }

    return c.json({ profile });
  } catch (e) {
    if ((e as { code?: string }).code === "23505") {
      return c.json({ error: "Username taken" }, 409);
    }
    throw e;
  }
});

app.put("/api/me/links", requireAuth, async (c) => {
  const userId = c.get("userId");
  const body = await readJson<{ links?: unknown }>(c);
  const items = sanitizeItems(body?.links);
  if (items === null) return c.json({ error: "Invalid links" }, 400);

  const sql = createDb(c.env.DATABASE_URL);
  await sql`DELETE FROM public.links WHERE user_id = ${userId}`;
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    if (item.kind === "header") {
      await sql`
        INSERT INTO public.links (user_id, kind, title, url, sort_order)
        VALUES (${userId}, 'header', ${item.title}, NULL, ${i})
      `;
    } else {
      await sql`
        INSERT INTO public.links (user_id, kind, title, url, icon, sort_order)
        VALUES (${userId}, 'link', ${item.title}, ${item.url}, ${item.icon ?? null}, ${i})
      `;
    }
  }
  return c.json({ ok: true });
});

app.put("/api/me/username", requireAuth, async (c) => {
  const userId = c.get("userId");
  const body = await readJson<{ username?: unknown }>(c);
  const username =
    body && typeof body.username === "string"
      ? body.username.toLowerCase().trim()
      : "";

  if (!USERNAME_RE.test(username)) {
    return c.json({ error: "Invalid username" }, 400);
  }

  const sql = createDb(c.env.DATABASE_URL);
  try {
    const [profile] = await sql`
      UPDATE public.profiles SET username = ${username}, updated_at = now()
      WHERE user_id = ${userId}
      RETURNING username, display_name
    `;
    if (!profile) return c.json({ error: "Profile not found" }, 404);
    return c.json({ profile });
  } catch (e) {
    if ((e as { code?: string }).code === "23505") {
      return c.json({ error: "Username taken" }, 409);
    }
    throw e;
  }
});

app.get("/api/username/:username/available", async (c) => {
  const username = c.req.param("username").toLowerCase();
  if (!USERNAME_RE.test(username)) return c.json({ available: false, reason: "invalid" });

  const sql = createDb(c.env.DATABASE_URL);
  const [row] = await sql`SELECT 1 FROM public.profiles WHERE username = ${username} LIMIT 1`;
  return c.json({ available: !row });
});

app.get("/api/profile/:username", async (c) => {
  const username = c.req.param("username").toLowerCase();
  if (!USERNAME_RE.test(username)) return c.json({ error: "Not found" }, 404);

  const sql = createDb(c.env.DATABASE_URL);
  const [profile] = await sql`
    SELECT p.username, p.display_name, p.bio, p.category, p.verified
    FROM public.profiles p
    WHERE p.username = ${username}
  `;
  if (!profile) return c.json({ error: "Not found" }, 404);

  const links = await sql`
    SELECT kind, title, url, icon
    FROM public.links
    WHERE user_id = (SELECT user_id FROM public.profiles WHERE username = ${username})
      AND visible = true
    ORDER BY sort_order ASC
  `;

  return c.json({ profile, links });
});

export default app;
