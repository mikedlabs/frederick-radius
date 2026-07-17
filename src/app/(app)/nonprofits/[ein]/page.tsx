import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ExternalLink, MapPin, Navigation } from "lucide-react";
import { nonprofitByEin, subsectionLabel } from "@/lib/loaders/nonprofits";
import { NONPROFIT_CATEGORY_BY_SLUG } from "@/data/ntee-categories";

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
  const directionsUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
    [org.street, `${org.city}, MD ${org.zip}`].filter(Boolean).join(", "),
  )}`;

  const stats: { label: string; value: string; hint?: string }[] = [
    { label: "Annual revenue", value: fmtMoney(org.revenue), hint: "Most recent IRS filing" },
    { label: "Total assets", value: fmtMoney(org.assets) },
    { label: "Exempt since", value: org.ruling || "–", hint: "IRS ruling year" },
  ];

  return (
    <div className="relative space-y-5 sm:space-y-6">
      <Link
        href={`/nonprofits?cause=${org.category}`}
        className="tap-44 inline-flex items-center gap-1.5 text-[12.5px] font-medium"
        style={{ color: "var(--app-ink-2)" }}
      >
        <ArrowLeft className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
        {cat.label}
      </Link>

      <header className="border-b pb-5" style={{ borderColor: "var(--app-border)" }}>
        <span className="eyebrow" style={{ color: "var(--app-brand-press)" }}>
          Nonprofit · {cat.label}
        </span>
        <h1
          className="mt-1.5 font-serif text-[30px] font-semibold leading-[1.05] tracking-[-0.02em] sm:text-[36px]"
          style={{ color: "var(--app-ink)" }}
        >
          {org.name}
        </h1>
        <p className="mt-2 text-[12.5px]" style={{ color: "var(--app-ink-3)" }}>
          {subsectionLabel(org.subsection)}
          {org.border ? " · county-line town" : ""}
        </p>
      </header>

      {/* The address is useful only when it can take the visitor somewhere. */}
      <a
        href={directionsUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="tap-44 flex items-center gap-3 border-b py-3"
        style={{ borderColor: "var(--app-border)" }}
      >
        <MapPin className="h-4 w-4 shrink-0" strokeWidth={2} style={{ color: "var(--app-brand-2)" }} aria-hidden />
        <span className="min-w-0 flex-1 text-[13px] leading-snug" style={{ color: "var(--app-ink)" }}>
          {org.street ? <span className="block">{org.street}</span> : null}
          <span className="block" style={{ color: "var(--app-ink-2)" }}>
            {org.city}, MD {org.zip}
          </span>
        </span>
        <Navigation className="h-4 w-4 shrink-0" strokeWidth={2} style={{ color: "var(--app-ink-3)" }} aria-hidden />
      </a>

      {/* Financials from the IRS record */}
      <section>
        <h2 className="mb-2 font-serif text-[19px] font-semibold tracking-tight" style={{ color: "var(--app-ink)" }}>
          IRS filing snapshot
        </h2>
        <dl className="divide-y border-y sm:grid sm:grid-cols-3 sm:divide-x sm:divide-y-0" style={{ borderColor: "var(--app-border)" }}>
          {stats.map((s) => (
            <div
              key={s.label}
              className="flex items-baseline justify-between gap-4 py-3 sm:block sm:px-3 sm:first:pl-0 sm:last:pr-0"
              style={{ borderColor: "var(--app-border)" }}
            >
              <dt className="text-[11.5px] leading-tight" style={{ color: "var(--app-ink-3)" }}>
                {s.label}
              </dt>
              <dd className="font-mono text-[16px] font-medium tabular-nums sm:mt-1" style={{ color: "var(--app-ink)" }}>
                {s.value}
              </dd>
              {s.hint ? (
                <dd className="hidden text-[9.5px] leading-tight sm:mt-0.5 sm:block" style={{ color: "var(--app-ink-3)" }}>
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
        <span>View filings and full financials</span>
        <ExternalLink className="h-4 w-4 shrink-0" strokeWidth={2} aria-hidden />
      </a>

      <p className="border-t pt-3 text-[10.5px] leading-relaxed" style={{ borderColor: "var(--app-border)", color: "var(--app-ink-3)" }}>
        EIN {fmtEin(org.ein)} · IRS Exempt Organizations Business Master File · Public record, not an endorsement.
      </p>
    </div>
  );
}
