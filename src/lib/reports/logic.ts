/**
 * Community-report moderation + anti-spam logic. Pure + deterministic so the
 * /api/reports route stays thin and the rules are unit-tested.
 *
 * Phase-1 model (locked): a trusted submitter (valid COLLECT_PASSCODE) publishes
 * immediately; everyone else queues for /admin review. Every report expires by
 * category TTL so the map self-cleans. Free text is sanitized + screened for the
 * cheap spam vectors (links, shouting, repetition); the moderation queue is the
 * real backstop for anything subtler.
 */
import { REPORT_CATEGORY_BY_KEY, type ReportCategory } from "./categories";

export type ReportStatus = "approved" | "pending" | "rejected";

/** Trusted (passcode) → live now; otherwise queued for review. */
export function statusForSubmission(trusted: boolean): ReportStatus {
  return trusted ? "approved" : "pending";
}

/** When a report of this category ages off the map. */
export function expiresAtFor(category: ReportCategory, now: Date): Date {
  const hours = REPORT_CATEGORY_BY_KEY[category]?.ttlHours ?? 24;
  return new Date(now.getTime() + hours * 3_600_000);
}

/** Trim, collapse whitespace, and clamp to `max`. Returns null for empties. */
export function sanitizeText(v: unknown, max: number): string | null {
  if (typeof v !== "string") return null;
  const t = v.replace(/\s+/g, " ").trim();
  return t ? t.slice(0, max) : null;
}

// Community reports never carry links — a link is the #1 spam tell here.
const LINK_RE = /(https?:\/\/|\bwww\.|\b[a-z0-9-]+\.(com|net|org|io|co|ru|xyz|info|biz|shop|link)\b)/i;

/**
 * Cheap, deterministic spam screen for free text. Returns a reason string when
 * the text should be rejected at submit time, or null when it's acceptable.
 * Deliberately conservative — it only catches the obvious vectors; the
 * moderation queue handles judgment calls.
 */
export function textSpamConcern(text: string | null): "link" | "shouting" | "repetition" | null {
  if (!text) return null;
  if (LINK_RE.test(text)) return "link";
  // Long ALL-CAPS shouting (ignore short acronyms).
  const letters = text.replace(/[^a-z]/gi, "");
  if (letters.length >= 12 && letters === letters.toUpperCase() && /[A-Z]/.test(letters)) return "shouting";
  // The same character run 6+ times ("!!!!!!", "aaaaaa") — keyboard-mash spam.
  if (/(.)\1{5,}/.test(text)) return "repetition";
  return null;
}
