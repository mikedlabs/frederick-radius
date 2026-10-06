/**
 * Flag contract helpers for event classification at hydrate.
 *
 * Census findings (2026-10-06, 477 rows):
 * - is_free false dominates (465) — false without price_text/admission
 *   evidence means unknown, not proven paid
 * - audience empty on 372 — kids-* tags signal family-friendly when present
 * - attendance_mode online(4)/mixed(15) sparsely stamped but url-consistent
 */

type EventFlagInput = {
  is_free: boolean;
  price_text?: string;
  info?: { admission?: string };
  audience?: string[];
  attendance_mode?: "physical" | "online" | "mixed";
  online_url?: string;
};

/**
 * Free classification: true only when is_free===true.
 * Unknown when false without price_text/admission evidence.
 */
export type FreeStatus = "proven" | "paid" | "unknown";

export function eventFreeStatus(e: EventFlagInput): FreeStatus {
  if (e.is_free === true) return "proven";

  const hasEvidence =
    Boolean(e.price_text?.trim()) ||
    Boolean(e.info?.admission?.trim());

  return hasEvidence ? "paid" : "unknown";
}

/**
 * Family-friendly signal from audience kids-* tags.
 * Returns true when any kids-* tag is present.
 */
export function eventIsFamilyFriendly(e: EventFlagInput): boolean {
  if (!e.audience || e.audience.length === 0) return false;
  return e.audience.some((tag) => tag.startsWith("kids-"));
}

/**
 * Online-only classification from attendance_mode.
 * Returns true only when attendance_mode is "online".
 */
export function eventIsOnlineOnly(e: EventFlagInput): boolean {
  return e.attendance_mode === "online";
}

/**
 * Mixed (hybrid) classification from attendance_mode.
 * Returns true only when attendance_mode is "mixed".
 */
export function eventIsMixed(e: EventFlagInput): boolean {
  return e.attendance_mode === "mixed";
}

/**
 * Validate that online/mixed events have a usable online_url.
 * Census shows attendance_mode online/mixed is consistent with online_url presence.
 */
export function eventHasValidOnlineUrl(e: EventFlagInput): boolean {
  if (e.attendance_mode !== "online" && e.attendance_mode !== "mixed") {
    return true;
  }
  return Boolean(e.online_url?.trim());
}
