import type { Metadata } from "next";
import GuideHeader from "@/components/layout/GuideHeader";
import Link from "next/link";
import { ArrowRight, CalendarCheck } from "lucide-react";
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
    <div className="relative mx-auto w-full max-w-screen-md space-y-6 py-3">

      <GuideHeader title="Book a table" href="/today" parent="Today">
        Choose a restaurant to check availability on its booking site.
      </GuideHeader>

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
                className="inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-[var(--app-radius-md)] border px-3 text-[13px] font-semibold"
                style={{ color: "var(--app-link)", borderColor: "var(--app-control-border)" }}
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
