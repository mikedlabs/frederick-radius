/**
 * Saved-event cancellation alerts — the decision core of "the app watches
 * the county for you."
 *
 * The saved-reminders cron already knows which devices saved which events.
 * When one of those events flips to cancelled/postponed (feed status from
 * event-status.ts / iCal STATUS, or the owner's event-notices override),
 * the device that saved it should hear about the change, not discover it
 * standing at a locked gate. This module is the pure who-gets-woken-up
 * rule; the cron route does the join, the dedupe claim, and the send.
 *
 * Honesty rules:
 * - Only UPCOMING events alert. A status flip on something already
 *   started (or past) is history, not news.
 * - Only within the next 6 days. Beyond that the weekday in the copy
 *   would be ambiguous ("Friday's…" when today is also Friday), and a
 *   cancellation weeks out will still alert once it enters the window.
 * - A postponement that later becomes a cancellation alerts again — the
 *   status is part of the caller's dedupe key by design.
 */
import { easternDayKey } from "@/lib/tz";

export type SavedEventSnapshot = {
  title: string;
  /** ISO 8601 start. */
  startsAt: string;
  /** Feed-derived status ("scheduled" | "cancelled" | "postponed" | …). */
  status?: string;
};

export type CancellationPush = {
  /** The effective status; callers fold it into the dedupe key so
   *  postponed → cancelled produces a second (correct) alert. */
  status: "cancelled" | "postponed";
  title: string;
  body: string;
};

/** Alert window: now < start ≤ 6 days out (keeps weekday copy unambiguous). */
const WINDOW_MS = 6 * 86_400_000;

function easternWeekday(d: Date): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    weekday: "long",
  }).format(d);
}

/**
 * The effective status for a saved event: the owner's notice override
 * wins over the feed's own claim (same precedence applyEventNotices
 * gives the unified set).
 */
export function effectiveEventStatus(
  feedStatus: string | undefined,
  noticeStatus: string | undefined,
): string | undefined {
  if (noticeStatus === "cancelled" || noticeStatus === "postponed") return noticeStatus;
  return feedStatus;
}

/**
 * The push to send for a saved event whose plans changed, or null when
 * no alert is due (still on, already started, or too far out).
 */
export function cancellationPush(
  ev: SavedEventSnapshot,
  noticeStatus: string | undefined,
  now: Date,
): CancellationPush | null {
  const status = effectiveEventStatus(ev.status, noticeStatus);
  if (status !== "cancelled" && status !== "postponed") return null;
  const start = Date.parse(ev.startsAt);
  if (!Number.isFinite(start)) return null;
  const lead = start - now.getTime();
  if (lead <= 0 || lead > WINDOW_MS) return null;

  const startDate = new Date(start);
  const today = easternDayKey(now) === easternDayKey(startDate);
  const word = status === "cancelled" ? "cancelled" : "postponed";
  const body = today
    ? `${ev.title} is ${word} today.`
    : `${easternWeekday(startDate)}'s ${ev.title} is ${word}.`;
  return { status, title: "Plans changed", body };
}
