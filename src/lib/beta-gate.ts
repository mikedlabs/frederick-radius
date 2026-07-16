import "server-only";

/**
 * Shared beta-access gate. When BETA_PASSWORD is set, the middleware walls the
 * whole site behind a single shared password (a soft beta wall, not real auth):
 * visitors land on /beta, enter the password once, and a cookie lets them in.
 * The owner master key lasts 30 days; personal-code sessions last 12 hours.
 * When BETA_PASSWORD is UNSET the gate is disabled and the site is fully
 * public, so it can never accidentally lock production.
 *
 * Edge-safe (Web Crypto only, no Node APIs) so it runs in middleware. Marked
 * `server-only` because it reads BETA_PASSWORD / BETA_CODE_SECRET: a client
 * import must fail the build, not ship the gate's internals to browsers.
 * Cookie NAMES live in beta-constants.ts (re-exported here) so client
 * components can use them without touching this module.
 */
export {
  BETA_COOKIE,
  BETA_ID_COOKIE,
  BETA_OWNER_MARKER,
  BETA_TESTER_MARKER,
} from "./beta-constants";

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
 * Per-user access codes.
 *
 * The unlock credential for a code is a short-lived signed token containing an
 * issued-at time and code. Middleware can verify it without a database request
 * on every page load. The database is checked at redemption/renewal time, so a
 * revoked code cannot mint another session; an existing session can remain
 * valid for at most 12 hours.
 *
 * The signing key is BETA_CODE_SECRET when set, else BETA_PASSWORD (already a
 * build-time secret in the edge bundle) so this needs zero new env config.
 * BETA_CODE_SECRET_PREVIOUS provides a planned-rotation grace period. Omit it
 * during an emergency rotation to invalidate all existing code sessions.
 */
function currentCodeSecret(): string | null {
  return process.env.BETA_CODE_SECRET || process.env.BETA_PASSWORD || null;
}

function previousCodeSecret(): string | null {
  return process.env.BETA_CODE_SECRET_PREVIOUS || null;
}

export const BETA_CODE_SESSION_SECONDS = 12 * 60 * 60;
const MAX_FUTURE_SKEW_SECONDS = 5 * 60;
const CODE_RE = /^[a-z0-9][a-z0-9-]{0,63}$/;

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
  const sig = await crypto.subtle.sign("HMAC", cryptoKey, enc.encode(`fr-code:v2:${msg}`));
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

/** Mint the signed cookie value for a code already validated by the database. */
export async function signCode(code: string, issuedAtMs = Date.now()): Promise<string | null> {
  const secret = currentCodeSecret();
  if (!secret || !CODE_RE.test(code) || !Number.isFinite(issuedAtMs)) return null;
  const issuedAt = Math.floor(issuedAtMs / 1_000);
  const message = `${issuedAt}~${code}`;
  return `v2~${message}~${await hmacHex(secret, message)}`;
}

/**
 * Verify a code cookie and recover the code it carries. Returns the code on a
 * valid signature, null otherwise. Pure crypto — safe to call in edge
 * middleware on every request.
 */
export async function verifyCodeCookie(
  value: string | undefined,
  nowMs = Date.now(),
): Promise<string | null> {
  if (!value) return null;
  const parts = value.split("~");
  if (parts.length !== 4 || parts[0] !== "v2") return null;
  const [, issuedRaw, code, sig] = parts;
  if (!/^\d{10,12}$/.test(issuedRaw) || !CODE_RE.test(code) || !/^[a-f0-9]{32}$/.test(sig)) {
    return null;
  }
  const issuedAt = Number(issuedRaw);
  const now = Math.floor(nowMs / 1_000);
  if (
    !Number.isSafeInteger(issuedAt) ||
    !Number.isFinite(now) ||
    issuedAt > now + MAX_FUTURE_SKEW_SECONDS ||
    now - issuedAt > BETA_CODE_SESSION_SECONDS
  ) {
    return null;
  }

  const message = `${issuedRaw}~${code}`;
  const secrets = [currentCodeSecret(), previousCodeSecret()].filter(
    (secret): secret is string => Boolean(secret),
  );
  for (const secret of secrets) {
    if (safeEqual(sig, await hmacHex(secret, message))) return code;
  }
  return null;
}

/** The database decision used whenever a code mints or renews a session. */
export function isRedeemableBetaCode(row: { revoked: boolean } | null | undefined): boolean {
  return row !== null && row !== undefined && row.revoked === false;
}
