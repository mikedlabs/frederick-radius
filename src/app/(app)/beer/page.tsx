import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { ArrowRight } from "lucide-react";
import BeerExplorerLauncher from "@/components/beer/BeerExplorerLauncher";
import BeerHero from "@/components/beer/BeerHero";
import BeerTasteFlight from "@/components/beer/BeerTasteFlight";
import BeerTaproomBoard from "@/components/beer/BeerTaproomBoard";
import BeerTaproomEvents, { BeerTaproomEventsFallback } from "@/components/beer/BeerTaproomEvents";
import OnTapNow from "@/components/beer/OnTapNow";
import type { BreweryPhotoMap } from "@/components/beer/BreweryPhoto";
import MyTaps from "@/components/beer/MyTaps";
import TaproomMap from "@/components/beer/TaproomMap";
import { BREWERIES } from "@/data/beers";
import { clientPlaceBySlug } from "@/lib/loaders/places-client";
import { slimForList, type PlaceCardData } from "@/lib/loaders/places";

export const revalidate = 3600;

export const metadata: Metadata = {
  title: "Frederick beer guide: find your pour",
  description:
    "A visual guide to 174 signature pours across 17 Frederick County breweries, with flavor matching and a device-only brewery passport. Verify availability before you go.",
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
  const breweryPhotos = Object.fromEntries(
    breweryCards.map((place) => [place.slug, place.google_photo_url ?? null]),
  ) as BreweryPhotoMap;

  return (
    <div className="space-y-12 pb-4 sm:space-y-16">
      <BeerHero />

      <BeerTaproomBoard places={breweryCards} />

      <BeerTasteFlight />

      <Suspense fallback={<BeerTaproomEventsFallback />}>
        <BeerTaproomEvents />
      </Suspense>

      {/* Live tap lists from pilot breweries' own Untappd for Business
          menus. Self-hides until at least one brewery shares a read-only
          token (docs/UNTAPPD_PILOT.md), then lights up per brewery. */}
      <Suspense fallback={null}>
        <OnTapNow />
      </Suspense>

      <TaproomMap places={breweryCards} />

      <MyTaps photos={breweryPhotos} />

      <BeerExplorerLauncher breweryCards={breweryCards} />

      <footer
        className="grid gap-4 border-t border-black/12 py-6 text-[#281e14] sm:grid-cols-[1fr_auto] sm:items-end"
      >
        <div className="max-w-[42rem] text-[11px] leading-relaxed text-black/60">
          <p className="font-semibold text-black/72">Before you go</p>
          <p className="mt-1">Signature beers are based on a July 2026 snapshot of brewery sites and Untappd. Check the brewery&rsquo;s current tap list and hours before making a special trip.</p>
        </div>
        <Link
          href="/trust"
          className="inline-flex min-h-11 shrink-0 items-center gap-1.5 self-start text-[11px] font-semibold text-black/68 sm:self-auto"
        >
          How Radius checks beer data
          <ArrowRight className="h-3 w-3" strokeWidth={2.4} aria-hidden />
        </Link>
      </footer>
    </div>
  );
}
