/**
 * The single "tell the owner something arrived" channel.
 *
 * Public submissions already emailed the owner through a private helper inside
 * submit/actions.ts. The food-truck claim gate needs the same thing, and a
 * second hand-rolled copy is how two notification paths quietly drift apart
 * (different from-address, different timeout, one that logs contact details and
 * one that does not). So the behaviour lives here once and both callers use it.
 *
 * FAIL-SOFT BY CONTRACT. A notification is never allowed to fail the user's
 * request: someone claiming their truck has done their part the moment the row
 * is stored, and an inbox problem is the operator's problem, not theirs. Every
 * failure path returns false instead of throwing, and the caller records the
 * durable row regardless.
 *
 * PRIVACY. The caller decides what goes in `text`. Nothing here logs the body,
 * because these messages carry submitter contact details by design.
 */

/** Where owner notifications land. Same default as the original submissions
 *  path so existing behaviour is unchanged when the env var is absent. */
const DEFAULT_TO = "hello@frederickradius.app";

/**
 * `||` rather than `??`: RESEND_FROM has been set to an EMPTY string in prod
 * before (see beacon of the same bug in lib/beta-invite.ts), and an empty
 * from-address is rejected by the API, so an empty value must fall back too.
 */
const DEFAULT_FROM = "Frederick Radius <submissions@frederickradius.app>";

export type AdminEmail = {
  subject: string;
  /** Plain text body. Formatted by the caller. */
  text: string;
  /** Log prefix, e.g. "food-truck-claim". Never include user data. */
  tag: string;
  /** Overrides the shared default when a message needs its own sender. */
  from?: string;
};

/**
 * Send one owner notification. Returns whether it was delivered, so a caller
 * can record delivery state without having to care why it failed.
 *
 * Returns false (never throws) when Resend is not configured, when the API
 * rejects the message, and when the network is unavailable or slow.
 */
export async function sendAdminEmail({ subject, text, tag, from }: AdminEmail): Promise<boolean> {
  const key = process.env.RESEND_API_KEY;
  if (!key) return false;
  const to = process.env.ADMIN_EMAIL || DEFAULT_TO;

  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: from || process.env.RESEND_FROM || DEFAULT_FROM,
        to,
        subject,
        text,
      }),
      // A notification must never hold a request open. Five seconds matches the
      // submissions path this was extracted from.
      signal: AbortSignal.timeout(5_000),
    });
    if (!response.ok) {
      console.warn(`[${tag}] Admin email rejected with HTTP ${response.status}.`);
      return false;
    }
    return true;
  } catch {
    console.warn(`[${tag}] Admin email delivery was unavailable.`);
    return false;
  }
}
