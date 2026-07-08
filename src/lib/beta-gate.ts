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

/**
 * A SECOND, non-httpOnly cookie carrying the tester's code as a plain label, so
 * client analytics can attribute events to a cohort. It is deliberately NOT the
 * credential — the httpOnly `fr_beta` cookie is — this one is just an
 * identifier the browser is allowed to read. Never trust it for access.
 */
export const BETA_ID_COOKIE = "fr_who";

/**
 * Per-user access codes.
 *
 * The unlock credential for a code is a signed token `<code>~<hmac>`, where the
 * HMAC is keyed on a server secret. The middleware can therefore verify a code
 * cookie — and recover WHICH code it is — with a pure crypto check and no
 * database round-trip on every request. The DB is touched only at redeem time
 * (to confirm the code exists and isn't revoked) and by the admin surface.
 *
 * The signing key is BETA_CODE_SECRET when set, else BETA_PASSWORD (already a
 * build-time secret in the edge bundle) so this needs zero new env config.
 * Rotating either invalidates every outstanding code cookie — the same blunt
 * lever the shared password already had.
 */
function codeSecret(): string | null {
  return process.env.BETA_CODE_SECRET || process.env.BETA_PASSWORD || null;
}

/** Normalize a submitted code: trim, lowercase, collapse inner whitespace. */
export function normalizeCode(raw: string): string {
  return raw.trim().toLowerCase().replace(/\s+/g, "-").slice(0, 64);
}

async function hmacHex(key: string, msg: string): Promise<string> {
  const enc = new TextEncoder();
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    enc.encode(key),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", cryptoKey, enc.encode(`fr-code:v1:${msg}`));
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
    .slice(0, 32);
}

/** Constant-time-ish string compare (length-independent leak is acceptable
 *  for a soft beta gate; this avoids the trivial early-exit on first char). */
function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** Mint the signed cookie value for a validated code. */
export async function signCode(code: string): Promise<string | null> {
  const secret = codeSecret();
  if (!secret) return null;
  return `${code}~${await hmacHex(secret, code)}`;
}

/**
 * Verify a code cookie and recover the code it carries. Returns the code on a
 * valid signature, null otherwise. Pure crypto — safe to call in edge
 * middleware on every request.
 */
export async function verifyCodeCookie(value: string | undefined): Promise<string | null> {
  if (!value) return null;
  const secret = codeSecret();
  if (!secret) return null;
  const i = value.lastIndexOf("~");
  if (i <= 0) return null;
  const code = value.slice(0, i);
  const sig = value.slice(i + 1);
  const expected = await hmacHex(secret, code);
  return safeEqual(sig, expected) ? code : null;
}
