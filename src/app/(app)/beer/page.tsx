import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { ArrowRight } from "lucide-react";
import BeerMasthead from "@/components/beer/BeerMasthead";
import BeerIndex from "@/components/beer/BeerIndex";
import BeerSpinner from "@/components/beer/BeerSpinner";
import BeerTasteFlight from "@/components/beer/BeerTasteFlight";
import BreweryStrip from "@/components/beer/BreweryStrip";
import BeerTaproomEvents, { BeerTaproomEventsFallback } from "@/components/beer/BeerTaproomEvents";
import OnTapNow from "@/components/beer/OnTapNow";
import MyTaps from "@/components/beer/MyTaps";
import TaproomMap from "@/components/beer/TaproomMap";
import BeerWorkspace from "@/components/beer/BeerWorkspace";
import { BEER_SNAPSHOT_MONTH, BREWERIES } from "@/data/beers";
import { breweryPhotoMap } from "@/lib/beer/brewery-media";
import { clientPlaceBySlug } from "@/lib/loaders/places-client";
import { slimForList, type PlaceCardData } from "@/lib/loaders/places";
import { PRODUCT_NAMES } from "@/lib/product-names";

export const revalidate = 3600;

export const metadata: Metadata = {
  title: PRODUCT_NAMES.beer.pageTitle,
  description:
    "A source-checked guide to Frederick County breweries, with taproom filters and brewery-owned live menus when available.",
  alternates: { canonical: "/beer" },
};

export default function BeerPage() {
  // The taproom map + strip need a slim place record per brewery for town,
  // coordinates, rating, and photo.
  const breweryCards: PlaceCardData[] = BREWERIES.map((brewery) =>
    clientPlaceBySlug(brewery.slug),
  )
    .filter((place): place is PlaceCardData => Boolean(place))
    .map(slimForList);
  // Beer photography has its own provenance-aware resolver. The slim client
  // records intentionally omit the per-image attribution metadata required to
  // publish Google photos, so reading google_photo_url from those records made
  // every brewery fall back. This map uses only exact-attribution assets and
  // the no-store photo transport.
  const breweryPhotos = breweryPhotoMap();

  return (
    <div className="space-y-8 pb-4 sm:space-y-10">
      {/* A restrained photo masthead establishes that this is a local brewery
          guide before the workspace asks the reader to choose a task. */}
      <BeerMasthead photos={breweryPhotos} />

      {/* One task is expanded at a time. The catalog, taprooms, events, map,
          finder, and saved pours still exist, but no longer compete as eight
          consecutive full-page zones. */}
      <BeerWorkspace
        find={
          <div className="space-y-12">
            <BeerSpinner />
            <BeerTasteFlight />
            <MyTaps />
          </div>
        }
        index={<BeerIndex photos={breweryPhotos} />}
        taprooms={
          <div className="space-y-12">
            <BreweryStrip photos={breweryPhotos} />
            <TaproomMap places={breweryCards} />
          </div>
        }
        tonight={
          <div className="space-y-12">
            {/* Live tap lists from pilot breweries' own Untappd for Business
                menus. Self-hides until a brewery shares a read-only token. */}
            <Suspense fallback={null}>
              <OnTapNow />
            </Suspense>
            <Suspense fallback={<BeerTaproomEventsFallback />}>
              <BeerTaproomEvents />
            </Suspense>
          </div>
        }
      />

      <footer
        className="grid gap-4 border-t py-6 text-[var(--app-ink)] sm:grid-cols-[1fr_auto] sm:items-end"
        style={{ borderColor: "var(--app-border)" }}
      >
        <div className="max-w-[42rem] text-[11px] leading-relaxed text-black/60">
          <p className="font-semibold text-black/72">Before you go</p>
          <p className="mt-1">
            The beer finder and index use a {BEER_SNAPSHOT_MONTH} reference
            snapshot from brewery sites and Untappd. They are not live menus.
            Check brewery-owned current details before making a special trip.
          </p>
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
