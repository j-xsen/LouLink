import { createMiddleware } from "hono/factory";
import { createRemoteJWKSet, jwtVerify } from "jose";

type AuthEnv = { Bindings: Env; Variables: { userId: string } };

// Asymmetric algorithms only — rejects tokens signed with HS* (algorithm
// confusion) or alg:none, regardless of what the JWKS endpoint advertises.
const ALLOWED_ALGORITHMS = ["RS256", "RS384", "RS512", "ES256", "ES384", "ES512", "EdDSA"];

// Cache the JWKS across requests within a worker isolate so each request
// doesn't refetch the key set. jose handles key rotation internally.
let jwksCache: { url: string; jwks: ReturnType<typeof createRemoteJWKSet> } | null = null;

function getJwks(url: string) {
  if (jwksCache?.url !== url) {
    jwksCache = { url, jwks: createRemoteJWKSet(new URL(url)) };
  }
  return jwksCache.jwks;
}

export const requireAuth = createMiddleware<AuthEnv>(async (c, next) => {
  const header = c.req.header("Authorization");
  if (!header?.startsWith("Bearer ")) return c.json({ error: "Unauthorized" }, 401);
  const token = header.slice("Bearer ".length).trim();
  if (!token) return c.json({ error: "Unauthorized" }, 401);

  let sub: string | undefined;
  try {
    const { payload } = await jwtVerify(token, getJwks(c.env.AUTH_JWKS_URL), {
      algorithms: ALLOWED_ALGORITHMS,
    });
    sub = payload.sub;
  } catch {
    return c.json({ error: "Unauthorized" }, 401);
  }

  if (!sub) return c.json({ error: "Unauthorized" }, 401);
  c.set("userId", sub);
  await next();
});
