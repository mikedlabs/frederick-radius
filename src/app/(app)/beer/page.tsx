import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Database } from "lucide-react";
import BeerExplorerLauncher from "@/components/beer/BeerExplorerLauncher";
import BeerGuides from "@/components/beer/BeerGuides";
import BeerHero from "@/components/beer/BeerHero";
import BeerPassport from "@/components/beer/BeerPassport";
import BeerTasteFlight from "@/components/beer/BeerTasteFlight";
import { BreweryScenes } from "@/components/beer/BreweryScenes";
import MyTaps from "@/components/beer/MyTaps";
import PageBloom from "@/components/ui/PageBloom";
import { ALL_BEERS, BREWERIES } from "@/data/beers";
import { clientPlaceBySlug } from "@/lib/loaders/places-client";
import { slimForList, type PlaceCardData } from "@/lib/loaders/places";

export const revalidate = 3600;

export const metadata: Metadata = {
  title: "Frederick beer guide: find your pour",
  description:
    `A visual guide to ${ALL_BEERS.length} signature pours across ${BREWERIES.length} Frederick County brewery guides. Match by flavor, save a shortlist, stamp your brewery passport, and verify availability before you go.`,
  alternates: { canonical: "/beer" },
};

export default function BeerPage() {
  // The complete explorer is secondary and lazy. Its cards still need a slim
  // place record for town, map, rating, and user-triggered distance tools.
  const breweryCards: PlaceCardData[] = BREWERIES.map((brewery) =>
    clientPlaceBySlug(brewery.slug),
  )
    .filter((place): place is PlaceCardData => Boolean(place))
    .map(slimForList);

  return (
    <div className="relative space-y-12 pb-4">
      <PageBloom variant="warm-cool" />

      <BeerHero />
      <BreweryScenes />
      <BeerTasteFlight />

      {/* Saved pours appear only after the user has made a choice. */}
      <MyTaps />

      <BeerPassport />
      <BeerGuides />
      <BeerExplorerLauncher breweryCards={breweryCards} beerCount={ALL_BEERS.length} />

      <footer
        className="flex flex-col gap-3 rounded-[var(--app-radius-md)] border p-4 sm:flex-row sm:items-center sm:justify-between"
        style={{
          borderColor: "var(--app-border)",
          background: "var(--app-bg-sunken)",
          color: "var(--app-ink-3)",
        }}
      >
        <div className="flex max-w-[42rem] gap-2.5">
          <Database className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={1.9} aria-hidden />
          <p className="text-[11px] leading-relaxed">
            July 2026 editorial snapshot, not a live tap list or operating-status directory. Details came from brewery websites, Visit Frederick, and brewery profiles on Untappd. Verify hours, access, and availability with the brewery.
          </p>
        </div>
        <Link
          href="/trust"
          className="tap-44-y inline-flex shrink-0 items-center gap-1.5 self-start text-[11px] font-semibold sm:self-auto"
          style={{ color: "var(--app-brand-press)" }}
        >
          How Radius checks data
          <ArrowRight className="h-3 w-3" strokeWidth={2.4} aria-hidden />
        </Link>
      </footer>
      <p className="px-1 text-[10px] leading-relaxed" style={{ color: "var(--app-ink-3)" }}>
        Brewery names and logos belong to their respective owners and are used only to identify each brewery. Frederick Radius is independent and is not endorsed by Visit Frederick or any featured brewery.
      </p>
    </div>
  );
}
