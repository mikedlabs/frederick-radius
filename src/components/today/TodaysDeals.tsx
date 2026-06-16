import Link from "next/link";
import { Martini, Beer, Wine, Utensils, Pizza, Coffee, Croissant, type LucideIcon } from "lucide-react";
import { todaysDeals, EASTERN_WEEKDAY } from "@/lib/loaders/todaysDeals";

/** A happy-hour-vibe glyph keyed to the place category — a drink or a plate,
 *  never a retail price tag. Defaults to the cocktail glass. */
const DEAL_ICON: Record<string, LucideIcon> = {
  bar: Martini, brewery: Beer, winery: Wine, pizza: Pizza, restaurant: Utensils, bakery: Croissant, coffee: Coffee,
};
const iconFor = (cat?: string): LucideIcon => DEAL_ICON[cat ?? ""] ?? Martini;

/** Each pass takes the color of its category — earthy Frederick-palette tones
 *  (not garish), so a glance reads bar vs brewery vs winery. The card gradient
 *  darkens toward ink at the bottom so white pass text always holds. */
const DEAL_COLOR: Record<string, string> = {
  bar: "#7E1F1F", brewery: "#9A6B1A", winery: "#6E2233", pizza: "#A8421F",
  restaurant: "#A03A22", bakery: "#B0701E", coffee: "#7A4E26", market: "#3F5E4A",
};
const colorFor = (cat?: string): string => DEAL_COLOR[cat ?? ""] ?? "#A8421F";

/**
 * Today's Deals — the VERIFIED day-of-week specials running today (the Field
 * Notes moat on the front door), now presented as a STACK OF PASSES in the
 * Apple-Wallet idiom: each deal is a color-saturated rounded card carrying a
 * glyph + the venue (the pass "org" line), the offer as the primary field, and
 * WHEN / WHERE as wallet label-over-value fields. Color is the category in the
 * Frederick palette. Server component; self-hides when nothing runs today.
 */
export default function TodaysDeals({ now, limit = 4 }: { now: Date; limit?: number }) {
  const deals = todaysDeals(now, limit);
  if (deals.length === 0) return null;
  const weekday = EASTERN_WEEKDAY(now);

  return (
    <section aria-label={`Verified deals for ${weekday}`} className="space-y-2.5">
      {/* Minimal header — the passes carry the visual weight. */}
      <div className="flex items-center gap-2 px-0.5">
        <span className="font-mono text-[10px] font-bold uppercase tracking-[0.14em]" style={{ color: "var(--app-brand)" }}>
          Today&rsquo;s deals
        </span>
        <span className="font-mono text-[11px] uppercase tracking-[0.08em]" style={{ color: "var(--app-ink-3)" }}>{weekday}</span>
        <span aria-hidden className="h-px flex-1" style={{ background: "var(--app-border)" }} />
        <span className="font-mono text-[9.5px] uppercase tracking-[0.08em]" style={{ color: "var(--app-positive)" }}>verified</span>
      </div>

      {/* The pass stack. */}
      <ul className="space-y-2.5">
        {deals.map((d) => {
          const Icon = iconFor(d.category);
          const color = colorFor(d.category);
          return (
            <li key={d.slug}>
              <Link
                href={`/places/${d.slug}`}
                aria-label={`${d.name}: ${d.offer}`}
                className="tactile-interactive relative block overflow-hidden rounded-[20px] p-3.5"
                style={{
                  background: `linear-gradient(155deg, color-mix(in srgb, ${color} 92%, #17120c) 0%, color-mix(in srgb, ${color} 54%, #17120c) 100%)`,
                  boxShadow: "var(--app-elev-2), inset 0 1px 0 rgba(255,255,255,0.14)",
                  color: "#fff",
                }}
              >
                {/* Pass header — glyph chip + venue (the "org" line) + trust. */}
                <div className="flex items-center gap-2">
                  <span aria-hidden className="grid h-7 w-7 shrink-0 place-items-center rounded-full" style={{ background: "rgba(255,255,255,0.18)" }}>
                    <Icon className="h-[15px] w-[15px]" strokeWidth={2} />
                  </span>
                  <span className="min-w-0 flex-1 truncate font-mono text-[10.5px] font-semibold uppercase tracking-[0.1em]" style={{ color: "rgba(255,255,255,0.94)" }}>
                    {d.name}
                  </span>
                  {d.verified && (
                    <span className="shrink-0 font-mono text-[9px] font-semibold uppercase tracking-[0.08em]" style={{ color: "rgba(255,255,255,0.82)" }}>
                      ✓ verified
                    </span>
                  )}
                </div>

                {/* Primary field — the offer. */}
                <p className="mt-2.5 line-clamp-2 font-serif text-[17px] font-semibold leading-snug" style={{ color: "#fff", textShadow: "0 1px 2px rgba(0,0,0,0.18)" }}>
                  {d.offer}
                </p>

                {/* Wallet field row — label over value. */}
                <div className="mt-3 flex items-end gap-6">
                  {d.hours && (
                    <div className="shrink-0">
                      <p className="font-mono text-[8.5px] uppercase tracking-[0.12em]" style={{ color: "rgba(255,255,255,0.62)" }}>When</p>
                      <p className="font-mono text-[12.5px] font-semibold tabular-nums leading-tight" style={{ color: "#fff" }}>{d.hours}</p>
                    </div>
                  )}
                  {d.town && (
                    <div className="min-w-0">
                      <p className="font-mono text-[8.5px] uppercase tracking-[0.12em]" style={{ color: "rgba(255,255,255,0.62)" }}>Where</p>
                      <p className="truncate text-[12.5px] font-semibold leading-tight" style={{ color: "#fff" }}>{d.town}</p>
                    </div>
                  )}
                </div>
              </Link>
            </li>
          );
        })}
      </ul>

      <Link
        href="/happy-hour"
        className="tap-44 flex items-center justify-between px-0.5 pt-0.5 text-[12px] font-semibold"
        style={{ color: "var(--app-brand)" }}
      >
        Happy hours &amp; more
        <span aria-hidden>→</span>
      </Link>
    </section>
  );
}
