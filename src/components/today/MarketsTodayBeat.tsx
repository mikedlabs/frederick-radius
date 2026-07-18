import Link from "next/link";
import { ArrowRight, ShoppingBasket } from "lucide-react";
import { marketsOpenToday } from "@/lib/markets-today";
import { marketTimingAt } from "@/lib/today/on-now";

/**
 * "Farmers markets today" — a slim, self-hiding almanac line. Frederick is farm
 * country and a market day is a real reason to head out; this names the markets
 * open today (official MD schedule) with their hours. Renders nothing on a day
 * with no market, so it costs the ordinary day nothing. Honest: only markets
 * Maryland publishes with a real day + hours appear.
 */
export default async function MarketsTodayBeat({ now }: { now: Date }) {
  const markets = await marketsOpenToday(now);
  const relevant = markets
    .map((market) => ({ market, timing: marketTimingAt(market.hours, now) }))
    .filter(({ timing }) => timing !== "earlier");
  if (relevant.length === 0) return null;

  const shown = relevant.slice(0, 3);
  const extra = relevant.length - shown.length;

  return (
    <div className="mt-3">
      <p
        className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[13px] leading-snug"
        style={{ color: "var(--app-ink-2)" }}
      >
        <ShoppingBasket
          className="h-4 w-4 shrink-0"
          strokeWidth={2}
          aria-hidden
          style={{ color: "var(--app-brand)" }}
        />
        <span className="font-semibold" style={{ color: "var(--app-ink)" }}>
          {relevant.length === 1 ? "Farmers market today:" : "Farmers markets today:"}
        </span>
        {shown.map(({ market, timing }, i) => (
          <span key={market.norm}>
            {market.name}
            <span className="ml-1 font-semibold" style={{ color: timing === "now" ? "var(--app-positive)" : "var(--app-ink-3)" }}>
              {timing === "now" ? "Open now" : timing === "later" ? "Later today" : "Today"}
            </span>
            <span style={{ color: "var(--app-ink-3)" }}> {market.hours}</span>
            {/* Maryland's own market registry says which markets take SNAP —
                a fact worth a quiet tag (7 of the county's 9 markets do, and
                nothing else surfaces it). FMNP-only markets stay untagged:
                "SNAP" must mean SNAP. */}
            {/\bsnap\b/i.test(market.benefits ?? "") && (
              <span
                className="ml-1 align-[1px] font-mono text-[9.5px] font-bold uppercase tracking-[0.08em]"
                style={{ color: "var(--app-brand-2)" }}
              >
                SNAP
              </span>
            )}
            {i < shown.length - 1 ? <span aria-hidden style={{ color: "var(--app-ink-3)" }}> ·</span> : null}
          </span>
        ))}
        {extra > 0 && <span style={{ color: "var(--app-ink-3)" }}>+{extra} more</span>}
        <Link
          href="/category/market"
          className="tap-44-y font-semibold whitespace-nowrap"
          style={{ color: "var(--app-brand-press)" }}
        >
          All markets <ArrowRight aria-hidden className="ml-1 inline h-3.5 w-3.5 -translate-y-px" strokeWidth={2.25} />
        </Link>
      </p>
    </div>
  );
}
