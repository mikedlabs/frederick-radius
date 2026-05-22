import type { EventWithMeta } from "@/lib/loaders/events";
import { CATEGORY_BY_SLUG } from "@/data/categories";
import {
  Clock, Music, Palette, Theater, Baby, Apple, Landmark, Image as ImageIcon,
  Utensils, Trees, ShoppingBag, Activity, Heart, Building, GraduationCap,
  CalendarDays, BookOpen, Wine, Beer, Coffee, Sparkles,
} from "lucide-react";

// Lookup for category-icon names → component. We resolve the
// `icon` string from src/data/categories.ts (each entry lists a
// lucide icon name as a string) to the actual component, so the
// photo-less fallback can display the category's mark as a large
// ghosted watermark — editorial poster feel instead of a flat block.
const ICON_BY_NAME: Record<string, typeof Music> = {
  Music, Palette, Theater, Baby, Apple, Landmark, ImageIcon,
  Utensils, Trees, ShoppingBag, Activity, Heart, Building,
  GraduationCap, BookOpen, Wine, Beer, Coffee, Sparkles,
};

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
  // Server component — `now` is request-scoped. The "starting soon"
  // labels are meant to reflect the time the page rendered.
  // eslint-disable-next-line react-hooks/purity
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
            // Icon for the photo-less fallback: resolve the category's
            // icon string to a lucide component, fall back to a generic
            // calendar mark if the category is unknown or unmapped.
            const CatIcon = cat ? (ICON_BY_NAME[cat.icon] ?? CalendarDays) : CalendarDays;
            return (
              <a
                key={e.slug}
                href={`/events/${e.slug}`}
                className="tactile tactile-interactive group relative block w-[220px] shrink-0 snap-start overflow-hidden rounded-[var(--app-radius-lg)] border bg-[var(--app-bg-elevated)] shadow-[var(--app-shadow-1)]"
                style={{ borderColor: "var(--app-border)" }}
              >
                {/* Photo or editorial poster fallback. Photo cards get
                    a dark gradient overlay for chip legibility; photo-
                    less cards get a category-tinted poster: two-stop
                    diagonal gradient + a large ghosted category icon +
                    a subtle dot-grid texture overlay. */}
                <div
                  className="relative h-[140px] w-full overflow-hidden"
                  style={
                    photo
                      ? {
                          background: `linear-gradient(180deg, transparent 40%, rgba(0,0,0,0.55) 100%), url(${photo}) center/cover no-repeat`,
                        }
                      : {
                          background: `linear-gradient(140deg, color-mix(in srgb, ${accent} 70%, #1a1820) 0%, color-mix(in srgb, ${accent} 32%, #1a1820) 55%, color-mix(in srgb, ${accent} 8%, #1a1820) 100%)`,
                        }
                  }
                >
                  {!photo && (
                    <>
                      {/* Dot-grid texture — subtle, editorial. */}
                      <span
                        aria-hidden
                        className="absolute inset-0"
                        style={{
                          backgroundImage:
                            "radial-gradient(rgba(255,255,255,0.10) 1px, transparent 1px)",
                          backgroundSize: "12px 12px",
                          mixBlendMode: "overlay",
                        }}
                      />
                      {/* Category icon as ghosted watermark — visual
                          identity for the card without a photo. */}
                      <CatIcon
                        aria-hidden
                        className="absolute -bottom-2 -right-2 h-[110px] w-[110px]"
                        strokeWidth={1.25}
                        style={{
                          color: "white",
                          opacity: 0.22,
                          transform: "rotate(-6deg)",
                        }}
                      />
                    </>
                  )}
                  {/* Category chip */}
                  {cat && (
                    <span
                      className="absolute left-2 top-2 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[9.5px] font-bold uppercase tracking-[0.1em] backdrop-blur"
                      style={{
                        background: photo
                          ? `color-mix(in srgb, ${accent} 90%, transparent)`
                          : "rgba(255,255,255,0.18)",
                        color: "white",
                        boxShadow: photo ? "none" : "inset 0 0 0 1px rgba(255,255,255,0.20)",
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
