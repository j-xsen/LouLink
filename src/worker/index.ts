import { Hono } from "hono";
import { secureHeaders } from "hono/secure-headers";
import { handleScheduled } from "./cron";
import { registerMeRoutes } from "./routes/me";
import { registerProfileRoutes } from "./routes/profile";
import { registerOgRoutes } from "./routes/og";
import { registerAdminRoutes } from "./routes/admin";
import { registerAnalyticsRoutes } from "./routes/analytics";
import { registerSsrRoutes } from "./routes/ssr";

const app = new Hono<{ Bindings: Env; Variables: { userId: string } }>();

app.use("/api/*", secureHeaders());

app.onError((err, c) => {
  console.error(err);
  return c.json({ error: "Internal server error" }, 500);
});

app.get("/api/", (c) => c.json({ name: "LouLink" }));

registerMeRoutes(app);
registerProfileRoutes(app);
registerOgRoutes(app);
registerAdminRoutes(app);
registerAnalyticsRoutes(app);

// Unknown /api/* routes — return 404 instead of falling through to ASSETS,
// which would crash secureHeaders() with "Can't modify immutable headers."
app.all("/api/*", (c) => c.json({ error: "Not found" }, 404));

registerSsrRoutes(app);

// Catch-all: serve static assets (JS, CSS, fonts, etc.) with SPA fallback.
// Wrap in new Response so secureHeaders() can mutate headers if an /api/* path
// somehow falls through to here (immutable ASSETS headers would throw otherwise).
app.get("*", async (c) => {
  const resp = await c.env.ASSETS.fetch(c.req.raw);
  return new Response(resp.body, { status: resp.status, statusText: resp.statusText, headers: new Headers(resp.headers) });
});

export default { fetch: app.fetch, scheduled: handleScheduled };
