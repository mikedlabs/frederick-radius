import type { EventWithMeta } from "@/lib/loaders/events";
import { CATEGORY_BY_SLUG } from "@/data/categories";
import { Clock } from "lucide-react";

/**
 * "Tonight at a glance" — the editorial marquee of what's starting
 * in the next few hours. This is the surface that actually answers
 * the question people open /events to ask: "what's happening *now*?"
 *
 * Photo-led, horizontal rail. Each card is 220px wide with the venue
 * photo as backdrop, a category-tinted chip up top, the event title
 * set in serif, and the start time + venue underneath. Cards link to
 * the event detail. The whole rail scroll-snaps so each card lands
 * cleanly on the eye.
 *
 * Different from the explorer's "Tonight" lens: that filters the
 * underlying list. This is a curated marquee, capped at 8, with a
 * different visual register so the page reads as magazine first,
 * directory second.
 */

function formatStartTime(iso: string): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(iso));
}

function relativeStart(iso: string, nowMs: number): string {
  const t = +new Date(iso);
  const dMin = Math.round((t - nowMs) / 60000);
  if (dMin <= 0) return "Now";
  if (dMin < 60) return `in ${dMin}m`;
  const dH = Math.round(dMin / 60);
  if (dH < 8) return `in ${dH}h`;
  return formatStartTime(iso);
}

export default function TonightRail({ events }: { events: EventWithMeta[] }) {
  if (events.length === 0) return null;
  const now = Date.now();
  const visible = events.slice(0, 8);

  return (
    <section aria-label="Tonight at a glance" className="space-y-2">
      <header className="flex items-baseline justify-between">
        <div className="flex items-baseline gap-2.5">
          <span
            aria-hidden
            className="block h-[3px] w-8 rounded-full"
            style={{ background: "var(--app-brand)" }}
          />
          <h2
            className="font-serif text-[20px] font-semibold tracking-tight"
            style={{ color: "var(--app-ink)" }}
          >
            Tonight at a glance
          </h2>
        </div>
        <span
          className="text-[10.5px] font-bold uppercase tracking-[0.12em] tabular-nums"
          style={{ color: "var(--app-ink-3)" }}
        >
          {visible.length} starting soon
        </span>
      </header>

      <div className="-mx-4 px-4">
        <div className="shelf-rail gap-2.5 pb-1 snap-x snap-mandatory">
          {visible.map((e) => {
            const cat = CATEGORY_BY_SLUG[e.category ?? ""];
            const accent = cat?.color ?? "var(--app-brand)";
            const photo = e.hero_image ?? null;
            return (
              <a
                key={e.slug}
                href={`/events/${e.slug}`}
                className="tactile tactile-interactive group relative block w-[220px] shrink-0 snap-start overflow-hidden rounded-[var(--app-radius-lg)] border bg-[var(--app-bg-elevated)] shadow-[var(--app-shadow-1)]"
                style={{ borderColor: "var(--app-border)" }}
              >
                {/* Photo or category-tinted gradient banner */}
                <div
                  className="relative h-[140px] w-full overflow-hidden"
                  style={{
                    background: photo
                      ? `linear-gradient(180deg, transparent 40%, rgba(0,0,0,0.55) 100%), url(${photo}) center/cover no-repeat`
                      : `linear-gradient(155deg, color-mix(in srgb, ${accent} 45%, var(--app-bg-sunken)), color-mix(in srgb, ${accent} 14%, var(--app-bg-sunken)))`,
                  }}
                >
                  {/* Category chip */}
                  {cat && (
                    <span
                      className="absolute left-2 top-2 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[9.5px] font-bold uppercase tracking-[0.1em] backdrop-blur"
                      style={{
                        background: `color-mix(in srgb, ${accent} 90%, transparent)`,
                        color: "white",
                      }}
                    >
                      {cat.name}
                    </span>
                  )}
                  {/* Relative-time pill */}
                  <span
                    className="absolute right-2 top-2 inline-flex items-center gap-1 rounded-full bg-black/60 px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.08em] text-white backdrop-blur"
                  >
                    <Clock className="h-3 w-3" strokeWidth={2.5} aria-hidden />
                    {relativeStart(e.starts_at, now)}
                  </span>
                </div>

                <div className="space-y-0.5 px-3 py-2.5">
                  <p
                    className="line-clamp-2 font-serif text-[15px] font-semibold leading-tight tracking-tight"
                    style={{ color: "var(--app-ink)" }}
                  >
                    {e.title}
                  </p>
                  <p
                    className="line-clamp-1 text-[11.5px]"
                    style={{ color: "var(--app-ink-3)" }}
                  >
                    {formatStartTime(e.starts_at)}
                    {e.venue_name ? ` · ${e.venue_name}` : ""}
                  </p>
                </div>
              </a>
            );
          })}
        </div>
      </div>
    </section>
  );
}
