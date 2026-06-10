// Extends the generated Env interface with secret bindings.
// Actual values live in .dev.vars locally and as Wrangler secrets in production.
// Run `wrangler secret put <KEY>` for each before deploying.
interface Env {
  DATABASE_URL: string;
  AUTH_JWKS_URL: string;
  CONTENTFUL_SPACE_ID: string;
  CONTENTFUL_DELIVERY_TOKEN: string;
  CONTENTFUL_MANAGEMENT_TOKEN: string;
}
