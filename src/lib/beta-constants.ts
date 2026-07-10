/**
 * Beta cookie NAMES only — safe for any bundle. Client components (the
 * feedback widget, beta telemetry) need these identifiers, but they must
 * not pull in the server-side gate logic: src/lib/beta-gate.ts reads the
 * gate's env secrets and is marked `server-only` so an accidental client
 * import fails the build instead of shipping the gate's internals to every
 * browser. Import from here in client code; server code can keep importing
 * from beta-gate (it re-exports these).
 */

/** The httpOnly unlock-cookie: the actual beta credential. */
export const BETA_COOKIE = "fr_beta";

/**
 * A SECOND, non-httpOnly cookie carrying the tester's code as a plain label, so
 * client analytics can attribute events to a cohort. It is deliberately NOT the
 * credential — the httpOnly `fr_beta` cookie is — this one is just an
 * identifier the browser is allowed to read. Never trust it for access.
 */
export const BETA_ID_COOKIE = "fr_who";
