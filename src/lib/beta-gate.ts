/**
 * Shared beta-access gate. When BETA_PASSWORD is set, the middleware walls the
 * whole site behind a single shared password (a soft beta wall, not real auth):
 * visitors land on /beta, enter the password once, and a cookie lets them in for
 * 30 days. When BETA_PASSWORD is UNSET the gate is disabled and the site is fully
 * public, so it can never accidentally lock production.
 *
 * Edge-safe (Web Crypto only, no Node APIs) so it runs in middleware.
 */
export const BETA_COOKIE = "fr_beta";

/**
 * The unlock-cookie value: a SHA-256 token derived from the shared password
 * (first 32 hex chars). The raw password never lands in a cookie, and rotating
 * the password invalidates every existing session.
 */
export async function betaToken(password: string): Promise<string> {
  const data = new TextEncoder().encode(`fr-beta:v1:${password}`);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
    .slice(0, 32);
}
