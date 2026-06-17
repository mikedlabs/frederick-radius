"use client";

import { useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { Martini, Beer, Wine, Utensils, Pizza, Coffee, Croissant, ChevronDown, type LucideIcon } from "lucide-react";
import type { TodaysDeal } from "@/lib/loaders/todaysDeals";
import FieldStamp from "@/components/ui/FieldStamp";

/** Happy-hour-vibe glyph keyed to category — a drink or a plate, never a tag. */
const DEAL_ICON: Record<string, LucideIcon> = {
  bar: Martini, brewery: Beer, winery: Wine, pizza: Pizza, restaurant: Utensils, bakery: Croissant, coffee: Coffee,
};
const iconFor = (cat?: string): LucideIcon => DEAL_ICON[cat ?? ""] ?? Martini;

/**
 * Vintage field-guide aesthetic (owner ref: explorer record cards + merit
 * stamps). Each deal is an OFFICIAL FIELD RECORD on aged paper:
 *   - alternating cream / kraft stock so a stack reads as varied papers
 *   - a "filing ink" double rule + corner registration ticks per card
 *   - a mono file number, ruled WHEN / WHERE fields with leader dots
 *   - the venue as the serif "subject", and the verified wax seal struck
 *     in the corner (FieldStamp) — the moat, certified.
 * Colors are disciplined: paper + one filing ink (spruce / slate) + the
 * vermilion stamp. No rainbow passes; the variety is in the paper + ink.
 */
const PAPER = ["var(--app-bg-elevated-solid)", "color-mix(in srgb, var(--app-bg-sunken) 42%, var(--app-bg-elevated-solid))"];
const INK = ["var(--app-brand-2)", "var(--app-cool)"];
const paperAt = (i: number): string => PAPER[i % PAPER.length];
// Offset the ink from the paper so cream/kraft pair with spruce/slate in
// alternating combinations (cream+spruce, kraft+slate, …).
const inkAt = (i: number): string => INK[(i + 1) % INK.length];

// Light overlap — each stacked record shows its filing header AND subject
// (not just a sliver), so the deals are readable at a glance; fanning open
// reveals the ruled fields + the field notes.
const OVERLAP = 62;
const SPRING = { type: "spring" as const, stiffness: 360, damping: 38, mass: 0.9 };

/** Four L-shaped registration ticks — the printing-press corner marks that
 *  make the card read as a struck record, not a UI panel. */
function CornerTicks({ color }: { color: string }) {
  const base = "pointer-events-none absolute h-2 w-2";
  const c = `color-mix(in srgb, ${color} 55%, transparent)`;
  return (
    <>
      <span aria-hidden className={`${base} left-1.5 top-1.5`} style={{ borderTop: `1px solid ${c}`, borderLeft: `1px solid ${c}` }} />
      <span aria-hidden className={`${base} right-1.5 top-1.5`} style={{ borderTop: `1px solid ${c}`, borderRight: `1px solid ${c}` }} />
      <span aria-hidden className={`${base} bottom-1.5 left-1.5`} style={{ borderBottom: `1px solid ${c}`, borderLeft: `1px solid ${c}` }} />
      <span aria-hidden className={`${base} bottom-1.5 right-1.5`} style={{ borderBottom: `1px solid ${c}`, borderRight: `1px solid ${c}` }} />
    </>
  );
}

/** A ruled form field — mono label, dotted leader, the value right-aligned.
 *  Evokes the explorer record card's DATE SIGHTED / LOCATION rows. */
function Field({ label, value, valueColor, ink }: { label: string; value: string; valueColor: string; ink: string }) {
  return (
    <div className="flex items-baseline gap-2">
      <span className="shrink-0 font-mono text-[8.5px] font-semibold uppercase tracking-[0.16em]" style={{ color: `color-mix(in srgb, ${ink} 75%, var(--app-ink-3))` }}>
        {label}
      </span>
      <span aria-hidden className="min-w-[10px] flex-1 self-center" style={{ borderBottom: `1px dotted color-mix(in srgb, ${ink} 38%, transparent)` }} />
      <span className="min-w-0 truncate text-right font-mono text-[12px] font-bold tabular-nums tracking-[0.01em]" style={{ color: valueColor }}>
        {value}
      </span>
    </div>
  );
}

/**
 * Today's Deals as a fanned stack of FIELD RECORD CARDS. By default they
 * overlap in a recessed paper pocket (each filing header peeking); the header
 * chevron fans them open with a spring. Each record taps through to its place.
 */
export default function TodaysDealsStack({ deals, weekday }: { deals: TodaysDeal[]; weekday: string }) {
  const [expanded, setExpanded] = useState(false);
  const stacked = !expanded && deals.length > 1;
  const wk = weekday.slice(0, 3).toUpperCase();

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

      {/* Card-holder POCKET — when stacked the records sit in a recessed paper
          slot (inset shadow + a thin highlight lip), like cards tucked in a
          field folder; it relaxes to transparent when fanned open. */}
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
          const ink = inkAt(i);
          const paper = paperAt(i);
          const file = `${wk}·${String(i + 1).padStart(2, "0")}`;
          return (
            <motion.li
              key={d.slug}
              initial={false}
              animate={{ marginTop: i === 0 ? 0 : stacked ? -OVERLAP : 14 }}
              transition={SPRING}
              style={{ position: "relative", zIndex: i }}
            >
              <Link
                href={`/places/${d.slug}`}
                aria-label={`${d.name}: ${d.offer}`}
                className="tactile-interactive relative block overflow-hidden rounded-[var(--app-radius-md)] px-4 pb-3.5 pt-2.5"
                style={{
                  background: paper,
                  backgroundImage: "var(--app-paper-light)",
                  // Filing-ink double rule: outer line, a paper gap, then a
                  // faint inner rule — the record-card frame from the ref.
                  border: `1px solid color-mix(in srgb, ${ink} 42%, var(--app-border))`,
                  boxShadow: `inset 0 0 0 3px ${paper}, inset 0 0 0 4px color-mix(in srgb, ${ink} 22%, transparent), var(--app-elev-1), var(--app-hi)`,
                  color: "var(--app-ink)",
                }}
              >
                <CornerTicks color={ink} />
                {/* Engraved specimen glyph, faint in the corner (the field-guide
                    plate behind the record). */}
                <Icon aria-hidden className="pointer-events-none absolute -bottom-6 -right-4 h-[124px] w-[124px] rotate-[8deg]" strokeWidth={0.9} style={{ color: ink, opacity: 0.08 }} />

                {/* Verified wax seal — struck in the top-right corner. */}
                <FieldStamp
                  id={`deal-${d.slug}`}
                  top="VERIFIED"
                  bottom="AT SOURCE"
                  size={46}
                  tone="var(--app-brand)"
                  rotate={-8}
                  className="absolute right-1.5 top-1"
                  style={{ opacity: 0.62 }}
                />

                <div className="relative">
                  {/* Filing header — the record class + a file number (number in
                      vermilion, like the ref's red individual-file code). */}
                  <div className="flex items-center gap-1.5 pr-12">
                    <span className="font-mono text-[8.5px] font-semibold uppercase tracking-[0.18em]" style={{ color: `color-mix(in srgb, ${ink} 80%, var(--app-ink-3))` }}>
                      Field note
                    </span>
                    <span aria-hidden style={{ color: "var(--app-ink-3)" }}>·</span>
                    <span className="font-mono text-[8.5px] font-semibold uppercase tracking-[0.14em]" style={{ color: "var(--app-ink-3)" }}>
                      No.&nbsp;<span style={{ color: "var(--app-brand-press)" }}>{file}</span>
                    </span>
                  </div>

                  {/* Subject — the venue, set in the serif display, with its
                      category specimen mark. */}
                  <div className="mt-1.5 flex items-start gap-2.5 pr-10">
                    <span aria-hidden className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-full" style={{ background: `color-mix(in srgb, ${ink} 13%, transparent)`, color: ink }}>
                      <Icon className="h-[15px] w-[15px]" strokeWidth={2} />
                    </span>
                    <h3 className="min-w-0 flex-1 font-serif text-[17px] font-semibold leading-[1.08] tracking-[-0.01em]" style={{ color: "var(--app-ink)" }}>
                      {d.name}
                    </h3>
                  </div>

                  {/* Ruled fields — WHEN (the actionable time) + WHERE. */}
                  {(d.hours || d.town) && (
                    <div className="mt-2.5 space-y-1.5">
                      {d.hours && <Field label="When" value={d.hours} valueColor="var(--app-brand-press)" ink={ink} />}
                      {d.town && <Field label="Where" value={d.town} valueColor="var(--app-ink-2)" ink={ink} />}
                    </div>
                  )}

                  {/* The offer — the record's entry, a short supporting line. */}
                  <p className="mt-2.5 line-clamp-2 text-[13px] leading-snug" style={{ color: "var(--app-ink-2)" }}>
                    {d.offer}
                  </p>

                  {/* Field Notes the venue's own site buries — park + a tip.
                      Only when fanned open: the stacked sliver stays lean. */}
                  {!stacked && (d.park || d.tip) && (
                    <div className="mt-3 space-y-1.5 border-t pt-2.5" style={{ borderColor: `color-mix(in srgb, ${ink} 22%, transparent)` }}>
                      {d.park && (
                        <p className="line-clamp-1 text-[11.5px] leading-snug" style={{ color: "var(--app-ink-2)" }}>
                          <span className="font-mono text-[8.5px] font-semibold uppercase tracking-[0.14em]" style={{ color: `color-mix(in srgb, ${ink} 75%, var(--app-ink-3))` }}>Park&nbsp;&nbsp;</span>
                          {d.park}
                        </p>
                      )}
                      {d.tip && (
                        <p className="line-clamp-2 text-[11.5px] leading-snug" style={{ color: "var(--app-ink-2)" }}>
                          <span className="font-mono text-[8.5px] font-semibold uppercase tracking-[0.14em]" style={{ color: `color-mix(in srgb, ${ink} 75%, var(--app-ink-3))` }}>Tip&nbsp;&nbsp;</span>
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
        href="/deals"
        className="tap-44 flex items-center justify-between px-0.5 pt-0.5 text-[12px] font-semibold"
        style={{ color: "var(--app-brand)" }}
      >
        Every deal, by day
        <span aria-hidden>→</span>
      </Link>
    </section>
  );
}
