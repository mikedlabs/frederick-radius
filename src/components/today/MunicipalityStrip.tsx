import Link from "next/link";
import { CalendarDays } from "lucide-react";
import { MUNICIPALITIES } from "@/data/municipalities";
import { publicPlacesByMunicipality } from "@/lib/loaders/places";
import { eventsInMunicipality } from "@/lib/loaders/events";

// A deterministic System-Black accent per town so the grid reads as
// distinct tiles, not one grey list.
const ACCENTS = ["#A8462C", "#2F5470", "#1E6B3A", "#7E2C6F", "#B07A1E", "#3F5E8F"];
function accentFor(slug: string): string {
  let h = 0;
  for (let i = 0; i < slug.length; i++) h = (h * 31 + slug.charCodeAt(i)) | 0;
  return ACCENTS[Math.abs(h) % ACCENTS.length];
}

// "Live this week" window — anything starting in the next 7 days.
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

// Short, alive day label for a town's next event: Today / Tomorrow, then
// the weekday. Keeps the "featured move" line time-sensitive.
function dayLabel(iso: string, now: Date): string {
  const d = new Date(iso);
  const key = (dt: Date) =>
    new Intl.DateTimeFormat("en-US", {
      timeZone: "America/New_York",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(dt);
  if (key(d) === key(now)) return "Today";
  if (key(d) === key(new Date(now.getTime() + 86_400_000))) return "Tomorrow";
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    weekday: "short",
  }).format(d);
}

/**
 * All 12 towns as a visual tile grid (not a row of pills). Each tile is
 * "alive": the town name + a live-this-week event count, and a FEATURED
 * MOVE — the town's next upcoming event, time-stamped, so the card
 * answers "what's the move here?" (audit E2). A town with nothing on
 * falls back to its editorial hero blurb, so a quiet town reads as
 * character, not emptiness — time-sensitive beats time-flat, but silence
 * still says something true.
 */
export default function MunicipalityStrip() {
  const now = new Date();
  const horizon = now.getTime() + WEEK_MS;
  const towns = MUNICIPALITIES.map((m) => {
    // One events read per town, reused for BOTH the week count and the
    // featured move — sorted soonest-first so [0] is the next move.
    const events = eventsInMunicipality(m.slug, true, now)
      .filter((e) => Number.isFinite(Date.parse(e.starts_at)))
      .sort((a, b) => Date.parse(a.starts_at) - Date.parse(b.starts_at));
    return {
      ...m,
      count: publicPlacesByMunicipality(m.slug).length,
      weekEvents: events.filter((e) => Date.parse(e.starts_at) <= horizon).length,
      next: events[0] ?? null,
    };
  }).sort((a, b) => b.count - a.count);

  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
      {towns.map((m) => {
        const accent = accentFor(m.slug);
        return (
          <Link
            key={m.slug}
            href={`/m/${m.slug}`}
            className="hover-lift relative overflow-hidden rounded-[var(--app-radius-md)] border bg-[var(--app-bg-elevated)] py-2.5 pl-4 pr-3 transition"
            style={{ borderColor: "var(--app-border)" }}
          >
            <span
              aria-hidden
              className="absolute inset-y-0 left-0 w-1"
              style={{ background: accent }}
            />
            <div className="flex items-baseline gap-2">
              <span
                className="min-w-0 flex-1 truncate text-[14px] font-semibold tracking-tight"
                style={{ color: "var(--app-ink)" }}
              >
                {m.name}
              </span>
              {/* Live-this-week chip — only renders when a town has
                  events starting in the next 7 days. Quiet positive-tinted
                  text + dot, no border or filled pill, so it reads as a
                  signal not a button. Hidden when zero (silence is honest). */}
              {m.weekEvents > 0 && (
                <span
                  className="inline-flex shrink-0 items-center gap-1 text-[10px] font-medium"
                  style={{ color: "var(--app-positive)" }}
                  aria-label={`${m.weekEvents} ${m.weekEvents === 1 ? "event" : "events"} this week`}
                >
                  <span
                    aria-hidden
                    className="inline-block h-1.5 w-1.5 rounded-full"
                    style={{ background: "var(--app-positive)" }}
                  />
                  {m.weekEvents} on
                </span>
              )}
            </div>
            {/* Featured move — the town's next event, time-stamped, so the
                card answers "what's the move here?" When nothing is
                upcoming, fall back to the editorial blurb (character over
                emptiness), then the place count. */}
            {m.next ? (
              <span
                className="mt-0.5 flex items-center gap-1 text-[11px] leading-snug"
                style={{ color: "var(--app-ink-2)" }}
              >
                <CalendarDays
                  className="h-3 w-3 shrink-0"
                  strokeWidth={2.25}
                  style={{ color: accent }}
                  aria-hidden
                />
                <span className="min-w-0 truncate">
                  <span className="font-semibold" style={{ color: accent }}>
                    {dayLabel(m.next.starts_at, now)}
                  </span>
                  {" · "}
                  {m.next.title}
                </span>
              </span>
            ) : (
              <span
                className="mt-0.5 block truncate text-[11px] leading-snug"
                style={{ color: "var(--app-ink-3)" }}
              >
                {m.hero_blurb || (m.count > 0 ? `${m.count} ${m.count === 1 ? "place" : "places"}` : m.type)}
              </span>
            )}
          </Link>
        );
      })}
    </div>
  );
}
