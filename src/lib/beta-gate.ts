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

/**
 * Anonymous NFC member identity.
 *
 * A tapped device is assigned a random url-safe member id (generated in
 * src/lib/nfc.ts) and carries it in a SIGNED httpOnly `fr_member` cookie. The
 * cookie is HMAC'd (domain-separated by the `fr-member:v1:` label, so a member
 * signature is never a valid code signature or vice versa) and grants NO access
 * on its own — the fr_beta cookie is the access credential; this id only
 * attributes first-party analytics to a member. Forging one therefore buys
 * nothing but the ability to write analytics against an id you named, and only
 * with knowledge of the server signing secret.
 *
 * Signing key: a DEDICATED `MEMBER_COOKIE_SECRET` when set, else the beta code
 * secret (so it needs zero new config to run, but can be split off from the
 * beta password whenever that reuse is undesirable — verification still accepts
 * cookies signed under the code secret, so introducing the dedicated secret
 * never logs existing members out).
 *
 * Unlike a code cookie it carries no expiry field: the id is a stable identity
 * for the life of the cookie, so a returning member keeps the same id.
 */
function memberSigningSecret(): string | null {
  return process.env.MEMBER_COOKIE_SECRET || currentCodeSecret();
}

/** Every key a member cookie might have been signed under, newest first, so a
 *  dedicated-secret rollout accepts cookies minted under the old code secret. */
function memberVerificationSecrets(): string[] {
  const seen = new Set<string>();
  for (const s of [
    process.env.MEMBER_COOKIE_SECRET || null,
    process.env.MEMBER_COOKIE_SECRET_PREVIOUS || null,
    currentCodeSecret(),
    previousCodeSecret(),
  ]) {
    if (s) seen.add(s);
  }
  return [...seen];
}

const MEMBER_ID_RE = /^[A-Za-z0-9_-]{16,64}$/;
const MEMBER_COOKIE_RE = /^m1~([A-Za-z0-9_-]{16,64})~([a-f0-9]{32})$/;

export function isValidMemberId(id: string): boolean {
  return MEMBER_ID_RE.test(id);
}

async function memberHmac(key: string, id: string): Promise<string> {
  const enc = new TextEncoder();
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    enc.encode(key),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", cryptoKey, enc.encode(`fr-member:v1:${id}`));
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
    .slice(0, 32);
}

/** Mint the signed `fr_member` cookie value for a server-generated member id. */
export async function signMemberId(id: string): Promise<string | null> {
  const secret = memberSigningSecret();
  if (!secret || !isValidMemberId(id)) return null;
  return `m1~${id}~${await memberHmac(secret, id)}`;
}

/** Recover the member id from a signed cookie, or null when unsigned/tampered. */
export async function verifyMemberCookie(value: string | undefined): Promise<string | null> {
  if (!value) return null;
  const match = MEMBER_COOKIE_RE.exec(value);
  if (!match) return null;
  const [, id, sig] = match;
  for (const secret of memberVerificationSecrets()) {
    if (safeEqual(sig, await memberHmac(secret, id))) return id;
  }
  return null;
}
