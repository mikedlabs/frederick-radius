import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, BadgeCheck, Tag } from "lucide-react";
import { allDeals } from "@/lib/loaders/todaysDeals";
import PageBloom from "@/components/ui/PageBloom";
import DealsBrowser from "@/components/deals/DealsBrowser";
import { PageWide } from "@/components/layout/Page";

export const metadata: Metadata = {
  alternates: { canonical: "/deals" },
  title: "Deals: source-checked daily specials in Frederick County",
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

  const venueCount = new Set(rows.map((row) => row.slug)).size;

  return (
    <PageWide className="relative">
      <PageBloom variant="warm-cool" />

      <nav aria-label="Breadcrumb" className="text-xs">
        <Link
          href="/today"
          className="-ml-2 inline-flex min-h-11 items-center gap-1 rounded-full px-2 hover:underline"
          style={{ color: "var(--app-ink-3)" }}
        >
          <ArrowLeft className="h-3 w-3" strokeWidth={2.25} aria-hidden />
          Back to Today
        </Link>
      </nav>

      <header
        className="relative overflow-hidden rounded-[var(--app-radius-xl)] border px-4 py-5 sm:px-6 sm:py-7"
        style={{
          borderColor: "var(--app-border)",
          background:
            "linear-gradient(135deg, color-mix(in srgb, var(--app-brand) 9%, var(--app-bg-elevated-solid)) 0%, var(--app-bg-elevated-solid) 48%, color-mix(in srgb, var(--app-cool) 7%, var(--app-bg-elevated-solid)) 100%)",
          boxShadow: "var(--app-elev-1), var(--app-edge), var(--app-hi)",
        }}
      >
        <Tag
          aria-hidden
          className="pointer-events-none absolute -right-5 -top-5 h-36 w-36 rotate-12 opacity-[0.055] sm:h-44 sm:w-44"
          strokeWidth={1}
          style={{ color: "var(--app-brand-press)" }}
        />
        <div className="relative max-w-[44rem]">
          <p
            className="font-mono text-[10px] font-semibold uppercase tracking-[0.18em]"
            style={{ color: "var(--app-brand-press)" }}
          >
            Frederick County
          </p>
          <h1
            className="mt-2 font-editorial text-[38px] font-semibold leading-[0.96] tracking-[-0.035em] sm:text-[48px]"
            style={{ color: "var(--app-ink)" }}
          >
            Daily deals
          </h1>
          <p
            className="mt-3 max-w-[58ch] text-[14px] leading-relaxed sm:text-[15px]"
            style={{ color: "var(--app-ink-2)" }}
          >
            Choose a day, then narrow by town. We keep the source and
            last-checked date with every listing.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <span
              className="inline-flex min-h-8 items-center rounded-full border px-3 text-[12px] font-semibold tabular-nums"
              style={{
                borderColor: "color-mix(in srgb, var(--app-brand) 22%, var(--app-border))",
                background: "color-mix(in srgb, var(--app-brand) 7%, var(--app-bg-elevated))",
                color: "var(--app-brand-press)",
              }}
            >
              {rows.length} {rows.length === 1 ? "special" : "specials"} tracked
            </span>
            <span
              className="inline-flex min-h-8 items-center rounded-full border px-3 text-[12px] font-medium"
              style={{
                borderColor: "var(--app-border)",
                background: "color-mix(in srgb, var(--app-bg-elevated) 88%, transparent)",
                color: "var(--app-ink-2)",
              }}
            >
              {venueCount} {venueCount === 1 ? "place" : "places"}
            </span>
            <span
              className="inline-flex min-h-8 items-center gap-1.5 rounded-full border px-3 text-[12px] font-medium"
              style={{
                borderColor: "color-mix(in srgb, var(--app-positive) 22%, var(--app-border))",
                background: "color-mix(in srgb, var(--app-positive) 7%, var(--app-bg-elevated))",
                color: "var(--app-positive)",
              }}
            >
              <BadgeCheck className="h-4 w-4" strokeWidth={2.2} aria-hidden />
              Source checked
            </span>
          </div>
        </div>
      </header>

      {rows.length === 0 ? (
        <p className="rounded-[var(--app-radius-md)] border border-dashed px-4 py-10 text-center text-[13px]" style={{ borderColor: "var(--app-border)", color: "var(--app-ink-3)" }}>
          No current specials are on file. Do you know one? <Link href="/submit/place" className="font-semibold underline">Tell us.</Link>
        </p>
      ) : (
        <DealsBrowser rows={rows} today={today} nowIso={now.toISOString()} />
      )}

      <aside
        className="flex flex-col gap-2 rounded-[var(--app-radius-lg)] border px-4 py-3 text-[12px] leading-relaxed sm:flex-row sm:items-center sm:justify-between"
        style={{
          borderColor: "var(--app-border)",
          background: "color-mix(in srgb, var(--app-bg-sunken) 55%, transparent)",
          color: "var(--app-ink-3)",
        }}
      >
        <p>Deal details can change. Check the source before making a special trip.</p>
        <Link
          href="/happy-hour"
          className="tap-44 shrink-0 font-semibold underline decoration-1 underline-offset-4"
          style={{ color: "var(--app-cool)" }}
        >
          Browse happy hours
        </Link>
      </aside>
    </PageWide>
  );
}
