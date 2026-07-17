import Link from "next/link";
import { ArrowRight, CalendarRange } from "lucide-react";
import type { assembleUnifiedEvents } from "@/lib/loaders/unifiedEvents";
import { buildHorizonBounds, groupByHorizon } from "@/lib/eventHorizon";
import { easternParts } from "@/lib/tz";
import { daypart } from "@/lib/daypart";

type EventsPromise = ReturnType<typeof assembleUnifiedEvents>;

/**
 * WeekendPreview — the anticipation beat of the return-visit loop.
 *
 * TomorrowPreview answers the night owl; nothing answered the Thursday
 * or Friday MORNING glance, which is when a resident actually decides
 * the weekend. One compact card: how much is already on the county
 * calendar for Saturday and Sunday, and what leads it — then the door
 * to the weekend lens. Self-hides outside Thu/Fri mornings and when the
 * weekend is still thin (a two-event teaser reads as a dead county, not
 * an invitation).
 */

const MIN_TEASE = 4;

export default async function WeekendPreview({
  now,
  eventsPromise,
}: {
  now: Date;
  eventsPromise: EventsPromise;
}) {
  const { weekday } = easternParts(now);
  const part = daypart(now);
  if ((weekday !== 4 && weekday !== 5) || (part !== "morning" && part !== "midday")) return null;

  const assembled = await eventsPromise.catch(() => null);
  if (!assembled) return null;
  const bounds = buildHorizonBounds(now);
  const weekend =
    groupByHorizon(assembled.publicEvents, bounds).find((g) => g.key === "weekend")?.events ?? [];
  if (weekend.length < MIN_TEASE) return null;

  // The tease line names a REAL clock-time happening people would go to.
  // All-day rows and midnight starts are calendar placeholders — "First up
  // Saturday 12:00 AM" sold a data artifact as the weekend's opener — and
  // a 7 AM rec class ("Bootcamp") is true but no invitation (2026-07-17
  // review). Prefer the first draw-category event; fall back to the first
  // clock-time row, then the raw first only if the weekend is all
  // placeholders.
  const DRAW = new Set([
    "music", "concert", "market", "theater", "sports", "family", "food",
    "arts", "gallery", "outdoors", "brewery", "winery", "festival", "movie",
  ]);
  const clockTime = (e: (typeof weekend)[number]) =>
    !e.is_all_day && easternParts(new Date(e.starts_at)).hour !== 0;
  const first =
    weekend.find((e) => clockTime(e) && DRAW.has(e.category ?? "")) ??
    weekend.find(clockTime) ??
    weekend[0];
  const firstWhen = new Date(first.starts_at).toLocaleString("en-US", {
    timeZone: "America/New_York",
    weekday: "long",
    hour: "numeric",
    minute: "2-digit",
  });

  return (
    <section aria-labelledby="weekend-preview-heading" className="mt-4">
      <Link
        href="/events?lens=weekend"
        className="tactile tactile-interactive flex items-center gap-3 rounded-[var(--app-radius-lg)] border p-3.5"
        style={{
          borderColor: "var(--app-border)",
          background: "var(--app-bg-elevated)",
          boxShadow: "var(--app-elev-1), var(--app-edge), var(--app-hi)",
        }}
      >
        <span
          aria-hidden
          className="grid h-10 w-10 shrink-0 place-items-center rounded-full"
          style={{ background: "color-mix(in srgb, var(--app-brand-2) 13%, transparent)", color: "var(--app-brand-2)" }}
        >
          <CalendarRange className="h-5 w-5" strokeWidth={2} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="eyebrow block" style={{ color: "var(--app-ink-3)" }}>
            Looking ahead
          </span>
          <span
            id="weekend-preview-heading"
            className="mt-0.5 block font-serif text-[17px] font-semibold leading-tight tracking-tight"
            style={{ color: "var(--app-ink)" }}
          >
            This weekend, so far: {weekend.length} things on the calendar
          </span>
          <span className="mt-0.5 block truncate text-[12.5px]" style={{ color: "var(--app-ink-2)" }}>
            First up {firstWhen}: {first.title}
            {first.venue_name ? ` at ${first.venue_name}` : ""}
          </span>
        </span>
        <ArrowRight aria-hidden className="h-4 w-4 shrink-0" strokeWidth={2.25} style={{ color: "var(--app-ink-3)" }} />
      </Link>
    </section>
  );
}
