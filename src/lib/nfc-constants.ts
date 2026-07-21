/**
 * NFC member + analytics cookie NAMES and small shared constants. Safe for any
 * bundle (no secrets, no server-only imports): the client tracker
 * (src/lib/track.ts) needs the opt-out identifiers, and the server routes need
 * the member cookie name. The member cookie's signing/verification lives in
 * src/lib/beta-gate.ts (server-only), keyed on the beta code secret, so a client
 * import can never see the secret.
 */

/** The httpOnly, signed cookie carrying a device's anonymous member id. */
export const MEMBER_COOKIE = "fr_member";

/**
 * Client opt-out marker (cookie + localStorage, value "1"). When set, the
 * tracker stops posting first-party events. The server also honors a persisted
 * opt-out on the member row, so a lost cookie cannot resume logging.
 */
export const ANALYTICS_OPTOUT_COOKIE = "fr_analytics_optout";
export const ANALYTICS_OPTOUT_STORAGE_KEY = "fr_analytics_optout";

/** fr_member lifetime: about a year, so a returning device keeps its id. */
export const MEMBER_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;
