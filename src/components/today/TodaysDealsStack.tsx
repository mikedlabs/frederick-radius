import Link from "next/link";
import { BadgeCheck } from "lucide-react";
import type { TodaysDeal } from "@/lib/loaders/todaysDeals";
import { splitDeal } from "@/lib/happyHourDeal";

/**
 * Today's Intel — the verified day-of-week specials kept as a FIELD LEDGER: a
 * paper page with faint ruled baselines, a sober day-stamp in the corner, and
 * the gold figures running down a right-aligned amount column you scan top to
 * bottom. It keeps the /happy-hour priced-index DNA (serif venue · dotted
 * leader · gold-mono figure) but reframes it as a hand-kept almanac page rather
 * than a flat list — the "clever" device does real work (the ruled grid forces
 * the amount column) and stays calm field-guide, not a SaaS card or a novelty
 * receipt. A single "verified at source" line closes the page. Server
 * component (plain Links).
 */
const MAX_ROWS = 12;

/** One ledger line: VENUE ········· $HOOK on the rule, then the gist + when/where. */
function IntelRow({ deal: d }: { deal: TodaysDeal }) {
  const { hook, rest } = splitDeal(d.offer);
  const meta = [d.hours, d.town].filter(Boolean).join("  ·  ");

  return (
    <Link
      href={`/places/${d.slug}`}
      aria-label={`${d.name}: ${d.offer}`}
      className="tactile-interactive group flex min-h-[52px] flex-col justify-center"
    >
      {/* The ledger line — serif venue, dotted leader, gold figure in the
          right-aligned amount column. */}
      <div className="flex items-baseline gap-1.5">
        <span
          className="shrink-0 truncate font-serif text-[15.5px] font-semibold tracking-[-0.01em]"
          style={{ color: "var(--app-ink)", maxWidth: "58%" }}
        >
          {d.name}
        </span>
        <span
          aria-hidden
          className="mb-1 flex-1 self-end"
          style={{ borderBottom: "2px dotted color-mix(in srgb, var(--app-ink) 26%, transparent)" }}
        />
        <span
          className="shrink-0 text-right font-mono text-[14px] font-bold tabular-nums tracking-[0.01em]"
          style={{ minWidth: "58px", color: hook ? "var(--app-accent-press)" : "var(--app-ink-3)" }}
        >
          {hook ?? "Specials"}
        </span>
      </div>

      {/* The substance + a quiet mono where/when tail (single line so it sits
          cleanly on the rule). */}
      <div className="mt-0.5 flex items-baseline gap-2">
        <span className="min-w-0 flex-1 truncate text-[12px] leading-snug" style={{ color: "var(--app-ink-2)" }}>
          {rest || d.offer}
        </span>
        {meta && (
          <span className="shrink-0 font-mono text-[10px] uppercase tracking-[0.06em]" style={{ color: "var(--app-ink-3)" }}>
            {meta}
          </span>
        )}
      </div>
    </Link>
  );
}

export default function TodaysDealsStack({
  deals,
  weekday,
  dayAbbr,
  dayNum,
}: {
  deals: TodaysDeal[];
  weekday: string;
  dayAbbr: string;
  dayNum: string;
}) {
  const shown = deals.slice(0, MAX_ROWS);

  return (
    <section aria-label={`Verified intel for ${weekday}`} className="space-y-2">
      {/* The ledger page — warm paper stock + grain + tactile depth. */}
      <div
        className="relative overflow-hidden rounded-[var(--app-radius-md)] px-3.5 py-3"
        style={{
          backgroundColor: "var(--app-bg-elevated-solid)",
          backgroundImage: "var(--app-paper-light)",
          boxShadow: "var(--app-elev-1), var(--app-hi), var(--app-edge)",
        }}
      >
        {/* Header: the masthead + a sober day-stamp tab in the corner. */}
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="font-mono text-[10px] font-bold uppercase tracking-[0.14em]" style={{ color: "var(--app-brand)" }}>
              Today&rsquo;s intel
            </p>
            <p className="mt-0.5 font-mono text-[10px] tabular-nums" style={{ color: "var(--app-ink-3)" }}>
              {deals.length} verified special{deals.length === 1 ? "" : "s"}
            </p>
          </div>
          {/* Day-stamp — opaque so it sits cleanly over the ruled page. */}
          <span
            className="flex shrink-0 flex-col items-center rounded-[var(--app-radius-sm)] px-2.5 py-1"
            style={{ background: "var(--app-bg-elevated-solid)", boxShadow: "var(--app-edge), var(--app-hi)" }}
          >
            <span className="font-mono text-[9.5px] font-bold uppercase tracking-[0.16em]" style={{ color: "var(--app-brand-2)" }}>
              {dayAbbr}
            </span>
            <span aria-hidden className="my-1 h-px w-full" style={{ background: "color-mix(in srgb, var(--app-ink) 18%, transparent)" }} />
            <span className="font-serif text-[18px] font-semibold leading-none tabular-nums" style={{ color: "var(--app-ink)" }}>
              {dayNum}
            </span>
          </span>
        </div>

        {/* The ruled ledger — faint baselines every row; the rows sit on them. */}
        <ul
          className="mt-2"
          style={{
            backgroundImage:
              "repeating-linear-gradient(to bottom, transparent 0px, transparent 51px, color-mix(in srgb, var(--app-ink) 8%, transparent) 51px, color-mix(in srgb, var(--app-ink) 8%, transparent) 52px)",
          }}
        >
          {shown.map((d) => (
            <li key={d.slug}>
              <IntelRow deal={d} />
            </li>
          ))}
        </ul>

        {/* The page's sign-off — one quiet verified line, no boxed stamp. */}
        <div
          className="mt-2 flex items-center gap-1.5 border-t border-dashed pt-2"
          style={{ borderColor: "color-mix(in srgb, var(--app-ink) 22%, transparent)" }}
        >
          <BadgeCheck className="h-3 w-3 shrink-0" strokeWidth={2} style={{ color: "var(--app-brand-2)" }} aria-hidden />
          <span className="font-mono text-[9px] font-semibold uppercase tracking-[0.14em]" style={{ color: "var(--app-brand-2)" }}>
            Verified at source
          </span>
        </div>
      </div>

      <Link
        href="/deals"
        className="tap-44 flex items-center justify-between px-0.5 text-[12px] font-semibold"
        style={{ color: "var(--app-brand)" }}
      >
        All intel, by day
        <span aria-hidden>→</span>
      </Link>
    </section>
  );
}
