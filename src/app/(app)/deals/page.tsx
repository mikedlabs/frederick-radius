import type { Metadata } from "next";
import GuideHeader from "@/components/layout/GuideHeader";
import Link from "next/link";
import { allDeals } from "@/lib/loaders/todaysDeals";
import DealsBrowser from "@/components/deals/DealsBrowser";
import { PageWide } from "@/components/layout/Page";

export const metadata: Metadata = {
  alternates: { canonical: "/deals" },
  title: "Deals: daily specials in Frederick County",
  description:
    "Daily specials around Frederick County, listed by day of the week. Each one links to its source and shows when it was last checked.",
};

export const revalidate = 600;

/** Eastern weekday (0=Sun) for the "today" highlight in the almanac strip. */
function easternDow(now: Date): number {
  const wd = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", weekday: "short" }).format(now);
  return { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 }[wd] ?? 0;
}

/**
 * /deals — the Field Notes deals flagship (sibling of /happy-hour). Every
 * special was read at its source, and each row states when: "verified" only
 * inside the check window, a dated "last checked" past it, so the metadata
 * above promises a source link and a date, not a current check. The page hands
 * the set to a day-aware browser (DealsBrowser): a 7-day almanac strip
 * shows how many deals run each day, and tapping a day reveals that day's
 * specials by town, with the full offer and where it's from. The deals corpus
 * finally has a home; the /today deck see-more points here.
 */
export default function DealsPage() {
  const now = new Date();
  const today = easternDow(now);
  const rows = allDeals(now);

  const venueCount = new Set(rows.map((row) => row.slug)).size;

  return (
    <PageWide className="relative">

      <GuideHeader title="Daily deals" href="/today" parent="Today"
        detail={`${rows.length} ${rows.length === 1 ? "special" : "specials"} at ${venueCount} ${venueCount === 1 ? "venue" : "venues"}`}>
        Choose a day to see the offer and the venue’s terms.
      </GuideHeader>

      {rows.length === 0 ? (
        <p className="rounded-[var(--app-radius-md)] border border-dashed px-4 py-10 text-center text-[13px]" style={{ borderColor: "var(--app-border)", color: "var(--app-ink-3)" }}>
          No current specials are on file. Do you know one? <Link href="/submit/place" className="font-semibold underline">Tell us.</Link>
        </p>
      ) : (
        <DealsBrowser rows={rows} today={today} nowIso={now.toISOString()} />
      )}

      <aside
        className="flex flex-col gap-2 border-t py-3 text-[13px] leading-relaxed sm:flex-row sm:items-center sm:justify-between"
        style={{
          borderColor: "var(--app-border)",
          color: "var(--app-ink-3)",
        }}
      >
        <p>Deal details can change. Check the source before making a special trip.</p>
        <Link
          href="/happy-hour"
          className="tap-44 shrink-0 font-semibold underline decoration-1 underline-offset-4"
          style={{ color: "var(--app-cool-text)" }}
        >
          Browse happy hours
        </Link>
      </aside>
    </PageWide>
  );
}
