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
                className="tactile-interactive relative block overflow-hidden rounded-[22px] p-4"
                style={{
                  background: `linear-gradient(152deg, color-mix(in srgb, ${color} 88%, #fff) 0%, ${color} 34%, color-mix(in srgb, ${color} 58%, #120c08) 100%)`,
                  boxShadow: `0 14px 30px -12px color-mix(in srgb, ${color} 60%, transparent), 0 2px 8px -2px rgba(0,0,0,0.25), inset 0 1px 0 rgba(255,255,255,0.28), inset 0 0 0 1px rgba(255,255,255,0.06)`,
                  color: "#fff",
                }}
              >
                <span aria-hidden className="pointer-events-none absolute inset-0" style={{ background: "radial-gradient(130% 90% at 0% -10%, rgba(255,255,255,0.30), rgba(255,255,255,0.06) 34%, transparent 58%)" }} />
                <Icon aria-hidden className="pointer-events-none absolute -bottom-5 -right-3 h-[128px] w-[128px] rotate-[8deg]" strokeWidth={1.25} style={{ color: "#fff", opacity: 0.13 }} />
                <div className="relative">
                  <div className="flex items-center gap-2">
                    <span aria-hidden className="grid h-7 w-7 shrink-0 place-items-center rounded-full" style={{ background: "rgba(255,255,255,0.22)", boxShadow: "inset 0 1px 0 rgba(255,255,255,0.35)" }}>
                      <Icon className="h-[15px] w-[15px]" strokeWidth={2.25} />
                    </span>
                    <span className="min-w-0 flex-1 truncate font-mono text-[10.5px] font-semibold uppercase tracking-[0.12em]" style={{ color: "rgba(255,255,255,0.95)", textShadow: "0 1px 2px rgba(0,0,0,0.22)" }}>
                      {d.name}
                    </span>
                    {d.verified && (
                      <span className="inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 font-mono text-[8.5px] font-bold uppercase tracking-[0.1em]" style={{ background: "rgba(255,255,255,0.18)", color: "#fff", boxShadow: "inset 0 0 0 1px rgba(255,255,255,0.25)" }}>
                        ✓ Verified
                      </span>
                    )}
                  </div>
                  <p className="mt-3 line-clamp-3 font-serif text-[18px] font-semibold leading-snug tracking-[-0.01em]" style={{ color: "#fff", textShadow: "0 1px 3px rgba(0,0,0,0.22)" }}>
                    {d.offer}
                  </p>
                  <div className="mt-3.5 flex items-end gap-6 border-t pt-2.5" style={{ borderColor: "rgba(255,255,255,0.16)" }}>
                    {d.hours && (
                      <div className="shrink-0">
                        <p className="font-mono text-[8.5px] uppercase tracking-[0.14em]" style={{ color: "rgba(255,255,255,0.66)" }}>When</p>
                        <p className="font-mono text-[13px] font-semibold tabular-nums leading-tight" style={{ color: "#fff" }}>{d.hours}</p>
                      </div>
                    )}
                    {d.town && (
                      <div className="min-w-0">
                        <p className="font-mono text-[8.5px] uppercase tracking-[0.14em]" style={{ color: "rgba(255,255,255,0.66)" }}>Where</p>
                        <p className="truncate text-[13px] font-semibold leading-tight" style={{ color: "#fff" }}>{d.town}</p>
                      </div>
                    )}
                  </div>
                  {/* The local intel that filled the blank space — verified
                      Field Notes the venue's own site buries: where to park, an
                      insider tip. Each shows only when we have it. */}
                  {(d.park || d.tip) && (
                    <div className="mt-2.5 space-y-1">
                      {d.park && (
                        <p className="line-clamp-1 text-[11.5px] leading-snug" style={{ color: "rgba(255,255,255,0.84)" }}>
                          <span className="font-mono text-[8.5px] uppercase tracking-[0.12em]" style={{ color: "rgba(255,255,255,0.6)" }}>Park&nbsp;&nbsp;</span>
                          {d.park}
                        </p>
                      )}
                      {d.tip && (
                        <p className="line-clamp-2 text-[11.5px] leading-snug" style={{ color: "rgba(255,255,255,0.84)" }}>
                          <span className="font-mono text-[8.5px] uppercase tracking-[0.12em]" style={{ color: "rgba(255,255,255,0.6)" }}>Tip&nbsp;&nbsp;</span>
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
