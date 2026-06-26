import type { Hono } from "hono";
import { requireAdmin } from "../auth";
import { createDb } from "../db";
import { bustProfileCache, readJson } from "../lib/utils";

type App = Hono<{ Bindings: Env; Variables: { userId: string } }>;

const VALID_CATEGORIES = new Set(["music", "visual-art", "food", "retail", "community"]);

export function registerAdminRoutes(app: App): void {
  app.get("/api/admin/users", requireAdmin, async (c) => {
    const sql = createDb(c.env.DATABASE_URL);
    const rows = await sql`
      SELECT user_id AS id, username, display_name, verified, categories, hide_from_directory, created_at
      FROM public.profiles
      ORDER BY created_at DESC
    `;
    return c.json({ users: rows });
  });

  app.patch("/api/admin/profiles/:username", requireAdmin, async (c) => {
    const username = c.req.param("username").toLowerCase().trim();
    const body = await readJson<{ verified?: unknown; categories?: unknown }>(c);
    if (!body) return c.json({ error: "Invalid request body" }, 400);

    const updates: Record<string, unknown> = {};
    if ("verified" in body) {
      if (typeof body.verified !== "boolean") return c.json({ error: "verified must be a boolean" }, 400);
      updates.verified = body.verified;
    }
    if ("categories" in body) {
      if (!Array.isArray(body.categories)) return c.json({ error: "categories must be an array" }, 400);
      const cats = body.categories as unknown[];
      if (!cats.every((c) => typeof c === "string" && VALID_CATEGORIES.has(c)))
        return c.json({ error: `Invalid category. Allowed: ${[...VALID_CATEGORIES].join(", ")}` }, 400);
      updates.categories = cats;
    }
    if (Object.keys(updates).length === 0) return c.json({ error: "No fields to update" }, 400);

    const sql = createDb(c.env.DATABASE_URL);
    let profile: Record<string, unknown> | undefined;

    if ("verified" in updates && "categories" in updates) {
      const [row] = await sql`
        UPDATE public.profiles
        SET verified = ${updates.verified as boolean}, categories = ${updates.categories as string[]}, updated_at = now()
        WHERE username = ${username}
        RETURNING username, display_name, verified, categories
      `;
      profile = row as Record<string, unknown> | undefined;
    } else if ("verified" in updates) {
      const [row] = await sql`
        UPDATE public.profiles
        SET verified = ${updates.verified as boolean}, updated_at = now()
        WHERE username = ${username}
        RETURNING username, display_name, verified, categories
      `;
      profile = row as Record<string, unknown> | undefined;
    } else {
      const [row] = await sql`
        UPDATE public.profiles
        SET categories = ${updates.categories as string[]}, updated_at = now()
        WHERE username = ${username}
        RETURNING username, display_name, verified, categories
      `;
      profile = row as Record<string, unknown> | undefined;
    }

    if (!profile) return c.json({ error: "Profile not found" }, 404);
    await bustProfileCache(new URL(c.req.url).origin, username);
    return c.json({ profile });
  });

  app.delete("/api/admin/profiles/:username", requireAdmin, async (c) => {
    const username = c.req.param("username").toLowerCase().trim();
    const sql = createDb(c.env.DATABASE_URL);
    const [deleted] = await sql`
      DELETE FROM public.profiles WHERE username = ${username} RETURNING username, user_id
    `;
    if (!deleted) return c.json({ error: "Profile not found" }, 404);
    await bustProfileCache(new URL(c.req.url).origin, username);
    return c.json({ deleted: { username: deleted.username, user_id: deleted.user_id } });
  });
}
