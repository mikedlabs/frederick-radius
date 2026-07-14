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
 * A SECOND, non-httpOnly cookie carrying only a coarse UI marker. It lets
 * beta-only client affordances render without exposing the personal access
 * code to browser scripts. It is deliberately NOT the credential — the
 * httpOnly `fr_beta` cookie is. Never trust it for access.
 */
export const BETA_ID_COOKIE = "fr_who";
export const BETA_OWNER_MARKER = "owner";
export const BETA_TESTER_MARKER = "tester";
