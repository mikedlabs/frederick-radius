import "server-only";

/**
 * NFC card + member id generation. Server-only: ids are minted where they are
 * written (the /j tap route and the /admin/cards mint action), never on a client.
 */

// Readable, unambiguous alphabet (no 0/O/1/l/I) so a code hand-written onto a
// card is never mis-transcribed. Same spirit as the beta-invite generator.
const CARD_ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789";
// Largest multiple of the alphabet length that fits in a byte. Bytes at or above
// it are rejected and redrawn so every character is uniformly distributed — no
// modulo bias skewing the low end of the alphabet on a never-expiring credential.
const CARD_UNBIASED_CEIL = 256 - (256 % CARD_ALPHABET.length);

/** Matches beta-gate's code shape so a card code can be signed into fr_beta. */
export const CARD_CODE_RE = /^[a-z0-9][a-z0-9-]{0,63}$/;

/** One uniformly-random alphabet character (rejection-sampled, no modulo bias). */
function randomCardChar(): string {
  const b = new Uint8Array(1);
  do {
    crypto.getRandomValues(b);
  } while (b[0] >= CARD_UNBIASED_CEIL);
  return CARD_ALPHABET[b[0] % CARD_ALPHABET.length];
}

/** A fresh card code like "a3kq-7mtp": two readable groups, always regex-valid. */
export function newCardCode(): string {
  let out = "";
  for (let i = 0; i < 8; i++) {
    if (i === 4) out += "-";
    out += randomCardChar();
  }
  return out;
}

/** A random url-safe member id (~24 chars), matching beta-gate's member-id shape. */
export function newMemberId(): string {
  const bytes = new Uint8Array(18);
  crypto.getRandomValues(bytes);
  return Buffer.from(bytes).toString("base64url");
}
