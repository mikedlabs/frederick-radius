import type { ReactNode } from "react";
import Link from "next/link";
import TodaySectionHeading from "@/components/today/TodaySectionHeading";
import type { ComingDay } from "@/lib/today/tomorrow";

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
 * The page chooses the rows (selectComingDayEvents, under the same publisher
 * verification gate as today's program) and passes them in as children; this
 * component only frames them. Nothing to promise means nothing to show.
 */
export default function TomorrowPreview({
  day,
  weatherSentence,
  rowCount,
  children,
}: {
  day: ComingDay;
  weatherSentence: string | null;
  rowCount: number;
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
      <TodaySectionHeading
        title={day.heading}
        href={rowCount > 0 ? "/events" : undefined}
        cta="See all"
      />
      {weatherSentence && (
        <p className="px-0.5 pb-1 text-[13px] leading-snug" style={{ color: "var(--app-ink-2)" }}>
          {weatherSentence}
        </p>
      )}
      {rowCount > 0 ? (
        <ul>{children}</ul>
      ) : (
        <p className="px-0.5 pt-1 text-[13px] leading-snug" style={{ color: "var(--app-ink-2)" }}>
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
