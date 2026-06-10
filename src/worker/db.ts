import { neon } from "@neondatabase/serverless";

/**
 * Creates a Neon SQL executor bound to the DATABASE_URL secret.
 * Call inside each Hono handler — do not call at module scope.
 *
 * Values interpolated into tagged template literals are automatically
 * parameterised. Never build queries via string concatenation.
 *
 * Example:
 *   const sql = createDb(c.env.DATABASE_URL);
 *   const [profile] = await sql`
 *     SELECT p.*, u.email
 *     FROM public.profiles p
 *     JOIN neon_auth.users_sync u ON u.id = p.user_id
 *     WHERE p.username = ${username} AND u.deleted_at IS NULL
 *   `;
 */
export function createDb(databaseUrl: string) {
  return neon(databaseUrl);
}
