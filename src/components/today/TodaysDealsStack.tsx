import Link from "next/link";
import type { TodaysDeal } from "@/lib/loaders/todaysDeals";
import { splitDeal } from "@/lib/happyHourDeal";

/**
 * Today's Intel — the verified day-of-week specials as a leader-dotted PRICED
 * INDEX, in the exact "Last Pour" voice of /happy-hour so the two surfaces
 * rhyme as one field guide.
 *
 * Each deal is a single index ROW (not a colored card): the venue set in serif,
 * a real dotted leader, and the deal HOOK ("$10 OFF", "25% OFF") struck flush
 * right in gold mono. A quiet second line carries the substance — what you get,
 * with the town/when as a mono tail — because unlike a happy hour (where
 * "venue + on now" is enough), a deal's value IS the specifics, so we keep
 * them. Typography + the leader rule carry the hierarchy; no boxes, no colored
 * stock, no per-row glyph. Up to 12 rows show; "All intel, by day" carries the
 * rest. Server component (plain Links).
 *
 * Replaces the earlier 2-column color-tabbed card grid (owner: make it look
 * like the happy-hour page, "maybe it's better as single lines").
 */
const MAX_ROWS = 12;

/** One priced-index row: VENUE ········· $HOOK, then the gist + where/when. */
function IntelRow({ deal: d }: { deal: TodaysDeal }) {
  // Split the offer into the headline hook ("$10 OFF", "25% OFF") and the rest
  // (what you actually get), so the figure leads in gold and the substance
  // carries the subline. `rest` falls back to the full offer when there's no
  // extractable figure (then the hook reads the honest "Specials").
  const { hook, rest } = splitDeal(d.offer);
  const meta = [d.hours, d.town].filter(Boolean).join("  ·  ");

  return (
    <Link
      href={`/places/${d.slug}`}
      aria-label={`${d.name}: ${d.offer}`}
      className="tactile-interactive group block py-2"
    >
      {/* The leader row — identical grammar to /happy-hour's PricedRow. */}
      <div className="flex items-baseline gap-1.5">
        <span
          className="shrink-0 truncate font-serif text-[15.5px] font-semibold tracking-[-0.01em]"
          style={{ color: "var(--app-ink)", maxWidth: "60%" }}
        >
          {d.name}
        </span>
        <span
          aria-hidden
          className="mb-1 flex-1 self-end"
          style={{ borderBottom: "2px dotted color-mix(in srgb, var(--app-ink) 26%, transparent)" }}
        />
        <span
          className="shrink-0 font-mono text-[14px] font-bold tabular-nums tracking-[0.01em]"
          style={{ color: hook ? "var(--app-accent-press)" : "var(--app-ink-3)" }}
        >
          {hook ?? "Specials"}
        </span>
      </div>

      {/* The substance (what you get) + a quiet mono where/when tail. */}
      <div className="mt-0.5 flex items-baseline gap-2">
        <span className="min-w-0 flex-1 truncate text-[12px] leading-snug" style={{ color: "var(--app-ink-2)" }}>
          {rest || d.offer}
        </span>
        {meta && (
          <span
            className="shrink-0 font-mono text-[10px] uppercase tracking-[0.06em]"
            style={{ color: "var(--app-ink-3)" }}
          >
            {meta}
          </span>
        )}
      </div>
    </Link>
  );
}

export default function TodaysDealsStack({ deals, weekday }: { deals: TodaysDeal[]; weekday: string }) {
  const shown = deals.slice(0, MAX_ROWS);

  return (
    <section aria-label={`Verified intel for ${weekday}`} className="space-y-1.5">
      <div className="flex items-center gap-2 px-0.5">
        <span className="font-mono text-[10px] font-bold uppercase tracking-[0.14em]" style={{ color: "var(--app-brand)" }}>
          Today&rsquo;s intel
        </span>
        <span className="font-mono text-[11px] uppercase tracking-[0.08em]" style={{ color: "var(--app-ink-3)" }}>{weekday}</span>
        <span aria-hidden className="h-px flex-1" style={{ background: "var(--app-border)" }} />
        <span className="font-mono text-[10px] tabular-nums" style={{ color: "var(--app-ink-3)" }}>{deals.length}</span>
      </div>

      {/* A leader-dotted index — hairline dividers, no boxes (the /happy-hour
          IndexSection grammar). */}
      <ul className="divide-y px-0.5" style={{ borderColor: "color-mix(in srgb, var(--app-border) 70%, transparent)" }}>
        {shown.map((d) => (
          <li key={d.slug}>
            <IntelRow deal={d} />
          </li>
        ))}
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
