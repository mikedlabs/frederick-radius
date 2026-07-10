import "server-only";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { beta_codes } from "@/lib/db/schema";

/**
 * Beta invites: one personal access code per signup email, delivered by
 * email. The code IS the `beta_codes` row (label = the email address, the
 * pre-existing "who is it for" field, so no migration is needed) — which
 * means every invited tester is individually attributable and revocable
 * from /admin/beta-codes, exactly like hand-minted codes.
 *
 * Email delivery is Resend via raw fetch (the submit-notification pattern)
 * and FAIL-SOFT end to end: without RESEND_API_KEY the code still mints and
 * the caller learns sent:false, so the pipeline can be wired before the
 * key exists and lights up the moment it is set.
 */

// Readable, unambiguous suffix alphabet: no 0/O/1/l/I so an emailed or
// texted code is never mistyped. Shared with the admin generator.
const ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789";
const PREFIX = "frederick-";

export function newBetaCode(): string {
  const bytes = new Uint8Array(4);
  crypto.getRandomValues(bytes);
  let suffix = "";
  for (let i = 0; i < bytes.length; i++) suffix += ALPHABET[bytes[i] % ALPHABET.length];
  return `${PREFIX}${suffix}`;
}

/**
 * The tester's personal code for `email`: the existing non-revoked code
 * labeled with that address, else a freshly minted one. Null when no DB.
 */
export async function mintCodeForEmail(email: string): Promise<string | null> {
  const db = getDb();
  if (!db) return null;

  const existing = await db
    .select({ code: beta_codes.code })
    .from(beta_codes)
    .where(and(eq(beta_codes.label, email), eq(beta_codes.revoked, false)))
    .limit(1);
  if (existing[0]?.code) return existing[0].code;

  const code = newBetaCode();
  await db.insert(beta_codes).values({ code, label: email }).onConflictDoNothing();
  return code;
}

const FROM = process.env.RESEND_FROM ?? "Frederick Radius <hello@frederickradius.app>";
const BASE = "https://frederickradius.app";

/**
 * Send the invite email. Returns false (without throwing) when the key is
 * missing or Resend rejects — a lost email must never lose the signup.
 */
export async function sendBetaCodeEmail(email: string, code: string): Promise<boolean> {
  const key = process.env.RESEND_API_KEY;
  if (!key) return false;

  const link = `${BASE}/beta?code=${encodeURIComponent(code)}`;
  const text = [
    "You asked to try Frederick Radius. Here is your personal access code:",
    "",
    `    ${code}`,
    "",
    `Come in here: ${link}`,
    "",
    "The code is yours alone. If you ever lose access, reply to this email and we will sort it out.",
    "",
    "See you around the county.",
    "Frederick Radius",
  ].join("\n");

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: FROM,
        to: email,
        subject: "Your Frederick Radius beta code",
        text,
      }),
    });
    if (!res.ok) {
      console.error(`[beta-invite] Resend ${res.status} for ${email.slice(0, 3)}…`);
      return false;
    }
    return true;
  } catch (err) {
    console.error("[beta-invite] send failed:", err instanceof Error ? err.message : err);
    return false;
  }
}

/** Mint (or reuse) the code for an email and try to send it. */
export async function inviteEmail(
  email: string,
): Promise<{ code: string | null; sent: boolean }> {
  try {
    const code = await mintCodeForEmail(email);
    if (!code) return { code: null, sent: false };
    const sent = await sendBetaCodeEmail(email, code);
    return { code, sent };
  } catch (err) {
    console.error("[beta-invite] invite failed:", err instanceof Error ? err.message : err);
    return { code: null, sent: false };
  }
}
