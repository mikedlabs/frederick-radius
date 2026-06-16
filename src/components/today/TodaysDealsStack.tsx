"use client";

import { useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { Martini, Beer, Wine, Utensils, Pizza, Coffee, Croissant, ChevronDown, type LucideIcon } from "lucide-react";
import type { TodaysDeal } from "@/lib/loaders/todaysDeals";

/** Happy-hour-vibe glyph keyed to category — a drink or a plate, never a tag. */
const DEAL_ICON: Record<string, LucideIcon> = {
  bar: Martini, brewery: Beer, winery: Wine, pizza: Pizza, restaurant: Utensils, bakery: Croissant, coffee: Coffee,
};
const iconFor = (cat?: string): LucideIcon => DEAL_ICON[cat ?? ""] ?? Martini;

/** Each pass gets its OWN color — a rich, distinct Frederick-palette tone by
 *  position, so the deck reads like a stack of varied Wallet cards rather than
 *  one repeated swatch. The glyph still tells you the kind of place; the color
 *  is just identity + variety. All dark enough to carry white pass text. */
const PALETTE = ["#A03A22", "#2F5E50", "#6E2233", "#3F5680", "#8A5A1C", "#76305F"];
const colorAt = (i: number): string => PALETTE[i % PALETTE.length];

// Light overlap — each stacked pass shows its venue AND the offer (not just a
// header sliver), so the deals are readable at a glance; the layered wallet
// look stays, just less buried. Fanning open still reveals the full fields.
const OVERLAP = 58;
const SPRING = { type: "spring" as const, stiffness: 360, damping: 38, mass: 0.9 };

/**
 * Today's Deals as an Apple-Wallet DECK: by default the passes overlap in a
 * fanned stack (each header peeking), and the header chevron fans them open
 * with a smooth spring. Each pass is its own color and taps straight through
 * to its place.
 */
export default function TodaysDealsStack({ deals, weekday }: { deals: TodaysDeal[]; weekday: string }) {
  const [expanded, setExpanded] = useState(false);
  const stacked = !expanded && deals.length > 1;

  return (
    <section aria-label={`Verified deals for ${weekday}`} className="space-y-2.5">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
        aria-label={expanded ? "Collapse the deals deck" : "Fan out the deals deck"}
        className="tap-44 flex w-full items-center gap-2 px-0.5"
      >
        <span className="font-mono text-[10px] font-bold uppercase tracking-[0.14em]" style={{ color: "var(--app-brand)" }}>
          Today&rsquo;s deals
        </span>
        <span className="font-mono text-[11px] uppercase tracking-[0.08em]" style={{ color: "var(--app-ink-3)" }}>{weekday}</span>
        <span aria-hidden className="h-px flex-1" style={{ background: "var(--app-border)" }} />
        <span className="font-mono text-[10px] tabular-nums" style={{ color: "var(--app-ink-3)" }}>{deals.length}</span>
        <ChevronDown
          aria-hidden
          className="h-4 w-4 transition-transform duration-300"
          strokeWidth={2.25}
          style={{ color: "var(--app-ink-3)", transform: expanded ? "rotate(180deg)" : "none" }}
        />
      </button>

      {/* Card-holder POCKET — when the deck is stacked the passes sit in a
          recessed paper slot (inset shadow + a thin highlight lip), so they
          read as cards tucked inside a wallet; it relaxes to transparent when
          fanned open. */}
      <div
        className="transition-all duration-300"
        style={
          stacked
            ? { background: "var(--app-bg-sunken)", boxShadow: "inset 0 2px 10px -3px rgba(22,20,14,0.16), inset 0 -1px 0 rgba(255,255,255,0.5)", borderRadius: 26, padding: "10px 8px 12px" }
            : { background: "transparent", boxShadow: "none", borderRadius: 26, padding: 0 }
        }
      >
      <ul className="relative">
        {deals.map((d, i) => {
          const Icon = iconFor(d.category);
          const color = colorAt(i);
          return (
            <motion.li
              key={d.slug}
              initial={false}
              animate={{ marginTop: i === 0 ? 0 : stacked ? -OVERLAP : 12 }}
              transition={SPRING}
              style={{ position: "relative", zIndex: i }}
            >
              <Link
                href={`/places/${d.slug}`}
                aria-label={`${d.name}: ${d.offer}`}
                className="tactile-interactive relative block overflow-hidden rounded-[var(--app-radius-lg)] p-4 pl-[18px]"
                style={{
                  // Field-guide "field record" card: warm category-tinted PAPER
                  // (not a saturated pass), an index rail, a hairline frame.
                  background: `color-mix(in srgb, ${color} 8%, var(--app-bg-elevated-solid))`,
                  border: `1px solid color-mix(in srgb, ${color} 26%, var(--app-border))`,
                  boxShadow: "var(--app-elev-1), var(--app-edge), var(--app-hi)",
                  color: "var(--app-ink)",
                }}
              >
                {/* Index rail (the card's category color). */}
                <span aria-hidden className="absolute inset-y-0 left-0 w-[3px]" style={{ background: color }} />
                {/* Engraved specimen glyph, faint in the corner. */}
                <Icon aria-hidden className="pointer-events-none absolute -bottom-5 -right-3 h-[120px] w-[120px] rotate-[8deg]" strokeWidth={1} style={{ color, opacity: 0.1 }} />
                <div className="relative">
                  <div className="flex items-center gap-2">
                    <span aria-hidden className="grid h-7 w-7 shrink-0 place-items-center rounded-full" style={{ background: `color-mix(in srgb, ${color} 15%, transparent)`, color }}>
                      <Icon className="h-[15px] w-[15px]" strokeWidth={2} />
                    </span>
                    <span className="min-w-0 flex-1 truncate font-mono text-[10.5px] font-semibold uppercase tracking-[0.12em]" style={{ color: "var(--app-ink-2)" }}>
                      {d.name}
                    </span>
                    {d.verified && (
                      // Verified stamp — a struck seal in the card's color.
                      <span aria-hidden title="verified at the source" className="grid h-[26px] w-[26px] shrink-0 place-items-center rounded-full font-bold" style={{ border: `1.5px solid color-mix(in srgb, ${color} 70%, transparent)`, color, transform: "rotate(-7deg)", fontSize: "13px" }}>
                        ✓
                      </span>
                    )}
                  </div>
                  <p className="mt-2.5 line-clamp-2 font-serif text-[18px] font-semibold leading-snug tracking-[-0.01em]" style={{ color: "var(--app-ink)" }}>
                    {d.offer}
                  </p>
                  {/* Specimen labels (the reference's DATE SIGHTED / LOCATION). */}
                  <div className="mt-3 flex items-end gap-6 border-t pt-2.5" style={{ borderColor: `color-mix(in srgb, ${color} 18%, var(--app-border))` }}>
                    {d.hours && (
                      <div className="shrink-0">
                        <p className="font-mono text-[8.5px] uppercase tracking-[0.14em]" style={{ color: "var(--app-ink-3)" }}>When</p>
                        <p className="font-mono text-[13px] font-semibold tabular-nums leading-tight" style={{ color }}>{d.hours}</p>
                      </div>
                    )}
                    {d.town && (
                      <div className="min-w-0">
                        <p className="font-mono text-[8.5px] uppercase tracking-[0.14em]" style={{ color: "var(--app-ink-3)" }}>Where</p>
                        <p className="truncate text-[13px] font-semibold leading-tight" style={{ color: "var(--app-ink)" }}>{d.town}</p>
                      </div>
                    )}
                  </div>
                  {/* Field Notes the venue's own site buries — park + a tip.
                      Only when the deck is fanned open: the stacked sliver stays
                      lean (offer + when + where), and the extra intel fills the
                      card's blank space once expanded. */}
                  {!stacked && (d.park || d.tip) && (
                    <div className="mt-2.5 space-y-1">
                      {d.park && (
                        <p className="line-clamp-1 text-[11.5px] leading-snug" style={{ color: "var(--app-ink-2)" }}>
                          <span className="font-mono text-[8.5px] uppercase tracking-[0.12em]" style={{ color: "var(--app-ink-3)" }}>Park&nbsp;&nbsp;</span>
                          {d.park}
                        </p>
                      )}
                      {d.tip && (
                        <p className="line-clamp-2 text-[11.5px] leading-snug" style={{ color: "var(--app-ink-2)" }}>
                          <span className="font-mono text-[8.5px] uppercase tracking-[0.12em]" style={{ color: "var(--app-ink-3)" }}>Tip&nbsp;&nbsp;</span>
                          {d.tip}
                        </p>
                      )}
                    </div>
                  )}
                </div>
              </Link>
            </motion.li>
          );
        })}
      </ul>
      </div>

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
