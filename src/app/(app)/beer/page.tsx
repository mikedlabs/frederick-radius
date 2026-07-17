import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { ArrowRight, Database } from "lucide-react";
import BeerExplorerLauncher from "@/components/beer/BeerExplorerLauncher";
import BeerGuides from "@/components/beer/BeerGuides";
import BeerHero from "@/components/beer/BeerHero";
import BeerPassport from "@/components/beer/BeerPassport";
import BeerTasteFlight from "@/components/beer/BeerTasteFlight";
import BeerTaproomBoard from "@/components/beer/BeerTaproomBoard";
import BeerTaproomEvents, { BeerTaproomEventsFallback } from "@/components/beer/BeerTaproomEvents";
import type { BreweryPhotoMap } from "@/components/beer/BreweryPhoto";
import MyTaps from "@/components/beer/MyTaps";
import TaproomMap from "@/components/beer/TaproomMap";
import PageBloom from "@/components/ui/PageBloom";
import { BREWERIES } from "@/data/beers";
import { clientPlaceBySlug } from "@/lib/loaders/places-client";
import { slimForList, type PlaceCardData } from "@/lib/loaders/places";

export const revalidate = 3600;

export const metadata: Metadata = {
  title: "Frederick beer guide: find your pour",
  description:
    "A visual guide to 174 signature pours from 17 Frederick County breweries. Match by flavor, save a flight, stamp your brewery passport, and verify availability before you go.",
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
    <div className="relative space-y-14 pb-4 sm:space-y-20">
      <PageBloom variant="warm-cool" />

      <BeerHero photos={breweryPhotos} />

      {/* One primary decision surface: all local brewery marks, setting and
          group filters, verified source links, and a client-fresh hours
          signal. This replaces the old stack of open-now, link-strip, and
          photo-scene modules that made the page feel like several apps. */}
      <BeerTaproomBoard places={breweryCards} />

      <Suspense fallback={<BeerTaproomEventsFallback />}>
        <BeerTaproomEvents />
      </Suspense>

      <BeerTasteFlight photos={breweryPhotos} />

      <BeerGuides photos={breweryPhotos} />

      {/* Geography is a decision tool after taste and setting, not the page's
          opening directory. Mapbox still loads only after a user asks. */}
      <TaproomMap places={breweryCards} />

      {/* Saved pours appear only after the user has made a choice. */}
      <MyTaps photos={breweryPhotos} />

      <BeerPassport />
      <BeerExplorerLauncher breweryCards={breweryCards} />

      <footer
        className="-mx-4 grid gap-6 border-y border-white/10 bg-[#15130f] px-5 py-8 text-[#f7f0e4] sm:-mx-5 sm:grid-cols-[1fr_auto] sm:items-end sm:px-8 lg:mx-0 lg:rounded-[8px] lg:border lg:px-10"
        style={{
          boxShadow: "0 24px 52px -36px rgba(20,14,8,.72)",
        }}
      >
        <div className="max-w-[42rem]">
          <p className="flex items-center gap-2 font-mono text-[8px] font-bold uppercase tracking-[0.18em] text-[#e3b65d]"><Database className="h-3.5 w-3.5" strokeWidth={1.9} aria-hidden />Before the next round</p>
          <p className="mt-3 max-w-[13ch] font-serif text-[32px] font-semibold leading-[0.9] tracking-[-0.035em]">Drink curious. Check the tap.</p>
          <p className="mt-4 text-[10px] leading-relaxed text-white/42">July 2026 signature-pour snapshot. Brewery sites and Untappd inform the guide; availability and hours can change.</p>
        </div>
        <Link
          href="/trust"
          className="inline-flex min-h-11 shrink-0 items-center gap-1.5 self-start border-b border-[#e3b65d] text-[11px] font-semibold text-white/72 sm:self-auto"
        >
          How Radius checks data
          <ArrowRight className="h-3 w-3" strokeWidth={2.4} aria-hidden />
        </Link>
      </footer>
    </div>
  );
}
