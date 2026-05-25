import Link from "next/link";
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
// Tighter than "all upcoming" because the strip is a weekly briefing,
// not a calendar dump: a town with a concert tonight should pop, a
// town with one event 3 months out should not.
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
function eventsThisWeek(slug: string, now: Date): number {
  const horizon = now.getTime() + WEEK_MS;
  return eventsInMunicipality(slug, true, now).filter((e) => {
    const t = Date.parse(e.starts_at);
    return Number.isFinite(t) && t <= horizon;
  }).length;
}

/**
 * All 12 towns as a visual tile grid (not a row of pills): each tile
 * carries the town name, the hero blurb, and — when a town has events
 * starting in the next 7 days — a small "live this week" chip so the
 * county reads as places + activity, not just a directory list.
 */
export default function MunicipalityStrip() {
  const now = new Date();
  const towns = MUNICIPALITIES.map((m) => ({
    ...m,
    count: publicPlacesByMunicipality(m.slug).length,
    weekEvents: eventsThisWeek(m.slug, now),
  })).sort((a, b) => b.count - a.count);

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
                  events starting in the next 7 days. Quiet
                  positive-tinted text + dot, no border or filled pill,
                  so it reads as a signal not a button. Hidden entirely
                  when zero (silence is the honest cue). */}
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
            {/* The hero_blurb already lives on each municipality
                (used on /m/[slug] and search results). Surfacing it
                here makes the strip read as editorial rather than
                a list of names. Falls back to the place count if a
                town doesn't have a blurb yet. */}
            <span
              className="block truncate text-[11px] leading-snug"
              style={{ color: "var(--app-ink-3)" }}
            >
              {m.hero_blurb || (m.count > 0 ? `${m.count} ${m.count === 1 ? "place" : "places"}` : m.type)}
            </span>
          </Link>
        );
      })}
    </div>
  );
}
