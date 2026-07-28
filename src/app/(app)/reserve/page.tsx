import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, ArrowRight, CalendarCheck } from "lucide-react";
import { rankPlaces } from "@/lib/loaders/places";
import {
  isBrandedProvider,
  isCommerceSearchLink,
  providerLabel,
  resolveCommerceLinks,
} from "@/lib/commerce/links";
import { openTableSearchUrl } from "@/lib/ask/reservations";
import { businessInfoCommerceLinks } from "@/lib/loaders/businessInfo";
import { MUNICIPALITY_BY_SLUG } from "@/data/municipalities";
import PageBloom from "@/components/ui/PageBloom";
import { PlaceMedallion } from "@/components/place/PlaceMedallion";
import PlaceStatus from "@/components/place/PlaceStatus";

/**
 * /reserve — book a table, one tap from the Eat pane.
 *
 * The click-depth audit's worst path: reserving required already knowing
 * the restaurant, searching it, opening its page, and hoping it carried a
 * reservation link (3+ taps, data-gated). This page is the front door:
 * every place with a direct reservation link, as a ledger with one
 * Reserve action each, then the honest handoff for everywhere else
 * (OpenTable's own Frederick search). Nothing here is fabricated — a
 * place appears only when Radius holds a direct, source-backed link.
 */
export const metadata: Metadata = {
  alternates: { canonical: "/reserve" },
  title: "Book a table",
  description:
    "Direct reservation links published by Frederick County restaurants or checked by Radius. OpenTable search covers the rest.",
};

export const revalidate = 3600;

export default async function ReservePage() {
  const ranked = rankPlaces({ limit: 2500 });
  const rows = ranked
    .map((p) => {
      const reserve = resolveCommerceLinks(
        p,
        businessInfoCommerceLinks(p.slug),
      ).find(
        (link) =>
          link.type === "reservation" && !isCommerceSearchLink(link),
      );
      return reserve ? { p, reserve } : null;
    })
    .filter((x): x is NonNullable<typeof x> => x !== null);

  return (
    <div className="relative mx-auto max-w-md space-y-6 py-6">
      <PageBloom variant="warm-cool" />

      <nav aria-label="Breadcrumb" className="text-xs">
        <Link
          href="/today"
          className="tap-44-y inline-flex items-center gap-1 hover:underline"
          style={{ color: "var(--app-ink-3)" }}
        >
          <ArrowLeft className="h-3 w-3" strokeWidth={2.25} aria-hidden />
          Back to Today
        </Link>
      </nav>

      <header>
        <div
          aria-hidden
          className="h-px"
          style={{ background: "linear-gradient(90deg, transparent, var(--app-border) 14%, var(--app-border) 86%, transparent)" }}
        />
        <div className="flex items-center justify-between py-2.5">
          <span className="font-mono text-[10px] uppercase tracking-[0.2em]" style={{ color: "var(--app-ink-2)" }}>
            Frederick County
          </span>
          <span className="font-mono text-[10.5px] tracking-[0.06em]" style={{ color: "var(--app-ink-2)" }}>
            {rows.length} booking links
          </span>
        </div>
        <h1 className="font-serif text-[30px] font-semibold leading-[1.05] tracking-tight" style={{ color: "var(--app-ink)" }}>
          Book a table{" "}
          <span className="font-serif italic font-normal" style={{ color: "var(--app-ink-3)" }}>
            around Frederick
          </span>
        </h1>
        <p className="mt-2 max-w-prose text-[13px] leading-snug" style={{ color: "var(--app-ink-3)" }}>
          Each place below has a direct reservation page published on its
          website or checked by Radius. Live availability stays with the
          booking provider.
        </p>
      </header>

      <ul className="divide-y" style={{ borderColor: "var(--app-border)" }}>
        {rows.map(({ p, reserve }) => {
          const town = MUNICIPALITY_BY_SLUG[p.municipality ?? ""]?.name;
          return (
            <li key={p.slug} className="flex items-center gap-3 py-3" style={{ borderColor: "var(--app-border)" }}>
              <PlaceMedallion place={p} size={44} />
              <Link
                href={`/places/${p.slug}`}
                className="flex min-h-11 min-w-0 flex-1 flex-col justify-center hover:underline"
              >
                <span
                  className="font-serif text-[15.5px] font-semibold leading-snug"
                  style={{ color: "var(--app-ink)" }}
                >
                  {p.name}
                </span>
                <span className="mt-0.5 flex min-w-0 items-center gap-2">
                  <span className="truncate text-[12px]" style={{ color: "var(--app-ink-3)" }}>
                    {town ?? "Frederick County"}
                  </span>
                  <PlaceStatus status={p.open_status} className="!text-[11.5px]" />
                </span>
              </Link>
              <a
                href={reserve.url}
                target="_blank"
                rel="noopener noreferrer"
                className="tap-44-y inline-flex shrink-0 items-center gap-1.5 rounded-full px-3.5 py-1.5 text-[12.5px] font-semibold text-white"
                style={{ background: "var(--app-brand-press)" }}
                aria-label={`Reserve at ${p.name}${isBrandedProvider(reserve.provider) ? ` on ${providerLabel(reserve.provider)}` : ""}`}
              >
                <CalendarCheck className="h-3.5 w-3.5" strokeWidth={2.25} aria-hidden />
                Reserve
              </a>
            </li>
          );
        })}
      </ul>

      <div
        className="rounded-[var(--app-radius-lg)] border border-dashed p-4"
        style={{ borderColor: "var(--app-border)" }}
      >
        <p className="text-[13.5px] font-semibold" style={{ color: "var(--app-ink)" }}>
          Do you have somewhere else in mind?
        </p>
        <p className="mt-1 text-[13px] leading-relaxed" style={{ color: "var(--app-ink-3)" }}>
          OpenTable&rsquo;s own search covers the county, including spots we
          have not verified yet. You can also ask Radius
          (&ldquo;book a table for two at 7&rdquo;) and it will hand you off.
        </p>
        <a
          href={openTableSearchUrl("restaurants Frederick MD")}
          target="_blank"
          rel="noopener noreferrer"
          className="tap-44-y mt-2.5 inline-flex items-center text-[13px] font-semibold"
          style={{ color: "var(--app-brand-press)" }}
        >
          Search OpenTable
          <ArrowRight aria-hidden className="ml-1 inline h-3.5 w-3.5 -translate-y-px" strokeWidth={2.25} />
        </a>
      </div>
    </div>
  );
}
