/**
 * The operator-beacon capability token.
 *
 * The owner-approved claim gate issues one of these when a claim is approved in
 * /admin/food-trucks. It is the ONLY credential that authorizes a beacon write:
 * the write path validates it against an APPROVED claim for the exact truck. So
 * it must be long and random enough to be unguessable — 24 random bytes (192
 * bits), url-safe so it drops cleanly into a link or a localStorage value.
 *
 * Same posture as the existing `submissions.manage_token`: an opaque,
 * DB-stored, no-account capability credential. There is no signing secret to
 * manage; the credential IS the random value, and the database lookup is the
 * check.
 */
import { randomBytes } from "node:crypto";

/** A fresh, unguessable, url-safe capability token. */
export function newBeaconToken(): string {
  return randomBytes(24).toString("base64url");
}

/** The floor a supplied token must clear before it is worth a DB lookup. A real
 *  token is 32 url-safe chars; anything shorter is a fat-finger or a probe. */
export const MIN_BEACON_TOKEN_LEN = 16;

/** True when a supplied value is shaped like a token worth checking. Rejects
 *  empty, non-string, and obviously-too-short values before any query so a
 *  probe never reaches the database. */
export function looksLikeBeaconToken(value: unknown): value is string {
  return typeof value === "string" && value.length >= MIN_BEACON_TOKEN_LEN && value.length <= 128;
}
