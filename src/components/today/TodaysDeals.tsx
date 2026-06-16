import Link from "next/link";
import { todaysDeals, EASTERN_WEEKDAY } from "@/lib/loaders/todaysDeals";

/**
 * Today's Deals — a compact strip of the VERIFIED day-of-week specials
 * running today (the Field Notes moat made visible on the front door, the
 * 4pm "what's worth going out for" answer). Server component; self-hides
 * when nothing runs today (honest empty). Each row taps through to the place;
 * each carries a "verified" chip so the trust is legible at the point of
 * decision.
 */
export default function TodaysDeals({ now, limit = 4 }: { now: Date; limit?: number }) {
  const deals = todaysDeals(now, limit);
  if (deals.length === 0) return null;
  const weekday = EASTERN_WEEKDAY(now);

  return (
    <section
      aria-label={`Verified deals for ${weekday}`}
      className="overflow-hidden rounded-[var(--app-radius-lg)] border bg-[var(--app-bg-elevated)]"
      style={{ borderColor: "var(--app-border)", boxShadow: "var(--app-elev-1), var(--app-edge), var(--app-hi)" }}
    >
      <div className="flex items-center gap-2 px-3.5 pt-3">
        <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.14em]" style={{ color: "var(--app-brand)" }}>
          Today&rsquo;s deals
        </span>
        <span className="font-mono text-[10px] uppercase tracking-[0.1em]" style={{ color: "var(--app-ink-3)" }}>
          {weekday}
        </span>
        <span aria-hidden className="h-px flex-1" style={{ background: "var(--app-border)" }} />
        <span className="font-mono text-[9.5px] uppercase tracking-[0.08em]" style={{ color: "var(--app-positive)" }}>
          verified
        </span>
      </div>

      <ul className="mt-1.5 px-1.5 pb-1.5">
        {deals.map((d) => (
          <li key={d.slug}>
            <Link
              href={`/places/${d.slug}`}
              className="tactile-interactive flex items-start gap-3 rounded-[var(--app-radius-md)] px-2 py-2 transition"
            >
              <span aria-hidden className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: "var(--app-brand)" }} />
              <span className="min-w-0 flex-1">
                <span className="flex items-baseline justify-between gap-2">
                  <span className="truncate text-[14px] font-semibold tracking-tight" style={{ color: "var(--app-ink)" }}>
                    {d.name}
                  </span>
                  {d.town && (
                    <span className="shrink-0 font-mono text-[10px] uppercase tracking-[0.06em]" style={{ color: "var(--app-ink-3)" }}>
                      {d.town}
                    </span>
                  )}
                </span>
                <span className="mt-0.5 line-clamp-2 text-[12.5px] leading-snug" style={{ color: "var(--app-ink-2)" }}>
                  {d.offer}
                </span>
              </span>
            </Link>
          </li>
        ))}
      </ul>

      <Link
        href="/happy-hour"
        className="tap-44 flex items-center justify-between border-t px-3.5 py-2 text-[12px] font-semibold"
        style={{ borderColor: "var(--app-border)", color: "var(--app-brand)" }}
      >
        Happy hours &amp; more
        <span aria-hidden>→</span>
      </Link>
    </section>
  );
}
