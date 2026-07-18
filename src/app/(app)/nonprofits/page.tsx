import type { Metadata } from "next";
import Link from "next/link";
import { HeartHandshake } from "lucide-react";
import {
  allNonprofits,
  nonprofitsByCategory,
  nonprofitCategoryCounts,
  subsectionLabel,
} from "@/lib/loaders/nonprofits";
import {
  NONPROFIT_CATEGORY_BY_SLUG,
  type NonprofitCategory,
} from "@/data/ntee-categories";
import PageBloom from "@/components/ui/PageBloom";
import FieldStamp from "@/components/ui/FieldStamp";
import NonprofitList from "@/components/nonprofits/NonprofitList";

export const metadata: Metadata = {
  alternates: { canonical: "/nonprofits" },
  title: "Nonprofits in Frederick County",
  description:
    "Every registered nonprofit in Frederick County, Maryland, by cause: human services, faith, youth, arts, environment, and more. Built from the public IRS exempt-organizations record.",
};

export const revalidate = 86400;

const fmtMoney = (n: number): string => {
  if (n <= 0) return "";
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(n >= 10_000_000 ? 0 : 1)}M`;
  if (n >= 1_000) return `$${Math.round(n / 1_000)}K`;
  return `$${n}`;
};

function isCategory(v: string | undefined): v is NonprofitCategory {
  return !!v && v in NONPROFIT_CATEGORY_BY_SLUG;
}

export default async function NonprofitsPage({
  searchParams,
}: {
  searchParams: Promise<{ cause?: string }>;
}) {
  const { cause } = await searchParams;
  const active = isCategory(cause) ? cause : null;
  const counts = nonprofitCategoryCounts();
  const total = allNonprofits().length;

  // Selected cause → that bucket (already revenue-sorted by the builder).
  // No cause → the notable set: the county's largest orgs across all causes,
  // which doubles as an honest "what's here" preview.
  const list = active ? nonprofitsByCategory(active) : allNonprofits().slice(0, 40);
  const activeMeta = active ? NONPROFIT_CATEGORY_BY_SLUG[active] : null;

  return (
    <div className="relative space-y-5">
      <PageBloom variant="warm-cool" />

      <header className="pt-0.5">
        <div
          aria-hidden
          className="h-px"
          style={{ background: "linear-gradient(90deg, transparent, var(--app-border) 14%, var(--app-border) 86%, transparent)" }}
        />
        <div className="flex items-center justify-between py-2.5">
          <span className="font-mono text-[10px] uppercase tracking-[0.2em]" style={{ color: "var(--app-ink-2)" }}>
            Frederick County
          </span>
          <span className="font-mono text-[10.5px] tabular-nums tracking-[0.06em]" style={{ color: "var(--app-ink-2)" }}>
            {total.toLocaleString()} orgs
          </span>
        </div>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h1
              className="flex items-center gap-2.5 font-serif text-[30px] font-semibold leading-[0.98] tracking-[-0.02em]"
              style={{ color: "var(--app-ink)" }}
            >
              <HeartHandshake className="h-7 w-7 shrink-0" strokeWidth={1.75} style={{ color: "var(--app-brand-2)" }} aria-hidden />
              Nonprofits
            </h1>
            <p className="mt-2 max-w-prose text-[13px] leading-snug" style={{ color: "var(--app-ink-3)" }}>
              Every registered nonprofit in the county, by cause. Built from the public IRS
              exempt-organizations record, so it is the whole roll, not a curated few.
            </p>
            <div aria-hidden className="mt-2.5 h-[3px] w-[42px] rounded-full" style={{ background: "var(--app-brand-2)" }} />
          </div>
          <FieldStamp id="nonprofits" top="PUBLIC RECORD" bottom="IRS EO BMF" size={80} className="mt-0.5" />
        </div>
      </header>

      {/* Cause filter */}
      <nav aria-label="Filter by cause" className="flex flex-wrap gap-1.5">
        <Link
          href="/nonprofits"
          className="tap-44 rounded-full border px-3 py-1.5 text-[12.5px] font-medium transition-colors"
          style={
            active
              ? { borderColor: "var(--app-border)", color: "var(--app-ink-2)" }
              : { borderColor: "var(--app-brand-2)", background: "var(--app-brand-2)", color: "var(--app-on-brand, #fff)" }
          }
        >
          All
        </Link>
        {counts.map(({ category, count }) => {
          const meta = NONPROFIT_CATEGORY_BY_SLUG[category];
          const on = active === category;
          return (
            <Link
              key={category}
              href={`/nonprofits?cause=${category}`}
              className="tap-44 rounded-full border px-3 py-1.5 text-[12.5px] font-medium transition-colors"
              style={
                on
                  ? { borderColor: "var(--app-brand-2)", background: "var(--app-brand-2)", color: "var(--app-on-brand, #fff)" }
                  : { borderColor: "var(--app-border)", color: "var(--app-ink-2)" }
              }
            >
              {meta.label}{" "}
              <span className="font-mono text-[10.5px] tabular-nums opacity-70">{count}</span>
            </Link>
          );
        })}
      </nav>

      {/* List */}
      <section>
        <div className="mb-1.5 flex items-baseline justify-between">
          <h2 className="font-serif text-[19px] font-semibold" style={{ color: "var(--app-ink)" }}>
            {activeMeta ? activeMeta.label : "Largest by budget"}
          </h2>
          <span className="font-mono text-[11px] tabular-nums" style={{ color: "var(--app-ink-3)" }}>
            {list.length.toLocaleString()}
          </span>
        </div>
        {activeMeta ? (
          <p className="mb-2 text-[12px]" style={{ color: "var(--app-ink-3)" }}>
            {activeMeta.blurb} The list is sorted by reported budget, and many small groups file no financials.
          </p>
        ) : (
          <p className="mb-2 text-[12px]" style={{ color: "var(--app-ink-3)" }}>
            A glance at the county&rsquo;s biggest nonprofits. Pick a cause above to see the rest.
          </p>
        )}
        <NonprofitList
          orgs={list.map((n) => ({
            ein: n.ein,
            name: n.name,
            sub: subsectionLabel(n.subsection),
            city: n.city,
            ruling: n.ruling ?? null,
            rev: fmtMoney(n.revenue),
          }))}
        />
      </section>

      <p className="pt-1 text-[11px] leading-snug" style={{ color: "var(--app-ink-3)" }}>
        Source: IRS Exempt Organizations Business Master File (Maryland extract), filtered to
        Frederick County. Financials come from each org&rsquo;s most recent IRS filing. A registered
        nonprofit is not an endorsement.
      </p>
    </div>
  );
}
