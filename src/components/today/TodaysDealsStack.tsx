"use client";

import { useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { Martini, Beer, Wine, Utensils, Pizza, Coffee, Croissant, ChevronDown, type LucideIcon } from "lucide-react";
import type { TodaysDeal } from "@/lib/loaders/todaysDeals";
import { splitDeal } from "@/lib/happyHourDeal";
import FieldStamp from "@/components/ui/FieldStamp";

/** Happy-hour-vibe glyph keyed to category — a drink or a plate, never a tag. */
const DEAL_ICON: Record<string, LucideIcon> = {
  bar: Martini, brewery: Beer, winery: Wine, pizza: Pizza, restaurant: Utensils, bakery: Croissant, coffee: Coffee,
};
const iconFor = (cat?: string): LucideIcon => DEAL_ICON[cat ?? ""] ?? Martini;

/**
 * Vintage field-guide aesthetic (owner ref: explorer record cards + merit
 * stamps), pushed bold. Each deal is a COLOR-CODED FIELD RECORD on aged paper:
 *   - one of four filing inks per card (spruce / slate / vermilion / black),
 *     struck through the whole card so a stack reads as color-tabbed files
 *   - a SOLID filing-ink header band with reversed-out type + the deal hook
 *   - a rotated left filing spine, the record-card signature
 *   - the venue as the serif "subject", ruled WHEN / WHERE fields w/ leaders
 *   - a big wax seal struck in the corner (FieldStamp) — the moat, certified.
 *
 * PROGRESSIVE DISCLOSURE: a card shows only the ESSENTIALS by default — the
 * deal, the hook on the band, and the WHEN / WHERE quick facts. The verbose
 * local intel (where to park + the insider tip) hides behind a per-card
 * "Local notes" toggle, so each open card stays compact until the reader asks
 * for more. Two tiers above that: the whole deck collapses to a stack of tabs.
 */
const INK = ["var(--app-brand-2)", "var(--app-cool)", "var(--app-brand-press)", "var(--app-ink)"];
const PAPER = ["var(--app-bg-elevated-solid)", "color-mix(in srgb, var(--app-bg-sunken) 42%, var(--app-bg-elevated-solid))"];
const inkAt = (i: number): string => INK[i % INK.length];
// Offset the paper from the ink so each card is a distinct paper+ink combo.
const paperAt = (i: number): string => PAPER[(i + 1) % PAPER.length];
/** Reversed-out type on the solid header band (paper-on-dark token). */
const REVERSED = "var(--app-ink-inverse)";

// Stacked, each record is CLIPPED to a compact filing tab — its colored band
// (name + the deal) plus a thin sliver — and tucked under the next, so the
// collapsed deck reads as a tidy stack of tabs you fan open, not a tall run of
// full cards. STACK_MAX is the clipped height when stacked; OVERLAP tucks each
// tab under the previous (peek = STACK_MAX - OVERLAP ≈ the band height).
const STACK_MAX = 40;
const OVERLAP = 8;
const SPRING = { type: "spring" as const, stiffness: 360, damping: 38, mass: 0.9 };

/** A ruled form field — mono label, dotted leader, value right-aligned.
 *  Evokes the explorer record card's DATE SIGHTED / LOCATION rows. */
function Field({ label, value, valueColor, ink }: { label: string; value: string; valueColor: string; ink: string }) {
  return (
    <div className="flex items-baseline gap-2">
      <span className="shrink-0 font-mono text-[8.5px] font-semibold uppercase tracking-[0.16em]" style={{ color: `color-mix(in srgb, ${ink} 75%, var(--app-ink-3))` }}>
        {label}
      </span>
      <span aria-hidden className="min-w-[10px] flex-1 self-center" style={{ borderBottom: `1px dotted color-mix(in srgb, ${ink} 40%, transparent)` }} />
      <span className="min-w-0 truncate text-right font-mono text-[12px] font-bold tabular-nums tracking-[0.01em]" style={{ color: valueColor }}>
        {value}
      </span>
    </div>
  );
}

/** One mono-labelled intel line (Park / Tip), shown in full when revealed. */
function NoteLine({ label, value, ink }: { label: string; value: string; ink: string }) {
  return (
    <p className="text-[12px] leading-relaxed" style={{ color: "var(--app-ink-2)" }}>
      <span className="font-mono text-[8.5px] font-semibold uppercase tracking-[0.14em]" style={{ color: `color-mix(in srgb, ${ink} 75%, var(--app-ink-3))` }}>{label}&nbsp;&nbsp;</span>
      {value}
    </p>
  );
}

/** One field-record card with its own "Local notes" disclosure. */
function DealCard({ deal: d, idx, wk, stacked, Icon }: { deal: TodaysDeal; idx: number; wk: string; stacked: boolean; Icon: LucideIcon }) {
  const [notesOpen, setNotesOpen] = useState(false);
  const ink = inkAt(idx);
  const paper = paperAt(idx);
  const file = `${wk}·${String(idx + 1).padStart(2, "0")}`;
  // Split the offer into the headline hook ("50% OFF", "$8") and the rest
  // (what you get), so the figure is never printed twice (band + body).
  const { hook, rest } = splitDeal(d.offer);
  const hasNotes = Boolean(d.park || d.tip);

  return (
    <div
      className="tactile-interactive relative overflow-hidden rounded-[var(--app-radius-lg)]"
      style={{
        // Premium colored STOCK: the body is faintly washed in the card's own
        // filing-ink over the paper, so the fanned stack reads as a rich set of
        // colored records, not cream forms.
        backgroundColor: `color-mix(in srgb, ${ink} 6%, ${paper})`,
        backgroundImage: "var(--app-paper-light)",
        border: `1px solid color-mix(in srgb, ${ink} 34%, var(--app-border))`,
        // Layered float: crisp edge + highlight + a soft, ink-tinted ambient shadow.
        boxShadow: "var(--app-elev-1), var(--app-hi), 0 10px 26px -14px color-mix(in srgb, var(--app-ink) 30%, transparent)",
        color: "var(--app-ink)",
      }}
    >
      {/* Faint engraved specimen plate behind the record. */}
      <Icon aria-hidden className="pointer-events-none absolute -bottom-6 -right-4 h-[128px] w-[128px] rotate-[8deg]" strokeWidth={0.9} style={{ color: ink, opacity: 0.08 }} />

      {/* Left filing spine — rotated mono label, the record-card signature. */}
      <div
        aria-hidden
        className="absolute inset-y-0 left-0 flex w-[22px] items-center justify-center"
        style={{ background: `color-mix(in srgb, ${ink} 9%, transparent)`, borderRight: `1px solid color-mix(in srgb, ${ink} 30%, transparent)` }}
      >
        <span className="font-mono text-[7.5px] font-semibold uppercase tracking-[0.22em] [writing-mode:vertical-rl] rotate-180" style={{ color: `color-mix(in srgb, ${ink} 78%, var(--app-ink-3))` }}>
          Frederick&nbsp;Radius
        </span>
      </div>

      <div className="ml-[22px]">
        {/* The ESSENTIALS are the link to the place: band + the deal + WHEN/WHERE. */}
        <Link href={`/places/${d.slug}`} aria-label={`${d.name}: ${d.offer}`} className="block">
          {/* Solid filing-ink header band — the venue reversed out, the deal
              hook struck as a reversed pill; a letterpress sheen + seating line. */}
          <div
            className="flex items-center gap-2 px-3 py-2"
            style={{
              background: `linear-gradient(176deg, color-mix(in srgb, ${ink} 84%, #fff) 0%, ${ink} 62%)`,
              boxShadow: "inset 0 1px 0 color-mix(in srgb, #fff 20%, transparent), 0 1px 0 color-mix(in srgb, var(--app-ink) 16%, transparent)",
            }}
          >
            <Icon aria-hidden className="h-3.5 w-3.5 shrink-0" strokeWidth={2.5} style={{ color: REVERSED }} />
            <span className="min-w-0 flex-1 truncate font-serif text-[14.5px] font-semibold tracking-[-0.01em]" style={{ color: REVERSED }}>{d.name}</span>
            {hook ? (
              <span
                className="shrink-0 rounded-full px-2 py-0.5 font-mono text-[10px] font-bold uppercase tracking-[0.03em] tabular-nums"
                style={{ background: "color-mix(in srgb, #fff 20%, transparent)", color: REVERSED, boxShadow: "inset 0 0 0 1px color-mix(in srgb, #fff 28%, transparent)" }}
              >
                {hook}
              </span>
            ) : (
              <span className="shrink-0 font-mono text-[8px] font-bold uppercase tracking-[0.12em]" style={{ color: `color-mix(in srgb, ${REVERSED} 72%, transparent)` }}>No.&nbsp;{file}</span>
            )}
          </div>

          <div className="relative px-3.5 pt-2.5" style={{ paddingBottom: hasNotes ? 6 : 14 }}>
            {/* Verified wax seal — struck big in the corner, scattered angle. */}
            <FieldStamp
              id={`deal-${d.slug}`}
              top="VERIFIED"
              bottom="AT SOURCE"
              size={54}
              tone={ink}
              rotate={idx % 2 ? -9 : 7}
              className="absolute -top-0.5 right-0"
              style={{ opacity: 0.6 }}
            />

            {/* WHAT YOU GET — the deal, figure stripped (it's on the band). */}
            <p className="pr-12 text-[15.5px] font-medium leading-relaxed" style={{ color: "var(--app-ink)" }}>
              {rest}
            </p>

            {/* The quick facts that stay always-on: WHEN + WHERE. */}
            {(d.hours || d.town) && (
              <div className="mt-2.5 space-y-1.5">
                {d.hours && <Field label="When" value={d.hours} valueColor="var(--app-brand-press)" ink={ink} />}
                {d.town && <Field label="Where" value={d.town} valueColor="var(--app-ink-2)" ink={ink} />}
              </div>
            )}
          </div>
        </Link>

        {/* PER-CARD DISCLOSURE — the verbose local intel (park + tip) hides
            behind a tap, so the open card stays compact. A sibling of the link
            (never nested), so the toggle doesn't navigate. Only when fanned. */}
        {!stacked && hasNotes && (
          <div className="px-3.5 pb-3">
            <button
              type="button"
              onClick={() => setNotesOpen((v) => !v)}
              aria-expanded={notesOpen}
              className="tap-44 flex w-full items-center gap-2 pt-2"
            >
              <span className="font-mono text-[8.5px] font-semibold uppercase tracking-[0.16em]" style={{ color: `color-mix(in srgb, ${ink} 78%, var(--app-ink-3))` }}>
                {notesOpen ? "Hide local notes" : "Local notes"}
              </span>
              <span aria-hidden className="h-px flex-1 self-center" style={{ background: `color-mix(in srgb, ${ink} 24%, transparent)` }} />
              <ChevronDown aria-hidden className="h-3.5 w-3.5 transition-transform duration-300" strokeWidth={2.25} style={{ color: `color-mix(in srgb, ${ink} 70%, var(--app-ink-3))`, transform: notesOpen ? "rotate(180deg)" : "none" }} />
            </button>
            {notesOpen && (
              <div className="mt-2 space-y-2">
                {d.park && <NoteLine label="Park" value={d.park} ink={ink} />}
                {d.tip && <NoteLine label="Tip" value={d.tip} ink={ink} />}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * Today's Deals as a fanned stack of color-tabbed FIELD RECORD CARDS. By
 * default they overlap in a recessed paper pocket (each colored band peeking);
 * the header chevron fans them open with a spring. Each taps through.
 */
export default function TodaysDealsStack({ deals, weekday }: { deals: TodaysDeal[]; weekday: string }) {
  const [expanded, setExpanded] = useState(false);
  const stacked = !expanded && deals.length > 1;
  const wk = weekday.slice(0, 3).toUpperCase();

  return (
    <section aria-label={`Verified intel for ${weekday}`} className="space-y-2.5">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
        aria-label={expanded ? "Collapse the intel deck" : "Fan out the intel deck"}
        className="tap-44 flex w-full items-center gap-2 px-0.5"
      >
        <span className="font-mono text-[10px] font-bold uppercase tracking-[0.14em]" style={{ color: "var(--app-brand)" }}>
          Today&rsquo;s intel
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
          slot, like color-tabbed cards in a field folder; transparent when fanned. */}
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
            return (
              <motion.li
                key={d.slug}
                initial={false}
                animate={{ marginTop: i === 0 ? 0 : stacked ? -OVERLAP : 14, maxHeight: stacked ? STACK_MAX : 1400 }}
                transition={SPRING}
                style={{ position: "relative", zIndex: i, overflow: "hidden" }}
              >
                <DealCard deal={d} idx={i} wk={wk} stacked={stacked} Icon={Icon} />
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
        All intel, by day
        <span aria-hidden>→</span>
      </Link>
    </section>
  );
}
