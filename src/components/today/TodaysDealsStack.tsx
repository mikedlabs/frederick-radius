import Link from "next/link";
import { Martini, Beer, Wine, Utensils, Pizza, Coffee, Croissant, type LucideIcon } from "lucide-react";
import type { TodaysDeal } from "@/lib/loaders/todaysDeals";
import { splitDeal } from "@/lib/happyHourDeal";

/** Happy-hour-vibe glyph keyed to category — a drink or a plate, never a tag. */
const DEAL_ICON: Record<string, LucideIcon> = {
  bar: Martini, brewery: Beer, winery: Wine, pizza: Pizza, restaurant: Utensils, bakery: Croissant, coffee: Coffee,
};
const iconFor = (cat?: string): LucideIcon => DEAL_ICON[cat ?? ""] ?? Martini;

/**
 * Today's Intel — a 2-COLUMN grid of compact, color-coded field-record cards,
 * tuned to read well on a phone. Each verified deal is a half-width card:
 *   - one of four filing inks per card (spruce / slate / vermilion / black),
 *     so the grid reads as a sheet of color-tabbed records
 *   - a solid filing-ink header band: category glyph + venue (reversed serif)
 *     + the deal hook ("25% OFF") struck as a reversed pill
 *   - a compact body: the deal gist (2 lines) + a mono WHEN · WHERE line
 *   - aged paper stock + the tactile depth ladder (edge + highlight + lift)
 *
 * The old single-column fanned STACK (rotated spine, big wax seal, ruled
 * leader fields, per-card notes disclosure) was too heavy for a half-width
 * card; those details live on the place page now. Up to 12 cards show here;
 * the "All intel, by day" link carries the rest. Server component (plain Links).
 */
const INK = ["var(--app-brand-2)", "var(--app-cool)", "var(--app-brand-press)", "var(--app-ink)"];
const PAPER = ["var(--app-bg-elevated-solid)", "color-mix(in srgb, var(--app-bg-sunken) 42%, var(--app-bg-elevated-solid))"];
const inkAt = (i: number): string => INK[i % INK.length];
// Offset the paper from the ink so each card is a distinct paper+ink combo.
const paperAt = (i: number): string => PAPER[(i + 1) % PAPER.length];
/** Reversed-out type on the solid header band (paper-on-dark token). */
const REVERSED = "var(--app-ink-inverse)";

/** One compact half-width field-record card. Pure + presentational. */
function DealCard({ deal: d, idx, Icon }: { deal: TodaysDeal; idx: number; Icon: LucideIcon }) {
  const ink = inkAt(idx);
  const paper = paperAt(idx);
  // Split the offer into the headline hook ("50% OFF", "$8") and the rest
  // (what you get), so the figure is never printed twice (band + body).
  const { hook, rest } = splitDeal(d.offer);
  const meta = [d.hours, d.town].filter(Boolean).join("  ·  ");

  return (
    <Link
      href={`/places/${d.slug}`}
      aria-label={`${d.name}: ${d.offer}`}
      className="tactile-interactive relative flex h-full flex-col overflow-hidden rounded-[var(--app-radius-lg)]"
      style={{
        // Premium colored stock: faintly washed in the card's own filing ink
        // over paper, so the grid reads as a set of colored records.
        backgroundColor: `color-mix(in srgb, ${ink} 6%, ${paper})`,
        backgroundImage: "var(--app-paper-light)",
        border: `1px solid color-mix(in srgb, ${ink} 32%, var(--app-border))`,
        boxShadow: "var(--app-elev-1), var(--app-hi)",
        color: "var(--app-ink)",
      }}
    >
      {/* Faint engraved specimen glyph behind the record. */}
      <Icon aria-hidden className="pointer-events-none absolute -bottom-3 -right-2 h-[72px] w-[72px] rotate-[8deg]" strokeWidth={1} style={{ color: ink, opacity: 0.07 }} />

      {/* Solid filing-ink header band — glyph + venue reversed out + the deal
          hook as a reversed pill (venue truncates to make room on a phone). */}
      <div
        className="flex items-center gap-1.5 px-2.5 py-1.5"
        style={{
          background: `linear-gradient(176deg, color-mix(in srgb, ${ink} 84%, #fff) 0%, ${ink} 62%)`,
          boxShadow: "inset 0 1px 0 color-mix(in srgb, #fff 20%, transparent), 0 1px 0 color-mix(in srgb, var(--app-ink) 16%, transparent)",
        }}
      >
        <Icon aria-hidden className="h-3 w-3 shrink-0" strokeWidth={2.5} style={{ color: REVERSED }} />
        <span className="min-w-0 flex-1 truncate font-serif text-[13px] font-semibold tracking-[-0.01em]" style={{ color: REVERSED }}>
          {d.name}
        </span>
        {hook && (
          <span
            className="shrink-0 rounded-full px-1.5 py-px font-mono text-[9px] font-bold uppercase tracking-[0.02em] tabular-nums"
            style={{ background: "color-mix(in srgb, #fff 20%, transparent)", color: REVERSED, boxShadow: "inset 0 0 0 1px color-mix(in srgb, #fff 28%, transparent)" }}
          >
            {hook}
          </span>
        )}
      </div>

      {/* Body — the deal gist (figure stripped, it's on the band) + the WHEN ·
          WHERE quick facts pinned to the bottom so the grid rows align. */}
      <div className="relative flex flex-1 flex-col px-2.5 pb-2 pt-1.5">
        <p className="line-clamp-2 text-[12.5px] font-medium leading-snug" style={{ color: "var(--app-ink)" }}>
          {rest}
        </p>
        {meta && (
          <p className="mt-auto truncate pt-1.5 font-mono text-[10px] tracking-tight" style={{ color: "var(--app-ink-3)" }}>
            {meta}
          </p>
        )}
      </div>
    </Link>
  );
}

/**
 * Today's Deals — a 2-column grid of verified field-record cards (up to 12),
 * with a header eyebrow + an "All intel, by day" link to the rest.
 */
const MAX_CARDS = 12;

export default function TodaysDealsStack({ deals, weekday }: { deals: TodaysDeal[]; weekday: string }) {
  const shown = deals.slice(0, MAX_CARDS);

  return (
    <section aria-label={`Verified intel for ${weekday}`} className="space-y-2.5">
      <div className="flex items-center gap-2 px-0.5">
        <span className="font-mono text-[10px] font-bold uppercase tracking-[0.14em]" style={{ color: "var(--app-brand)" }}>
          Today&rsquo;s intel
        </span>
        <span className="font-mono text-[11px] uppercase tracking-[0.08em]" style={{ color: "var(--app-ink-3)" }}>{weekday}</span>
        <span aria-hidden className="h-px flex-1" style={{ background: "var(--app-border)" }} />
        <span className="font-mono text-[10px] tabular-nums" style={{ color: "var(--app-ink-3)" }}>{deals.length}</span>
      </div>

      {/* Two columns of compact records — sized to read well on a phone. */}
      <ul className="grid grid-cols-2 gap-2">
        {shown.map((d, i) => {
          const Icon = iconFor(d.category);
          return (
            <li key={d.slug} className="flex">
              <DealCard deal={d} idx={i} Icon={Icon} />
            </li>
          );
        })}
      </ul>

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
