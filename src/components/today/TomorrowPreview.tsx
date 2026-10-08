import type { ReactNode } from "react";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { DAY_START_HOUR, daypart, easternHour } from "@/lib/daypart";
import type { ComingDay } from "@/lib/today/tomorrow";

/**
 * The name of Today's event chapter, read from the one daypart clock
 * (src/lib/daypart.ts), so it flips with the masthead title and the program's
 * own group labels instead of at a second boundary.
 *
 * - morning and midday: "Today's events"
 * - evening (from 4 PM): "Tonight"
 * - late (from 9 PM): what is still on tonight, then the coming day. The
 *   coming day keeps its own h3 below ("Tomorrow, Thursday", or "Later
 *   today, Wednesday" after midnight), and when nothing is still on it leads
 *   the chapter on its own, still under the chapter's h2.
 */
export function dayProgramLabel(now: Date): string {
  switch (daypart(now)) {
    case "morning":
    case "midday":
      return "Today's events";
    case "evening":
      return "Tonight";
    case "late":
      return easternHour(now) < DAY_START_HOUR
        ? "Overnight and today"
        : "Tonight and tomorrow";
  }
}

/**
 * TomorrowPreview: the forward answer for a late-night visitor.
 *
 * From 9 PM (the "late" daypart on the Eastern clock) a spent day is a dead
 * end, so Today answers with the coming day instead: its heading ("Tomorrow,
 * Thursday", or "Later today, Wednesday" after midnight), the NWS sentence
 * for that day, and up to three listings rendered by the page's own program
 * rows. It sits in the day program, outside the "Plan the rest" disclosure,
 * because at night it is the answer rather than an extra.
 *
 * It always renders inside the events chapter, whose h2 names the late hours
 * ("Tonight and tomorrow", or "Overnight and today"), so its own heading is
 * an h3 under that one in the compact item register, not a second h2.
 *
 * When nothing is still on tonight this section leads the chapter, and the
 * page hands it the numbered pin map of its rows (`map`), drawn between the
 * forecast sentence and the rows it numbers.
 *
 * The page chooses the rows (selectComingDayEvents, under the same publisher
 * verification gate as today's program) and passes them in as children; this
 * component only frames them. Nothing to promise means nothing to show.
 */
export default function TomorrowPreview({
  day,
  weatherSentence,
  rowCount,
  map,
  children,
}: {
  day: ComingDay;
  weatherSentence: string | null;
  rowCount: number;
  /** The pin map of these rows, when this section leads the chapter. */
  map?: ReactNode;
  children?: ReactNode;
}) {
  if (rowCount === 0 && !weatherSentence) return null;
  return (
    <section
      data-today-coming-day={day.laterToday ? "later-today" : "tomorrow"}
      aria-label={day.heading}
      className="mt-6 first:mt-0"
    >
      {/* With no rows the sentence below carries the one link to the board. */}
      <header className="mb-1 flex min-h-11 items-center justify-between gap-3 px-0.5">
        <h3 className="text-title-sm min-w-0" style={{ color: "var(--app-ink)" }}>
          {day.heading}
        </h3>
        {rowCount > 0 ? (
          <Link
            href="/events"
            prefetch={false}
            aria-label={`See all: ${day.heading}`}
            className="text-body tap-44-y inline-flex min-h-11 shrink-0 items-center gap-1 font-semibold"
            style={{ color: "var(--app-brand-press)" }}
          >
            See all
            <ChevronRight aria-hidden className="h-4 w-4 shrink-0" />
          </Link>
        ) : null}
      </header>
      {weatherSentence && (
        <p className="text-meta-lg px-0.5 pb-1" style={{ color: "var(--app-ink-2)" }}>
          {weatherSentence}
        </p>
      )}
      {rowCount > 0 ? (
        <>
          {map ? <div className="mb-1 mt-2">{map}</div> : null}
          <ul>{children}</ul>
        </>
      ) : (
        <p className="text-meta-lg px-0.5 pt-1" style={{ color: "var(--app-ink-2)" }}>
          {day.weekday}&rsquo;s listings are on the{" "}
          <Link href="/events" className="font-semibold underline" style={{ color: "var(--app-brand-press)" }}>
            events page
          </Link>
          .
        </p>
      )}
    </section>
  );
}
