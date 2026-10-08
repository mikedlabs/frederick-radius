import { stampEventProvenance } from "@/lib/provenance";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { Fragment, Suspense } from "react";
import { AlertCircle, Apple, ArrowRight, CalendarCheck, Car, ChevronDown, ExternalLink, Globe, Mail, MapPin, Navigation, Phone, ShoppingBag, Signpost, UtensilsCrossed } from "lucide-react";
import ShareButton from "@/components/place/ShareButton";
import { PLACES } from "@/data/places";
import { getPlaceBySlug } from "@/lib/loaders/places";
import { googleMapsDirections, appleMapsDirections, actionsForPlace } from "@/lib/integrations/deeplinks";
import { isCommerceSearchLink, resolveCommerceLinks } from "@/lib/commerce/links";
import LiveOpenStatus from "@/components/place/LiveOpenStatus";
import HoursBlock from "@/components/place/HoursBlock";
import GoogleHours from "@/components/place/GoogleHours";
import PlaceCard from "@/components/place/PlaceCard";
import EventCard from "@/components/event/EventCard";
import MyRadiusButton from "@/components/place/MyRadiusButton";
import PendingFollowApplier from "@/components/place/PendingFollowApplier";
import KnownForCard from "@/components/place/KnownForCard";
import NearbyContext from "@/components/places/NearbyContext";
import NearbyArchiveContext from "@/components/archive/NearbyArchiveContext";
import CourseInfoStrip from "@/components/place/CourseInfoStrip";
import PlaceAudienceTags from "@/components/place/PlaceAudienceTags";
import BusinessExtrasCard from "@/components/place/BusinessExtrasCard";
import FieldNotesCard from "@/components/place/FieldNotesCard";
import PlaceMarginTools from "@/components/place/PlaceMarginTools";
import { fieldNotesFor, hasFieldNotes, verifiedLabel } from "@/lib/loaders/fieldNotes";
import {
  businessInfoFor,
  commerceLinksFromBusinessInfo,
} from "@/lib/loaders/businessInfo";
import PlaceVisitTracker from "@/components/place/PlaceVisitTracker";
import PlaceHero from "@/components/place/PlaceHero";
import AerialBeat from "@/components/place/AerialBeat";
import CopyAddressButton from "@/components/place/CopyAddressButton";
import HouseBeersSection from "@/components/beer/HouseBeers";
import PlacePhotoGallery from "@/components/place/PlacePhotoGallery";
import BeenHereToggle from "@/components/place/BeenHereToggle";
import PlaceAmenityIcons from "@/components/place/PlaceAmenityIcons";
import CommerceActions from "@/components/place/CommerceActions";
import { CATEGORY_BY_SLUG } from "@/data/categories";
import { MUNICIPALITY_BY_SLUG } from "@/data/municipalities";
import { getVisibleEvents } from "@/lib/events/visible";
import { classifyDescription } from "@/lib/copy-quality";
import { Button } from "@/components/ui/Button";
import SectionHeading from "@/components/ui/SectionHeading";
import { MobileActionBar, MobileBarLink } from "@/components/ui/MobileActionBar";
import SourceBadge from "@/components/place/SourceBadge";
import {
  absoluteSiteUrl,
  breadcrumbJsonLd,
  jsonLdScript,
  openingHoursJsonLd,
} from "@/lib/seo/jsonld";
import LiveGooglePlaceContext from "@/components/place/GooglePlaceContext";
import PlaceDescriptionCredit from "@/components/place/PlaceDescriptionCredit";
import MapReturnLink from "@/components/place/MapReturnLink";
import PlaceCommunicationAccess from "@/components/place/PlaceCommunicationAccess";
import PlaceVisitDetailsCard from "@/components/place/PlaceVisitDetailsCard";
import { placeVisitDetails } from "@/lib/loaders/placeVisitDetails";
import PlanFromPlaceLink from "@/components/plan/PlanFromPlaceLink";
import { isDestinationCategory, isRecommendable } from "@/lib/relevance";
import type { DecisionAction } from "@/lib/decision/telemetry";
import { formatTrustDate, placeTrustSegments, REPORT_A_CHANGE } from "@/lib/trust-language";
import {
  googleMapsHref,
  googleRatingSummary,
  nearbyLandmark,
  placeAddress,
  placeHeroMap,
  sourceHost,
} from "@/lib/place-page";

/**
 * Phase 2: never render scraped second-person copy (quality bar 9,
 * anti-pattern 12). Show the description only when the STYLE.md detector
 * passes it. Otherwise show nothing and let category and practical info
 * carry the page. No filler.
 */
function cleanCopy(
  name: string,
  raw: string | undefined,
  reviewed = false,
): string | null {
  const q = classifyDescription(name, raw, reviewed);
  return q === "auto_clean" || q === "reviewed" ? (raw ?? "").trim() : null;
}

/**
 * Clean copy for metadata, JSON-LD, and share text. Falls back to a
 * complete STYLE.md sentence so scraped copy never leaks into SEO or
 * share previews either.
 */
function safeBlurb(p: {
  name: string;
  description?: string;
  short_blurb: string;
  category_name: string;
  municipality_name: string;
  description_reviewed?: boolean;
}): string {
  return (
    cleanCopy(
      p.name,
      p.description ?? p.short_blurb,
      p.description_reviewed ?? false,
    ) ??
    `${p.category_name} in ${p.municipality_name}.`
  );
}

