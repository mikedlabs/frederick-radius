import Link from "next/link";
import { Martini, Beer, Wine, Utensils, Pizza, Coffee, Croissant, Clock3, MapPin, type LucideIcon } from "lucide-react";
import { todaysDeals, EASTERN_WEEKDAY } from "@/lib/loaders/todaysDeals";

/** A happy-hour-vibe glyph keyed to the place category — a drink or a plate,
 *  never a retail price tag. Defaults to the cocktail glass (the going-out
 *  read) so a deal reads as "worth heading out for," not "a coupon". */
const DEAL_ICON: Record<string, LucideIcon> = {
  bar: Martini, brewery: Beer, winery: Wine, pizza: Pizza, restaurant: Utensils, bakery: Croissant, coffee: Coffee,
};
const iconFor = (cat?: string): LucideIcon => DEAL_ICON[cat ?? ""] ?? Martini;

/**
 * Today's Deals — a compact strip of the VERIFIED day-of-week specials
 * running today (the Field Notes moat made visible on the front door, the
 * 4pm "what's worth going out for" answer). Server component; self-hides
 * when nothing runs today (honest empty). Each row taps through to the place;
 * each carries a "verified" chip so the trust is legible at the point of
 * decision.
 */
export default function TodaysDeals({ now, limit = 4 }: { now: Date; limit?: number }) {
  const deals = todaysDeals(now, limit);
  if (deals.length === 0) return null;
  const weekday = EASTERN_WEEKDAY(now);

  return (
    <div className="relative pt-[14px]">
      {/* Folder tab — same card language as the event tiles. */}
      <span
        className="absolute left-3 top-0 z-10 rounded-t-[8px] px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.12em] text-white"
        style={{ background: "color-mix(in srgb, var(--app-brand) 82%, var(--app-ink))", boxShadow: "var(--app-edge)" }}
      >
        Today&rsquo;s deals
      </span>
      <section
        aria-label={`Verified deals for ${weekday}`}
        className="overflow-hidden rounded-[var(--app-radius-lg)] rounded-tl-none border bg-[var(--app-bg-elevated)]"
        style={{ borderColor: "var(--app-border)", boxShadow: "var(--app-elev-1), var(--app-edge), var(--app-hi)" }}
      >
        <div className="flex items-center gap-2 px-3.5 pt-3">
          <span className="font-mono text-[11px] font-semibold uppercase tracking-[0.1em]" style={{ color: "var(--app-ink-2)" }}>
            {weekday}
          </span>
          <span aria-hidden className="h-px flex-1" style={{ background: "var(--app-border)" }} />
          <span className="font-mono text-[9.5px] uppercase tracking-[0.08em]" style={{ color: "var(--app-positive)" }}>
            verified
          </span>
        </div>

      <ul className="mt-1.5 px-1.5 pb-1.5">
        {deals.map((d, i) => {
          const Icon = iconFor(d.category);
          return (
          <li key={d.slug} className={i > 0 ? "border-t" : ""} style={i > 0 ? { borderColor: "color-mix(in srgb, var(--app-border) 60%, transparent)" } : undefined}>
            <Link
              href={`/places/${d.slug}`}
              className="tactile-interactive flex items-start gap-3 rounded-[var(--app-radius-md)] px-2 py-2.5 transition"
            >
              {/* Icon-led — a happy-hour glyph (drink/plate by category) gives
                  each deal a going-out anchor, not a retail price-tag read. */}
              <span
                aria-hidden
                className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-full"
                style={{ background: "color-mix(in srgb, var(--app-accent) 15%, var(--app-bg-elevated-solid))", color: "var(--app-accent)", boxShadow: "var(--app-edge)" }}
              >
                <Icon className="h-[15px] w-[15px]" strokeWidth={2} />
              </span>
              <span className="min-w-0 flex-1">
                {/* Three distinct parts, each its own visual datum:
                    1. the DEAL — the offer, ink headline (day prefix trimmed);
                    2. the TIME — an accent clock pill (when it runs);
                    3. the PLACE — pin + venue · town, mono.
                    Field-guide catalog grammar: the offer reads, the data
                    scans. */}
                <span className="line-clamp-2 text-[14px] font-semibold leading-snug" style={{ color: "var(--app-ink)" }}>
                  {d.offer}
                </span>
                <span className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1">
                  {d.hours && (
                    <span
                      className="inline-flex shrink-0 items-center gap-1 rounded-full px-1.5 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-[0.06em]"
                      style={{ background: "color-mix(in srgb, var(--app-accent) 15%, transparent)", color: "var(--app-accent)" }}
                    >
                      <Clock3 className="h-3 w-3" strokeWidth={2.25} aria-hidden />
                      {d.hours}
                    </span>
                  )}
                  <span className="inline-flex min-w-0 items-center gap-1 font-mono text-[10.5px] uppercase tracking-[0.06em]" style={{ color: "var(--app-ink-2)" }}>
                    <MapPin className="h-3 w-3 shrink-0" strokeWidth={2} style={{ color: "var(--app-ink-3)" }} aria-hidden />
                    <span className="truncate">
                      {d.name}{d.town ? ` · ${d.town}` : ""}
                    </span>
                  </span>
                </span>
              </span>
            </Link>
          </li>
          );
        })}
      </ul>

      <Link
        href="/happy-hour"
        className="tap-44 flex items-center justify-between border-t px-3.5 py-2 text-[12px] font-semibold"
        style={{ borderColor: "var(--app-border)", color: "var(--app-brand)" }}
      >
        Happy hours &amp; more
        <span aria-hidden>→</span>
      </Link>
      </section>
    </div>
  );
}
