import type { Metadata } from "next";
import Link from "next/link";
import { Tag } from "lucide-react";
import { allDeals } from "@/lib/loaders/todaysDeals";
import PageBloom from "@/components/ui/PageBloom";
import FieldStamp from "@/components/ui/FieldStamp";
import DealsBrowser from "@/components/deals/DealsBrowser";

export const metadata: Metadata = {
  alternates: { canonical: "/deals" },
  title: "Daily specials in Frederick County",
  description:
    "Source-checked daily specials around Frederick County: taco Tuesdays, wing nights, crab feasts, and the deals locals plan their week around.",
};

export const revalidate = 600;

/** Eastern weekday (0=Sun) for the "today" highlight in the almanac strip. */
function easternDow(now: Date): number {
  const wd = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", weekday: "short" }).format(now);
  return { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 }[wd] ?? 0;
}

/**
 * /deals — the Field Notes deals flagship (sibling of /happy-hour). Every
 * special is agent-VERIFIED at the source (the moat). The page hands the
 * verified set to a day-aware browser (DealsBrowser): a 7-day almanac strip
 * shows how many deals run each day, and tapping a day reveals that day's
 * specials by town, with the full offer and where it's from. The deals corpus
 * finally has a home; the /today deck see-more points here.
 */
export default function DealsPage() {
  const now = new Date();
  const today = easternDow(now);
  const rows = allDeals();

  // Count of deals running TODAY (named-day deals only) for the intro lead.
  const todayCount = rows.filter((r) => r.days.includes(today)).length;

  return (
    <div className="relative space-y-5">
      <PageBloom variant="warm-cool" />

      <header className="pt-0.5">
        <div aria-hidden className="h-px" style={{ background: "linear-gradient(90deg, transparent, var(--app-border) 14%, var(--app-border) 86%, transparent)" }} />
        <div className="flex items-center justify-between py-2.5">
          <span className="font-mono text-[10px] uppercase tracking-[0.2em]" style={{ color: "var(--app-ink-2)" }}>Frederick County</span>
          <span className="font-mono text-[10.5px] tabular-nums tracking-[0.06em]" style={{ color: "var(--app-ink-2)" }}>{rows.length} special{rows.length === 1 ? "" : "s"}</span>
        </div>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="flex items-center gap-2.5 font-serif text-[30px] font-semibold leading-[0.98] tracking-[-0.02em]" style={{ color: "var(--app-ink)" }}>
              <Tag className="h-7 w-7 shrink-0" strokeWidth={1.75} style={{ color: "var(--app-brand)" }} aria-hidden />
              Daily specials
            </h1>
            <p className="mt-2 max-w-prose text-[13px] leading-snug" style={{ color: "var(--app-ink-3)" }}>
              {todayCount > 0 ? (
                <><span className="font-semibold" style={{ color: "var(--app-brand-press)" }}>{todayCount} running today.</span>{" "}Pick a day to see the specials by town. Each one was checked at its source.</>
              ) : (
                <>Pick a day to see the specials by town. Each one was checked at its source.</>
              )}
            </p>
            <div aria-hidden className="mt-2.5 h-[3px] w-[42px] rounded-full" style={{ background: "var(--app-brand)" }} />
          </div>
          <FieldStamp id="deals" top="CHECKED AT SOURCE" bottom="FIELD NOTES" size={80} className="mt-0.5" />
        </div>
      </header>

      {rows.length === 0 ? (
        <p className="rounded-[var(--app-radius-md)] border border-dashed px-4 py-10 text-center text-[13px]" style={{ borderColor: "var(--app-border)", color: "var(--app-ink-3)" }}>
          No current specials are on file. Know one? <Link href="/submit/place" className="font-semibold underline">Tell us.</Link>
        </p>
      ) : (
        <DealsBrowser rows={rows} today={today} />
      )}

      <p className="px-1 text-[11px] leading-relaxed" style={{ color: "var(--app-ink-3)" }}>
        Times change. Each spot links to its place page so you can double-check before you go. Looking for happy hour instead?{" "}
        <Link href="/happy-hour" className="underline" style={{ color: "var(--app-cool)" }}>See happy hours</Link>.
      </p>
    </div>
  );
}