const HOURS_SOURCE_LABEL: Record<string, string> = {
  google_places: "Google",
  osm: "OpenStreetMap",
  manual_override: "the Frederick Radius team",
};

export const revalidate = 300;

export async function generateStaticParams() {
  return PLACES.map((p) => ({ slug: p.slug }));
}
// Places are a CLOSED set: every reachable slug — canonical or folded
// alias (verified: all 2,384 raw PLACES slugs incl. every fold key) — is
// prerendered above. With dynamicParams left on, Next 16 served unknown
// slugs a prerendered fallback shell with HTTP 200, so notFound() could
// never reach the wire and dead URLs indexed as soft 404s (June-9 deep
// audit P0-2). Closing the set makes the router 404 unknown slugs
// outright — real status, no render.
export const dynamicParams = false;

export async function generateMetadata(
  { params }: { params: Promise<{ slug: string }> }
): Promise<Metadata> {
  const { slug } = await params;
  const place = getPlaceBySlug(slug);
  // notFound() HERE, not just in the page body: metadata resolves before
  // the response streams, so the 404 status reaches the wire instead of a
  // soft 404 (200 + not-found UI) Google indexes (June-9 audit P0-2).
  if (!place) notFound();
  const blurb = safeBlurb(place);
  // Canonicalize to the RESOLVED record, not the URL param: places is a closed
  // set that prerenders every folded/legacy alias slug (each returns 200 with
  // the canonical content), so a self-referential `/places/${slug}` made each
  // alias an indexable duplicate and the fold never consolidated link equity.
  // place.slug is the surviving canonical (the BreadcrumbList already uses it).
  return {
    title: place.name,
    description: blurb,
    alternates: { canonical: `/places/${place.slug}` },
    openGraph: {
      title: place.name,
      description: blurb,
      type: "website",
      images: [{ url: `/api/og?type=place&slug=${place.slug}`, width: 1200, height: 630 }],
    },
  };
}

