import { createMiddleware } from "hono/factory";
import { createRemoteJWKSet, jwtVerify } from "jose";

type AuthEnv = { Bindings: Env; Variables: { userId: string } };

export const requireAuth = createMiddleware<AuthEnv>(async (c, next) => {
  const token = c.req.header("Authorization")?.replace("Bearer ", "");
  if (!token) return c.json({ error: "Unauthorized" }, 401);

  const jwks = createRemoteJWKSet(new URL(c.env.AUTH_JWKS_URL));
  let sub: string | undefined;

  try {
    const { payload } = await jwtVerify(token, jwks);
    sub = payload.sub;
  } catch {
    return c.json({ error: "Unauthorized" }, 401);
  }

  if (!sub) return c.json({ error: "Unauthorized" }, 401);
  c.set("userId", sub);
  await next();
});
