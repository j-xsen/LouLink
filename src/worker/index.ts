import { Hono } from "hono";
import { requireAuth } from "./auth";
import { createDb } from "./db";

const USERNAME_RE = /^[a-z0-9][a-z0-9_-]{1,28}[a-z0-9]$/;

const app = new Hono<{ Bindings: Env; Variables: { userId: string } }>();

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
  const body = await c.req.json<{ username: string; display_name: string }>();
  const username = body.username?.toLowerCase().trim();
  const display_name = body.display_name?.trim();

  if (!USERNAME_RE.test(username ?? "")) {
    return c.json({ error: "Invalid username" }, 400);
  }
  if (!display_name) {
    return c.json({ error: "Display name is required" }, 400);
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
    return c.json({ profile });
  } catch (e) {
    if ((e as any).code === "23505") return c.json({ error: "Username taken" }, 409);
    throw e;
  }
});

app.put("/api/me/username", requireAuth, async (c) => {
  const userId = c.get("userId");
  const body = await c.req.json<{ username: string }>();
  const username = body.username?.toLowerCase().trim();

  if (!USERNAME_RE.test(username ?? "")) {
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
    if ((e as any).code === "23505") return c.json({ error: "Username taken" }, 409);
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

export default app;