export default async function PlacePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const place = getPlaceBySlug(slug);
  if (!place) notFound();

  const cat = CATEGORY_BY_SLUG[place.category];
  // Only treat the municipality as a linkable town when it resolves to a real
  // /m/ slug. A handful of places sit in unincorporated areas (jefferson,
  // ijamsville) that have no town page — without this guard their breadcrumb,
  // "more in town" link, and BreadcrumbList JSON-LD all emit a 404 /m/ path
  // with an empty/undefined name. When it's not a real town, drop the crumb.
  const town = MUNICIPALITY_BY_SLUG[place.municipality];
  const desc = cleanCopy(
    place.name,
    place.description ?? place.short_blurb,
    place.description_reviewed ?? false,
  );
  // One date format for every trust fact on the page (trust-language): the
  // hours line, the Field Notes rows and the footer trust line all say
  // "Jun 15", never "3 months ago" beside "verified 2w ago" beside an ISO date.
  const hoursCheckedOn = formatTrustDate(place.hours_updated_at);
  const hoursConfirmed = place.hours_source
    ? `Hours from ${HOURS_SOURCE_LABEL[place.hours_source] ?? place.hours_source}${hoursCheckedOn ? `, checked ${hoursCheckedOn}` : ""}.`
    : null;
  const trustSegments = placeTrustSegments({
    detailsCheckedAt: place.updated_at,
    hoursStatus: place.open_status,
    hoursCheckedAt: place.hours_updated_at,
  });
  const googleUrl = googleMapsDirections(place.geom.lat, place.geom.lng);
  const appleUrl = appleMapsDirections(place.geom.lat, place.geom.lng, place.name);
  const actions = actionsForPlace(place);
  const parkActions = actions.filter((a) => a.category === "park");
  const socialActions = actions.filter((a) => a.category === "social");
  // Commerce (menu / order / reserve / delivery / catering) is now one unified
  // section driven by the normalized model, which folds in the legacy *_url
  // fields — so it supersedes the old separate Reserve/Order rows.
  const businessInfo = businessInfoFor(place.slug);
  const commerceLinks = resolveCommerceLinks(
    place,
    commerceLinksFromBusinessInfo(place.slug, businessInfo),
  );
  const reviewedVisitDetails = placeVisitDetails(place.slug);
  const commerceDestinations = new Set(commerceLinks.map((link) => link.url));
  const visitDetails = reviewedVisitDetails ? {
    ...reviewedVisitDetails,
    actions: reviewedVisitDetails.actions.filter(
      (action) => !commerceDestinations.has(action.url),
    ),
  } : null;
  const mobileCommerceLink =
    commerceLinks.find(
      (link) => link.type === "order" && !isCommerceSearchLink(link),
    ) ??
    commerceLinks.find(
      (link) => link.type === "menu" && !isCommerceSearchLink(link),
    ) ??
    commerceLinks.find(
      (link) => link.type === "reservation" && !isCommerceSearchLink(link),
    );
  const mobileCommerceAction =
    mobileCommerceLink?.type === "order"
      ? { icon: ShoppingBag, label: "Order", decisionAction: "order" as const }
      : mobileCommerceLink?.type === "menu"
        ? { icon: UtensilsCrossed, label: "Menu", decisionAction: "menu" as const }
        : mobileCommerceLink?.type === "reservation"
          ? { icon: CalendarCheck, label: "Reserve", decisionAction: "reservation" as const }
          : null;
  // Drop anything that has already ended before mapping. place.upcoming_events
  // is baked at data-build time, so without this a venue can show a past
  // event as "upcoming" once the build is a day or two old (the audit caught
  // a June 1 event still listed on June 4). getVisibleEvents is the shared
  // rule every "upcoming" surface uses, so they all agree on what's past.
  const eventsAtThisVenue = getVisibleEvents(place.upcoming_events).map((e) => ({
    ...e,
    ...stampEventProvenance(e, e.last_verified_at),
    distance_m: undefined,
    // These are this venue's own upcoming events, so the position is the
    // venue's — addressable by definition (audit #2 P1 geo confidence).
    geo_confidence: "venue_match" as const,
    category_name: CATEGORY_BY_SLUG[e.category]?.name ?? e.category,
    municipality_name: place.municipality_name,
  }));
  const firstVenueEvents = eventsAtThisVenue.slice(0, 3);
  const moreVenueEvents = eventsAtThisVenue.slice(3);
  const firstNearbyPlaces = place.nearby_places.slice(0, 3);
  const moreNearbyPlaces = place.nearby_places.slice(3, 5);
  // Preserve the exact place context. A municipality-wide list can silently
  // jump several miles away, especially near town boundaries.
  const exploreAreaHref = `/map?c=${place.geom.lng.toFixed(5)},${place.geom.lat.toFixed(5)},15.5`;
  // Visual first (docs/VISUAL_FIRST.md): with no photo that loads, the hero is
  // the place's own block on the self-hosted map, captioned with its street.
  const heroMap = placeHeroMap(place);
  const rating = googleRatingSummary(place.google_rating, place.google_rating_count);
  const ratingHref = googleMapsHref(place.google_maps_uri);
  const address = placeAddress(place);
  const landmark = nearbyLandmark(place.geom, place.name);
  // Parking is a getting-there fact, so the Location section carries it and
  // the Field Notes card leaves it out instead of printing it twice.
  const parkingNote = fieldNotesFor(place.slug)?.parking ?? null;
  const parkingHost = sourceHost(parkingNote?.source_url);

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": place.category === "restaurant" ? "Restaurant"
      : place.category === "park" || place.category === "trail" ? "Park"
      : place.category === "museum" ? "Museum"
      : place.category === "theater" ? "PerformingArtsTheater"
      : "LocalBusiness",
    name: place.name,
    description: safeBlurb(place),
    address: {
      "@type": "PostalAddress",
      streetAddress: place.address,
      addressLocality: place.city,
      addressRegion: place.state,
      postalCode: place.postal_code,
      addressCountry: "US",
    },
    geo: { "@type": "GeoCoordinates", latitude: place.geom.lat, longitude: place.geom.lng },
    telephone: place.phone,
    email: place.email,
    url: place.website,
    // Structured-data crawlers do not reliably send a browser Referer. Point
    // them at Radius-owned share art instead of the protected Google media
    // proxy, which deliberately rejects unattributed paid requests.
    image: absoluteSiteUrl(`/api/og?type=place&slug=${place.slug}`),
    priceRange: place.price_band ? "$".repeat(place.price_band) : undefined,
    openingHoursSpecification: openingHoursJsonLd(place.hours),
  };

  return (
    // AppMain owns the one shared mobile-chrome reserve. Adding another page
    // pad here created a large empty tail beneath every place.
    <div
      className="space-y-5 reveal-up sm:space-y-6"
      data-decision-surface="place"
      data-decision-entity="place"
      data-decision-id={place.slug}
      data-decision-position="detail"
    >
      {/* Records this slug into the device-local recent-places list
          so /my-radius can show "Recently viewed". Client island so
          the rest of the page stays a server component. */}
      <PlaceVisitTracker slug={place.slug} />
      {/* Breadcrumbs stay visually small, but each link has a real 44px
          minimum target. Negative block margins keep that tap area from
          adding empty space above the identity card. */}
      {/* No overflow class. `overflow-x-auto` forces overflow-y to `auto` too,
          which clipped the -my-3.5 tap expansion and left these links a 16px
          hit run at both 375 and 320 wide. There is nothing to scroll: the
          content measures 145px in a 288px box, and the longest of the 13 town
          names still fits. The event page's twin has no such class and
          measures the full 44. `overflow-x: clip` is not a substitute; it
          clips vertically as well. */}
      <nav aria-label="Breadcrumb" className="-mx-1 px-1 text-xs">
        <ol className="flex min-w-max items-center gap-1.5" style={{ color: "var(--app-ink-3)" }}>
          <li><Link href="/places" className="-mx-1 -my-3.5 inline-flex min-w-11 items-center justify-center px-1 py-3.5 hover:underline">Places</Link></li>
          {town && (
            <>
              <li aria-hidden>·</li>
              <li><Link href={`/m/${place.municipality}`} className="-mx-1 -my-3.5 inline-flex min-w-11 items-center justify-center px-1 py-3.5 hover:underline">{town.name}</Link></li>
            </>
          )}
          {/* Category already appears in the identity line and the footer's
              explicit "More …" link. Repeating it here made the first phone
              screen say the same noun again before the place name; this crumb
              stays a simple place → town path. */}
        </ol>
      </nav>

      {/* The header is the page itself, not a card holding the map, the
          title and seven controls (October 2026 review, Black Hog at 390px).
          The picture runs edge to edge on phones and keeps radius-lg from
          640px up; the title block sits on Cream inside the normal gutter. */}
      <header
        className="space-y-4"
        data-place-header
        data-decision-impression="true"
        data-decision-surface="place"
        data-decision-entity="place"
        data-decision-id={place.slug}
        data-decision-position="detail"
      >
        {/* A photo that loads, else the place's block on the map, else
            nothing: the identity block below then leads, never an empty
            band. The category is not pinned on the hero; the identity line
            directly below already states it. `empty:hidden` drops the frame
            when no picture renders, so it never leaves a gap.

            Focus: the map hero is one link exactly the size of this
            overflow-hidden frame, so its own outline is clipped on every
            side, and an inset outline paints under the map's positioned
            layers. The frame draws the ring instead: a pointer-events-none
            ::after above the picture shows an inset Brick outline while the
            hero link has keyboard focus. It is an outline rather than a
            box-shadow so it survives forced-colors mode. `isolate` keeps
            that layer inside the frame so it never paints over the sticky
            TopBar, and a pseudo-element does not count against
            `empty:hidden`. Photo credit links sit well inside the frame and
            keep their own ring. */}
        <div
          data-place-hero-frame
          className="relative isolate -mx-4 overflow-hidden empty:hidden sm:mx-0 sm:rounded-[var(--app-radius-lg)] after:pointer-events-none after:absolute after:inset-0 after:z-30 after:rounded-[inherit] after:-outline-offset-3 has-[a[data-place-hero]:focus-visible]:after:[outline:3px_solid_var(--app-brand)]"
        >
          <PlaceHero
            slug={place.slug}
            name={place.name}
            aspectRatio="16/10"
            size="hero"
            priority
            photoSrc={place.google_photo_url}
            photoAttribution={place.google_photo_attribution}
            googleMapsUri={place.google_maps_uri}
            map={heroMap}
            address={place.address}
          />
        </div>
        <div className="space-y-3">
          <Suspense fallback={null}>
            <MapReturnLink />
          </Suspense>
          {/* Title row carries the place name + address only. Save
              lives in exactly one place, the Save text button below,
              so the visitor sees a single save action, not an icon
              pair crowding the title. Sharing stays in the footer
              ShareButton. */}
          <div className="min-w-0">
            <h1 className="display-2 breathe-in" style={{ color: "var(--app-ink)" }}>
              {place.name}
            </h1>
            {/* Identity line: what it is + where, at a glance. The street
                address lives in ONE place — the Location section, with its
                Copy link — instead of being printed here too (July 2026
                review: same fact twice above the fold). */}
            {/* The Google rating rides this line when enough people rated
                the place to mean something (20 or more), with the Google
                Maps attribution its terms require. The place sheet already
                showed it; the full page used to drop it. */}
            <p className="mt-1 text-sm" style={{ color: "var(--app-ink-3)" }}>
              {cat?.name ?? place.category} · {place.municipality_name}
              {rating ? (
                <>
                  {" · "}
                  <span data-place-rating className="whitespace-nowrap">
                    <span aria-hidden style={{ color: "var(--app-ink-2)" }}>★</span>
                    <span className="sr-only">Rated</span>{" "}
                    <span className="font-semibold tabular-nums" style={{ color: "var(--app-ink-2)" }}>
                      {rating.rating}
                    </span>{" "}
                    <span className="tabular-nums">({rating.count}</span> on{" "}
                    {ratingHref ? (
                      <a
                        href={ratingHref}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="tap-44-y inline-flex items-center underline underline-offset-2"
                      >
                        <span translate="no">Google Maps</span>
                      </a>
                    ) : (
                      <span translate="no">Google Maps</span>
                    )}
                    )
                  </span>
                </>
              ) : null}
            </p>
            {/* The visit-decision facts — open/closed, price, provenance —
                sit directly under the address, first screenful. They lived
                at the BOTTOM of this card, below the personal note/list
                tooling, which made a first-time visitor scroll past margin
                widgets to learn "is it open" (July 2026 audit). */}
            <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
              {/* Recomputed against the visitor's clock (LiveOpenStatus):
                  the ISR-baked value said "Closing soon" while HoursBlock said
                  "Closed" around closing time (fresh-eyes audit, Jul 2026). */}
              <LiveOpenStatus
                hours={place.hours}
                verified={place.hours_verified ?? false}
                initial={place.open_status}
              />
              {place.price_band && (
                <span className="font-medium" style={{ color: "var(--app-ink-3)" }}>
                  {"$".repeat(place.price_band)}
                </span>
              )}
              <SourceBadge place={place} size="md" />
              {/* Hours provenance lives in the HoursBlock details (passed as
                  `provenance`) so the freshness label stays honest without
                  crowding the open/closed decision zone. */}
            </div>
          </div>
          {/* Save and "Plan from here" are one row of 44px Brick-press text
              buttons under the title, with no pills, so Directions stays the
              page's one filled action. PendingFollowApplier
              consumes ?follow=<slug> from a post-sign-in redirect
              and applies it once before clearing the query param.

              Wrapped in <Suspense> because PendingFollowApplier calls
              useSearchParams(), which Next 16 requires under a Suspense
              boundary during static prerender of /places/[slug].
              Without this, `next build` fails the entire page export. */}
          <Suspense fallback={null}>
            <PendingFollowApplier slug={place.slug} name={place.name} />
          </Suspense>
          <div data-place-header-actions className="-my-1 flex flex-wrap items-center gap-x-6">
            <MyRadiusButton slug={place.slug} name={place.name} appearance="text" />
            {isDestinationCategory(place.category) && isRecommendable(place) && place.is_operational !== "closed_permanently" && (
              <Suspense fallback={null}>
                <PlanFromPlaceLink slug={place.slug} name={place.name} appearance="text" />
              </Suspense>
            )}
          </div>
          {desc && (
            <div>
              {/* max-w-[68ch]: cap the reading measure — on desktop the content
                  column is ~900px, which ran this prose past 100ch (UX audit). */}
              <p className="text-body max-w-[68ch] leading-relaxed" style={{ color: "var(--app-ink-2)" }}>
                {desc}
              </p>
              <PlaceDescriptionCredit
                kind={place.description_source}
                url={place.description_source_url}
                verifiedAt={place.description_verified_at}
              />
            </div>
          )}
        </div>
      </header>

      {place.is_operational === "closed_permanently" && (
        <ClosureBanner
          severity="permanent"
          title="This place is permanently closed."
          body="We're keeping this page up so old links resolve, but you can't visit. If this is wrong, please let us know."
          placeName={place.name}
        />
      )}
      {place.is_operational === "closed_temporarily" && (
        <ClosureBanner
          severity="temporary"
          title="Currently closed."
          body="The owner has flagged this place as temporarily closed. Check their website or call before going."
          placeName={place.name}
        />
      )}

      {/* Desktop actions: one row, not four 450px tiles. Directions is the
          only filled Brick button, sized to its label; the rest are 44px
          text buttons. The phone dock below carries the same actions. */}
      <div
        data-place-desktop-actions
        className="hidden flex-wrap items-center gap-x-6 gap-y-1 lg:flex"
      >
        <Button
          variant="primary"
          size="lg"
          href={googleUrl}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={`Directions to ${place.name}`}
          data-decision-action="directions"
          iconLeft={<Navigation className="h-4 w-4" aria-hidden />}
        >
          Directions
        </Button>
        {place.phone && <ActionTextLink href={`tel:${place.phone}`} icon={Phone} label="Call" decisionAction="call" />}
        {place.website && (
          <ActionTextLink
            href={place.website}
            icon={Globe}
            label="Website"
            decisionAction="website"
            external
          />
        )}
        <ActionTextLink href={appleUrl} icon={Apple} label="Apple Maps" decisionAction="directions" external />
        {place.email && <ActionTextLink href={`mailto:${place.email}`} icon={Mail} label="Email" decisionAction="email" />}
      </div>

      {/* Secondary visit context is outside the identity hero and follows
          closure + action controls, so the first screen answers whether the
          place is visitable and what the user can do next. */}
      <div className="space-y-3">
        <PlaceVisitDetailsCard details={visitDetails} />
        <PlaceCommunicationAccess place={place} />
        <KnownForCard
          knownFor={place.known_for}
          customersLoved={place.customers_loved}
        />
        <CourseInfoStrip slug={place.slug} />
        <PlaceAudienceTags tags={place.tags} />
        {hasFieldNotes(place.slug) ? (
          <FieldNotesCard slug={place.slug} omitParking />
        ) : (
          <BusinessExtrasCard info={businessInfo} />
        )}
        <LiveGooglePlaceContext slug={place.slug} showSummary={!desc} />
        <PlaceMarginTools slug={place.slug} />
        {/* Personal "been here" marker: a quiet device-local text toggle at
            the end of the visit section, off the first screen. */}
        <div className="flex">
          <BeenHereToggle placeSlug={place.slug} label={place.name} />
        </div>
      </div>

      {/* For the guided breweries: up to four flagships from the beer guide
          and the brewery's own tap list. Self-hides for every other place. */}
      <HouseBeersSection slug={place.slug} />

      {/* Waze-style amenity icon row. Lives right after the primary
          action grid so the user gets the "what's here?" answer in
          glyph form before any text. Self-hides when no amenities
          are curated for the place. Accent matches the place's
          category color so the row reads as part of the place's
          identity, not as decoration.
          Source: prefer the curated `amenities` array, fall back to
          the amenity-facet subset of `tags` so dog-friendly parks /
          patios / outdoor-seating venues surface their icons without
          a manual `amenities` curation pass per record. */}
      {(() => {
        const AMENITY_TAG_SLUGS = new Set([
          "wifi", "outdoor-seating", "dog-friendly", "patio", "live-music",
          "byob", "takeout", "delivery", "reservations", "walk-in",
          "parking-lot", "bike-rack", "restroom",
        ]);
        const amenities =
          place.amenities && place.amenities.length > 0
            ? place.amenities
            : (place.tags ?? []).filter((t) => AMENITY_TAG_SLUGS.has(t));
        return amenities.length > 0 ? (
          <PlaceAmenityIcons
            amenities={amenities}
            accent={cat?.color ?? "var(--app-brand)"}
          />
        ) : null;
      })()}

      {parkActions.length > 0 && (
        <IntegrationRow
          title="Pay for parking"
          actions={parkActions}
        />
      )}

      {socialActions.length > 0 && (
        <IntegrationRow
          title="Follow"
          actions={socialActions}
        />
      )}

      {place.hours ? (
        <HoursBlock hours={place.hours} verified={place.hours_verified ?? false} provenance={hoursConfirmed ?? undefined} />
      ) : place.google_hours && place.google_hours.length > 0 ? (
        <GoogleHours lines={place.google_hours} />
      ) : null}

      {/* Menu and ordering comes after the hours and visit details, as ruled
          link rows. The phone dock keeps its own order affordance. */}
      <CommerceActions
        links={commerceLinks}
        placeSlug={place.slug}
        placeName={place.name}
      />

      <PlacePhotoGallery
        photos={place.google_photos ?? []}
        name={place.name}
        attributions={place.google_photo_attributions}
        placeGoogleMapsUri={place.google_maps_uri}
      />

      {/* Location reads in the order someone uses it: the address (with
          Copy), the landmark a local would steer by, where to park, then the
          live map. The block itself is the hero when no photo loads, so the
          section ends in one map row instead of a second mini map. */}
      <section aria-label="Location" data-place-location className="space-y-2">
        <SectionHeading size="sm" title="Location" />
        <div className="border-t text-sm" style={{ borderColor: "var(--app-border)" }}>
          <div className="flex items-start gap-2 border-b py-3" style={{ borderColor: "var(--app-border)" }}>
            <MapPin className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={1.75} style={{ color: "var(--app-ink-3)" }} aria-hidden />
            <div className="min-w-0 flex-1">
              <p style={{ color: "var(--app-ink)" }}>{address.street}</p>
              {address.locality ? <p style={{ color: "var(--app-ink-3)" }}>{address.locality}</p> : null}
            </div>
            <CopyAddressButton address={address.full} placeName={place.name} />
          </div>
          {landmark ? (
            <p
              data-place-landmark
              className="flex items-center gap-2 border-b py-3"
              style={{ borderColor: "var(--app-border)", color: "var(--app-ink-2)" }}
            >
              <Signpost className="h-4 w-4 shrink-0" strokeWidth={1.75} style={{ color: "var(--app-ink-3)" }} aria-hidden />
              Near {landmark}
            </p>
          ) : null}
          {parkingNote ? (
            <div data-place-parking className="flex items-start gap-2 border-b py-3" style={{ borderColor: "var(--app-border)" }}>
              <Car className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={1.75} style={{ color: "var(--app-cool)" }} aria-hidden />
              <div className="min-w-0">
                <p style={{ color: "var(--app-ink-2)" }}>
                  <span className="font-semibold" style={{ color: "var(--app-ink)" }}>Parking </span>
                  {parkingNote.text}
                </p>
                <p className="text-caption mt-1 flex flex-wrap items-center gap-x-1" style={{ color: "var(--app-ink-3)" }}>
                  <span>{verifiedLabel(parkingNote.last_verified) ?? "Verification date not recorded"}</span>
                  {parkingHost && parkingNote.source_url ? (
                    <>
                      <span aria-hidden>·</span>
                      <a
                        href={parkingNote.source_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="tap-44-y inline-flex items-center gap-0.5 underline-offset-2 hover:underline"
                      >
                        {parkingHost}
                        <ExternalLink className="h-2.5 w-2.5" strokeWidth={2} aria-hidden />
                      </a>
                    </>
                  ) : null}
                </p>
              </div>
            </div>
          ) : null}
          <Link
            href={exploreAreaHref}
            prefetch={false}
            className="flex min-h-11 items-center justify-between gap-2 border-b py-2 font-semibold"
            style={{ borderColor: "var(--app-border)", color: "var(--app-brand-press)" }}
          >
            Open on the Radius map
            <ArrowRight aria-hidden className="h-4 w-4 shrink-0" strokeWidth={2} />
          </Link>
        </div>
      </section>

      <NearbyArchiveContext lat={place.geom.lat} lng={place.geom.lng} excludeName={place.name} />

      {/* The text-pill amenities section that used to live here was
          replaced by the Waze-style icon row directly under the
          primary action buttons. Same data source (place.amenities),
          one rendering, much faster to scan. */}

      {eventsAtThisVenue.length > 0 && (
        <section className="space-y-3">
          <div className="flex items-baseline justify-between gap-3">
            <h2 className="text-title" style={{ color: "var(--app-ink)" }}>
              Upcoming here
            </h2>
            <span className="text-[12px] tabular-nums" style={{ color: "var(--app-ink-3)" }}>
              {eventsAtThisVenue.length} event{eventsAtThisVenue.length === 1 ? "" : "s"}
            </span>
          </div>
          {/* grid-cols-1 base: without an explicit column below lg the single
              implicit track sizes to max-content and pushed the detail page
              past the viewport at 320/375/768px (audit FR-004). min-w-0 lets
              each card shrink instead of forcing overflow. */}
          <ul className="grid grid-cols-1 gap-2 lg:grid-cols-2">
            {firstVenueEvents.map((e) => (
              <li key={`${e.slug}-${e.starts_at}`} className="min-w-0"><EventCard event={e} variant="glance" /></li>
            ))}
          </ul>
          {moreVenueEvents.length > 0 ? (
            <details className="group border-t" style={{ borderColor: "var(--app-border)" }}>
              <summary className="tap-44 flex cursor-pointer list-none items-center justify-between text-[13px] font-semibold [&::-webkit-details-marker]:hidden" style={{ color: "var(--app-brand-press)" }}>
                Show {moreVenueEvents.length} more
                <ChevronDown className="h-4 w-4 transition-transform group-open:rotate-180" strokeWidth={2} aria-hidden />
              </summary>
              <ul className="grid grid-cols-1 gap-2 pt-2 lg:grid-cols-2">
                {moreVenueEvents.map((e) => (
                  <li key={`${e.slug}-${e.starts_at}`} className="min-w-0"><EventCard event={e} variant="glance" /></li>
                ))}
              </ul>
            </details>
          ) : null}
        </section>
      )}

      <section className="space-y-3">
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="text-title" style={{ color: "var(--app-ink)" }}>Nearby</h2>
          <Link href={exploreAreaHref} className="tap-44 inline-flex items-center text-[12px] font-semibold" style={{ color: "var(--app-brand-press)" }}>
            View area <ArrowRight aria-hidden className="ml-1 h-3.5 w-3.5" strokeWidth={2.25} />
          </Link>
        </div>
        <ul className="grid grid-cols-1 gap-2 lg:grid-cols-2">
          {firstNearbyPlaces.map((p) => (
            <li key={p.slug} className="min-w-0"><PlaceCard place={p} variant="row" /></li>
          ))}
        </ul>
        {moreNearbyPlaces.length > 0 ? (
          <details className="group border-t" style={{ borderColor: "var(--app-border)" }}>
            <summary className="tap-44 flex cursor-pointer list-none items-center justify-between text-[13px] font-semibold [&::-webkit-details-marker]:hidden" style={{ color: "var(--app-brand-press)" }}>
              Show {moreNearbyPlaces.length} more nearby
              <ChevronDown className="h-4 w-4 transition-transform group-open:rotate-180" strokeWidth={2} aria-hidden />
            </summary>
            <ul className="grid grid-cols-1 gap-2 pt-2 lg:grid-cols-2">
              {moreNearbyPlaces.map((p) => (
                <li key={p.slug} className="min-w-0"><PlaceCard place={p} variant="row" /></li>
              ))}
            </ul>
          </details>
        ) : null}
      </section>

      {/* "From above": the nearest owner drone frame, only when it was taken
          within 150 m of this place and inside the same municipality. It is
          named and dated from its own geotag and capture time, so a Frederick
          frame never appears on a Walkersville page as "Walkersville". */}
      <AerialBeat lat={place.geom.lat} lng={place.geom.lng} municipality={place.municipality} />

      {/* "Around here" — nearest Wikipedia articles (the what-am-I-looking-at
          context layer). Streamed so a slow Wikipedia fetch never blocks the
          page; renders nothing when there's no nearby history. */}
      <Suspense fallback={null}>
        <NearbyContext lat={place.geom.lat} lng={place.geom.lng} excludeName={place.name} />
      </Suspense>

      <footer className="space-y-2 pt-4">
        {/* Photo credit is set on the hero photo itself, and only after that
            photo has loaded, so it is no longer printed here. */}
        {/* One trust line in the trust-language vocabulary: when the details
            were checked, what Radius can say about the hours, and the way to
            correct either ("Details checked May 20 · Hours not confirmed ·
            Report a change"). It replaced a raw "Updated 2026-05-14". The
            source already speaks once, as the SourceBadge in the header
            decision zone, so it is not restated here (July 2026 review). */}
        <p
          className="flex flex-wrap items-center gap-x-1.5 text-[12px]"
          style={{ color: "var(--app-ink-3)" }}
        >
          {trustSegments.map((segment) => (
            <Fragment key={segment}>
              <span>{segment}</span>
              <span aria-hidden>·</span>
            </Fragment>
          ))}
          <a
            href={`mailto:hello@frederickradius.app?subject=Correction for ${place.name}`}
            className="tap-44 inline-flex items-center underline underline-offset-2"
            style={{ color: "var(--app-ink-3)" }}
          >
            {REPORT_A_CHANGE}
          </a>
        </p>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
          {cat && (
            <Link href={`/category/${place.category}`} className="tap-44 inline-flex items-center" style={{ color: "var(--app-brand-press)" }}>
              More {cat.name.toLowerCase()} <ArrowRight aria-hidden className="ml-1 inline h-3.5 w-3.5 -translate-y-px" strokeWidth={2.25} />
            </Link>
          )}
          <ShareButton
            title={place.name}
            text={safeBlurb(place)}
            url={`/places/${place.slug}`}
            imageUrl={`/api/og?type=place&slug=${place.slug}&format=story`}
          />
        </div>
      </footer>

      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLdScript(jsonLd) }}
      />
      {/* BreadcrumbList (June-9 audit P2): mirrors the visible breadcrumb. */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: jsonLdScript(
            breadcrumbJsonLd([
              { name: "Places", path: "/places" },
              ...(town ? [{ name: town.name, path: `/m/${place.municipality}` }] : []),
              ...(cat ? [{ name: cat.name, path: `/category/${place.category}` }] : []),
              { name: place.name, path: `/places/${place.slug}` },
            ]),
          ),
        }}
      />

      {/* Mobile-only thumb-reachable dock. Desktop keeps the inline action
          row above; this reuses the same directions/call links, pinned
          within thumb reach. Directions is the one vermilion primary. Save
          is NOT here: it lives in exactly one place — the header CTA above
          the fold — so the page never shows two bookmark affordances at
          once (the bar's copy duplicated it; July 2026 audit). */}
      <MobileActionBar ariaLabel={`Actions for ${place.name}`}>
        <MobileBarLink
          href={googleUrl}
          icon={Navigation}
          label="Directions"
          ariaLabel={`Directions to ${place.name}`}
          external
          primary
          decisionAction="directions"
        />
        {place.email && (
          <MobileBarLink
            href={`mailto:${place.email}`}
            icon={Mail}
            label="Email"
            ariaLabel={`Email ${place.name}`}
            decisionAction="email"
          />
        )}
        {place.phone && (
          <MobileBarLink
            href={`tel:${place.phone}`}
            icon={Phone}
            label="Call"
            ariaLabel={`Call ${place.name}`}
            decisionAction="call"
          />
        )}
        {mobileCommerceLink && mobileCommerceAction ? (
          <MobileBarLink
            href={mobileCommerceLink.url}
            icon={mobileCommerceAction.icon}
            label={mobileCommerceAction.label}
            ariaLabel={`${mobileCommerceAction.label} at ${place.name}`}
            decisionAction={mobileCommerceAction.decisionAction}
            external
          />
        ) : place.website && !place.email ? (
          <MobileBarLink
            href={place.website}
            icon={Globe}
            label="Website"
            ariaLabel={`${place.name} website`}
            decisionAction="website"
            external
          />
        ) : null}
      </MobileActionBar>
    </div>
  );
}

