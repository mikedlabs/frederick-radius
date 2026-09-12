
import type { assembleUnifiedEvents } from "@/lib/loaders/unifiedEvents";
import { buildHorizonBounds, groupByHorizon } from "@/lib/eventHorizon";
import { easternParts } from "@/lib/tz";
import { daypart } from "@/lib/daypart";
import EventSwipeStack from "./EventSwipeStack";

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
  const draws = weekend.filter(e => clockTime(e) && DRAW.has(e.category ?? ""));
  if (draws.length === 0) draws.push(...weekend.filter(clockTime));
  if (draws.length === 0) draws.push(...weekend);

  const cardColors = [
    { bg: "bg-indigo-500", text: "text-white" },
    { bg: "bg-rose-500", text: "text-white" },
    { bg: "bg-emerald-500", text: "text-white" },
    { bg: "bg-amber-500", text: "text-white" },
    { bg: "bg-cyan-500", text: "text-white" },
  ];

  const swipeCards = draws.slice(0, 5).map((draw, i) => {
    const color = cardColors[i % cardColors.length];
    return {
      id: `${draw.slug}-${i}`,
      title: draw.title,
      venue: draw.venue_name || "Frederick, MD",
      slug: draw.slug,
      colorClass: color.bg,
      textClass: color.text,
    };
  });

  return (
    <section aria-labelledby="weekend-preview-heading" className="mt-6">
      <div className="flex items-center justify-between mb-3 px-1">
        <h2 id="weekend-preview-heading" className="text-xl font-bold font-serif" style={{ color: "var(--app-ink)" }}>
          Top Picks This Weekend
        </h2>
      </div>
      <EventSwipeStack cards={swipeCards} emptyMessage="That's it for the top picks! See the full calendar for more." />
    </section>
  );
}
