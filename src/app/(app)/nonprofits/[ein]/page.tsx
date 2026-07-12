import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ExternalLink, MapPin } from "lucide-react";
import { nonprofitByEin, subsectionLabel } from "@/lib/loaders/nonprofits";
import { NONPROFIT_CATEGORY_BY_SLUG } from "@/data/ntee-categories";
import PageBloom from "@/components/ui/PageBloom";

export const revalidate = 86400;

// Compact money for the stat cells — a full $455,241,558 overflows a
// three-up cell on a phone; the exact figure is one tap away on ProPublica.
const fmtMoney = (n: number): string => {
  if (n <= 0) return "–";
  if (n >= 1_000_000_000) return `$${(n / 1_000_000_000).toFixed(1)}B`;
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(n >= 10_000_000 ? 0 : 1)}M`;
  if (n >= 1_000) return `$${Math.round(n / 1_000)}K`;
  return `$${n.toLocaleString()}`;
};
const fmtEin = (ein: string): string =>
  ein.length === 9 ? `${ein.slice(0, 2)}-${ein.slice(2)}` : ein;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ ein: string }>;
}): Promise<Metadata> {
  const { ein } = await params;
  const org = nonprofitByEin(ein);
  if (!org) return { title: "Nonprofit not found" };
  const cat = NONPROFIT_CATEGORY_BY_SLUG[org.category];
  return {
    alternates: { canonical: `/nonprofits/${org.ein}` },
    title: `${org.name}: Frederick County nonprofit`,
    description: `${org.name} is a ${cat.label.toLowerCase()} nonprofit in ${org.city}, Frederick County, MD (${subsectionLabel(org.subsection)}).`,
  };
}

export default async function NonprofitDetailPage({
  params,
}: {
  params: Promise<{ ein: string }>;
}) {
  const { ein } = await params;
  const org = nonprofitByEin(ein);
  if (!org) notFound();

  const cat = NONPROFIT_CATEGORY_BY_SLUG[org.category];
  const proPublicaUrl = `https://projects.propublica.org/nonprofits/organizations/${org.ein}`;

  const stats: { label: string; value: string; hint?: string }[] = [
    { label: "Annual revenue", value: fmtMoney(org.revenue), hint: "Most recent IRS filing" },
    { label: "Total assets", value: fmtMoney(org.assets) },
    { label: "Exempt since", value: org.ruling || "–", hint: "IRS ruling year" },
  ];

  return (
    <div className="relative space-y-5">
      <PageBloom variant="warm-cool" />

      <Link
        href={`/nonprofits?cause=${org.category}`}
        className="tap-44 inline-flex items-center gap-1.5 text-[12.5px] font-medium"
        style={{ color: "var(--app-ink-2)" }}
      >
        <ArrowLeft className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
        {cat.label}
      </Link>

      <header>
        <span className="font-mono text-[10px] uppercase tracking-[0.2em]" style={{ color: "var(--app-ink-3)" }}>
          {cat.label}
        </span>
        <h1
          className="mt-1 font-serif text-[26px] font-semibold leading-[1.02] tracking-[-0.02em]"
          style={{ color: "var(--app-ink)" }}
        >
          {org.name}
        </h1>
        <p className="mt-1.5 text-[12.5px]" style={{ color: "var(--app-ink-3)" }}>
          {subsectionLabel(org.subsection)}
          {org.border ? " · county-line town" : ""}
        </p>
      </header>

      {/* Address */}
      <div
        className="flex items-start gap-2 rounded-[var(--app-radius-md)] border px-3.5 py-3"
        style={{ borderColor: "var(--app-border)" }}
      >
        <MapPin className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={2} style={{ color: "var(--app-brand-2)" }} aria-hidden />
        <div className="text-[13px] leading-snug" style={{ color: "var(--app-ink)" }}>
          {org.street ? <span className="block">{org.street}</span> : null}
          <span className="block" style={{ color: "var(--app-ink-2)" }}>
            {org.city}, MD {org.zip}
          </span>
        </div>
      </div>

      {/* Financials from the IRS record */}
      <section>
        <h2 className="mb-2 font-mono text-[10px] uppercase tracking-[0.18em]" style={{ color: "var(--app-ink-2)" }}>
          The IRS record
        </h2>
        <dl className="grid grid-cols-3 gap-2">
          {stats.map((s) => (
            <div
              key={s.label}
              className="rounded-[var(--app-radius-md)] border px-3 py-2.5"
              style={{ borderColor: "var(--app-border)" }}
            >
              <dt className="text-[10.5px] leading-tight" style={{ color: "var(--app-ink-3)" }}>
                {s.label}
              </dt>
              <dd className="mt-1 font-mono text-[15px] font-medium tabular-nums" style={{ color: "var(--app-ink)" }}>
                {s.value}
              </dd>
              {s.hint ? (
                <dd className="mt-0.5 text-[9.5px] leading-tight" style={{ color: "var(--app-ink-3)" }}>
                  {s.hint}
                </dd>
              ) : null}
            </div>
          ))}
        </dl>
        {org.revenue <= 0 ? (
          <p className="mt-2 text-[11.5px]" style={{ color: "var(--app-ink-3)" }}>
            This org files a 990-N e-postcard, so the IRS publishes no dollar figures. Smaller
            groups run on volunteer time, not budgets.
          </p>
        ) : null}
      </section>

      {/* Enrichment / link-out */}
      <a
        href={proPublicaUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="tap-44 flex items-center justify-between gap-2 rounded-[var(--app-radius-md)] border px-3.5 py-3 text-[13px] font-medium"
        style={{ borderColor: "var(--app-brand-2)", color: "var(--app-brand-2)" }}
      >
        <span>Full financials &amp; 990 filings on ProPublica</span>
        <ExternalLink className="h-4 w-4 shrink-0" strokeWidth={2} aria-hidden />
      </a>

      <p className="text-[10.5px] leading-snug" style={{ color: "var(--app-ink-3)" }}>
        EIN {fmtEin(org.ein)} · Source: IRS Exempt Organizations Business Master File. Listing a
        registered nonprofit is a public-record fact, not an endorsement.
      </p>
    </div>
  );
}