/** A desktop secondary action: a 44px icon-plus-label text button. */
function ActionTextLink({
  href, icon: Icon, label, decisionAction, external,
}: {
  href: string;
  icon: typeof Phone;
  label: string;
  decisionAction: DecisionAction;
  external?: boolean;
}) {
  return (
    <a
      href={href}
      data-decision-action={decisionAction}
      {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
      className="inline-flex min-h-11 items-center gap-1.5 text-body font-semibold underline-offset-4 hover:underline"
      style={{ color: "var(--app-brand-press)" }}
    >
      <Icon className="h-4 w-4" strokeWidth={1.75} aria-hidden />
      {label}
    </a>
  );
}

function ClosureBanner({
  severity, title, body, placeName,
}: { severity: "permanent" | "temporary"; title: string; body: string; placeName: string }) {
  // Closed is never red (design system): demote the saturated toast slab to a
  // calm tinted plate. Permanent rides the neutral closed-state grey; temporary
  // keeps a soft amber. Title/body carry the message in ink, the accent only
  // tints the icon + hairline — so a closure reads as information, not an alarm.
  const permanent = severity === "permanent";
  const bg = permanent ? "var(--state-closed-bg)" : "var(--app-warning-tint-14)";
  const accent = permanent ? "var(--state-closed)" : "var(--app-accent-press)";
  return (
    <div
      role="alert"
      className="flex items-start gap-3 rounded-[var(--app-radius-lg)] border p-4"
      style={{ background: bg, borderColor: `color-mix(in srgb, ${accent} 30%, transparent)` }}
    >
      <AlertCircle className="mt-0.5 h-5 w-5 shrink-0" strokeWidth={1.75} aria-hidden style={{ color: accent }} />
      <div className="min-w-0 flex-1">
        <p className="font-serif text-lg font-semibold leading-tight" style={{ color: "var(--app-ink)" }}>{title}</p>
        <p className="mt-1 text-[13px] leading-relaxed" style={{ color: "var(--app-ink-2)" }}>{body}</p>
        <a
          href={`mailto:hello@frederickradius.app?subject=Closure status for ${placeName}`}
          className="mt-2 inline-block text-[12px] font-semibold underline underline-offset-2"
          style={{ color: "var(--app-ink-2)" }}
        >
          Send a correction
        </a>
      </div>
    </div>
  );
}

function IntegrationRow({
  title, actions,
}: {
  title: string;
  actions: Array<{ key: string; label: string; href: string }>;
}) {
  return (
    <section className="space-y-2">
      <SectionHeading size="sm" title={title} />
      <div className="flex flex-wrap gap-1.5">
        {actions.map((a) => (
          <Button
            key={a.key}
            variant="secondary"
            size="sm"
            href={a.href}
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-full"
            iconRight={<ExternalLink className="h-3 w-3" strokeWidth={1.75} aria-hidden style={{ color: "var(--app-ink-3)" }} />}
          >
            {a.label}
          </Button>
        ))}
      </div>
    </section>
  );
}

// prettyAmenity() was removed when the amenities section moved from
// text pills to PlaceAmenityIcons. The icon component owns its own
// slug → label map (AMENITY_META).
