import Link from "next/link";
import { ArrowRight, ShoppingBasket } from "lucide-react";
import { marketsOpenToday } from "@/lib/markets-today";

/**
 * "Farmers markets today" — a slim, self-hiding almanac line. Frederick is farm
 * country and a market day is a real reason to head out; this names the markets
 * open today (official MD schedule) with their hours. Renders nothing on a day
 * with no market, so it costs the ordinary day nothing. Honest: only markets
 * Maryland publishes with a real day + hours appear.
 */
export default async function MarketsTodayBeat({ now }: { now: Date }) {
  const markets = await marketsOpenToday(now);
  if (markets.length === 0) return null;

  const shown = markets.slice(0, 3);
  const extra = markets.length - shown.length;

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
          {markets.length === 1 ? "Farmers market today:" : "Farmers markets today:"}
        </span>
        {shown.map((m, i) => (
          <span key={m.norm}>
            {m.name}
            <span style={{ color: "var(--app-ink-3)" }}> {m.hours}</span>
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
