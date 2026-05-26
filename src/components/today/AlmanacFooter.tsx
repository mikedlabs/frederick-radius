import { Sunrise, Sunset } from "lucide-react";
import { daylightDelta } from "@/lib/almanac";

/**
 * AlmanacFooter — a single quiet line at the bottom of /now that says
 * what the day actually looks like, in sun terms.
 *
 *   Sunrise 6:42a · Sunset 8:23p · 2 minutes longer than yesterday
 *
 * The point is anchoring. A briefing app that promises "what's
 * happening today" should know what today's daylight actually is, and
 * say it where a reader who scrolled all the way to the bottom can
 * find it. The delta is the bit that survives a second look: a casual
 * reader sees the rising / falling number and feels the season turn
 * without anyone needing to label it.
 *
 * Pure server component (no client state, no animation). The math is
 * a request-scoped Date — `new Date()` is acceptable here because the
 * page already revalidates on a 60s cadence and the answer for
 * Frederick only changes once at midnight Eastern.
 */
export default function AlmanacFooter() {
  // eslint-disable-next-line react-hooks/purity
  const now = new Date();
  const delta = daylightDelta(now);
  if (!delta) return null;

  const fmtClock = (d: Date) =>
    new Intl.DateTimeFormat("en-US", {
      timeZone: "America/New_York",
      hour: "numeric",
      minute: "2-digit",
    })
      .format(d)
      // "6:42 AM" → "6:42a" — saves a few px and reads naturally in
      // a long quiet line.
      .replace(/\s?AM$/i, "a")
      .replace(/\s?PM$/i, "p");

  const sunriseStr = fmtClock(delta.today.sunrise);
  const sunsetStr = fmtClock(delta.today.sunset);

  // The delta is the editorial half. "+2m" / "-3m" → into prose so it
  // reads at the same weight as the clock values.
  const dMin = delta.deltaMinutes;
  let deltaLine: string;
  if (dMin === 0) {
    deltaLine = "same as yesterday";
  } else if (dMin > 0) {
    deltaLine = `${dMin} minute${dMin === 1 ? "" : "s"} longer than yesterday`;
  } else {
    const n = Math.abs(dMin);
    deltaLine = `${n} minute${n === 1 ? "" : "s"} shorter than yesterday`;
  }

  return (
    <footer
      className="mt-2 flex flex-wrap items-center justify-center gap-x-3 gap-y-1 px-1 py-3 text-center text-[11px]"
      style={{ color: "var(--app-ink-3)" }}
      aria-label="Today in Frederick"
    >
      <span className="inline-flex items-center gap-1.5">
        <Sunrise className="h-3 w-3 shrink-0" strokeWidth={2} aria-hidden />
        Sunrise {sunriseStr}
      </span>
      <span aria-hidden style={{ color: "var(--app-border)" }}>
        ·
      </span>
      <span className="inline-flex items-center gap-1.5">
        <Sunset className="h-3 w-3 shrink-0" strokeWidth={2} aria-hidden />
        Sunset {sunsetStr}
      </span>
      <span aria-hidden style={{ color: "var(--app-border)" }}>
        ·
      </span>
      <span>{deltaLine}</span>
    </footer>
  );
}
