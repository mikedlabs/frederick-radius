import Link from "next/link";
import { CalendarDays } from "lucide-react";
import { MUNICIPALITIES } from "@/data/municipalities";
import { eventsInMunicipality } from "@/lib/loaders/events";

// A deterministic System-Black accent per town so the grid reads as
// distinct tiles, not one grey list.
const ACCENTS = ["#A03A22", "#2F5470", "#1E6B3A", "#7E2C6F", "#B07A1E", "#3F5E8F"];
function accentFor(slug: string): string {
  let h = 0;
  for (let i = 0; i < slug.length; i++) h = (h * 31 + slug.charCodeAt(i)) | 0;
  return ACCENTS[Math.abs(h) % ACCENTS.length];
}

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
 * All 13 municipalities as a visual tile grid, ORDERED BY POPULATION —
 * the city first, down to the smallest village. Each tile carries:
 *   • the town name + its population (the ordering, made legible),
 *   • a one-line interesting fact (the town's identity), and
 *   • its next event as a time-stamped "move" when something's on (alive).
 * A quiet town just omits the move line — its fact still says who it is.
 */
export default function MunicipalityStrip() {
  const now = new Date();
  const towns = MUNICIPALITIES.map((m) => {
    // Soonest upcoming event = the town's next "move". One read per town.
    const next =
      eventsInMunicipality(m.slug, true, now)
        .filter((e) => Number.isFinite(Date.parse(e.starts_at)))
        .sort((a, b) => Date.parse(a.starts_at) - Date.parse(b.starts_at))[0] ?? null;
    return { ...m, next };
  }).sort((a, b) => b.population - a.population);

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
            {/* Name + population — the town and its size, so the grid's
                population ordering is legible, not just implied. */}
            <div className="flex items-baseline gap-2">
              <span
                className="min-w-0 flex-1 truncate text-[14px] font-semibold tracking-tight"
                style={{ color: "var(--app-ink)" }}
              >
                {m.name}
              </span>
              <span
                className="shrink-0 text-[10px] tabular-nums"
                style={{ color: "var(--app-ink-3)" }}
                aria-label={`Population ${m.population.toLocaleString()}`}
              >
                {m.population.toLocaleString()}
              </span>
            </div>
            {/* The interesting fact — short, the town's identity. */}
            <span
              className="mt-0.5 block truncate text-[11px] leading-snug"
              style={{ color: "var(--app-ink-3)" }}
            >
              {m.fact}
            </span>
            {/* Next event as a time-stamped move — only when something's
                on, so the card answers "what's the move here?" (E2). */}
            {m.next && (
              <span
                className="mt-1 flex items-center gap-1 text-[11px] leading-snug"
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
            )}
          </Link>
        );
      })}
    </div>
  );
}
