import { stampEventProvenance } from "@/lib/provenance";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { cache, Suspense } from "react";
import { AlertCircle, Apple, ArrowRight, CalendarCheck, Car, ChevronDown, ExternalLink, Globe, Instagram, Mail, MapPin, Navigation, Phone, ShoppingBag, UtensilsCrossed } from "lucide-react";
import ShareButton from "@/components/place/ShareButton";
import { PLACES } from "@/data/places";
import { getPlaceBySlug } from "@/lib/loaders/places";
import { googleMapsDirections, appleMapsDirections, actionsForPlace } from "@/lib/integrations/deeplinks";
import { isCommerceSearchLink, resolveCommerceLinks } from "@/lib/commerce/links";
import LiveOpenStatus from "@/components/place/LiveOpenStatus";
import HoursBlock from "@/components/place/HoursBlock";
import { placeHoursProvenance } from "@/lib/place-hours-provenance";
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
import { hasFieldNotes } from "@/lib/loaders/fieldNotes";
import {
  businessInfoFor,
  commerceLinksFromBusinessInfo,
} from "@/lib/loaders/businessInfo";
import PlaceVisitTracker from "@/components/place/PlaceVisitTracker";
import PlaceHero from "@/components/place/PlaceHero";
import PlaceMiniMap from "@/components/place/PlaceMiniMap";
import AerialBeat from "@/components/place/AerialBeat";
import PlacePhotoGallery from "@/components/place/PlacePhotoGallery";
import BeenHereToggle from "@/components/place/BeenHereToggle";
import PlaceAmenityIcons from "@/components/place/PlaceAmenityIcons";
import CommerceActions from "@/components/place/CommerceActions";
import { CATEGORY_BY_SLUG } from "@/data/categories";
import { MUNICIPALITY_BY_SLUG } from "@/data/municipalities";
import { getVisibleEvents } from "@/lib/events/visible";
import { classifyDescription } from "@/lib/copy-quality";
import { Button } from "@/components/ui/Button";
import { MobileActionBar, MobileBarLink } from "@/components/ui/MobileActionBar";
import SourceBadge from "@/components/place/SourceBadge";
import {
  absoluteSiteUrl,
  breadcrumbJsonLd,
  jsonLdScript,
  openingHoursJsonLd,
  specialOpeningHoursJsonLd,
} from "@/lib/seo/jsonld";
import LiveGooglePlaceContext from "@/components/place/GooglePlaceContext";
import PlaceDescriptionCredit from "@/components/place/PlaceDescriptionCredit";
import MapReturnLink from "@/components/place/MapReturnLink";
import PlaceSectionLabel from "@/components/place/PlaceSectionLabel";
import PlaceCommunicationAccess from "@/components/place/PlaceCommunicationAccess";
import PlaceVisitDetailsCard from "@/components/place/PlaceVisitDetailsCard";
import { placeVisitDetails } from "@/lib/loaders/placeVisitDetails";
import PlanFromPlaceLink from "@/components/plan/PlanFromPlaceLink";
import { isDestinationCategory, isRecommendable } from "@/lib/relevance";
import type { DecisionAction } from "@/lib/decision/telemetry";

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

export const revalidate = 300;

// Metadata and the page share one expensive nearby recommendation pass.
// React's render cache adds no cross-request lifetime; existing ISR and
// other callers' explicit origin/time behavior stay unchanged.
const getPlaceForRender = cache((slug: string) => getPlaceBySlug(slug));

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
  const place = getPlaceForRender(slug);
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
  const place = getPlaceForRender(slug);
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
  const hoursConfirmed = placeHoursProvenance(place);
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
    specialOpeningHoursSpecification: specialOpeningHoursJsonLd(place.hours),
  };

  return (
    // AppMain owns the one shared mobile-chrome reserve. Adding another page
    // pad here created a large empty tail beneath every place. That reserve
    // (6rem plus the bottom safe area) is taller than the 57px action bar,
    // so the bar never covers the footer. No entrance animation: this
    // content arrives with a navigation.
    <div
      className="space-y-5 sm:space-y-6"
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
          <li><Link prefetch={false} href="/places" className="-mx-1 -my-3.5 inline-flex min-w-11 items-center justify-center px-1 py-3.5 hover:underline">Places</Link></li>
          {town && (
            <>
              <li aria-hidden>·</li>
              <li><Link prefetch={false} href={`/m/${place.municipality}`} className="-mx-1 -my-3.5 inline-flex min-w-11 items-center justify-center px-1 py-3.5 hover:underline">{town.name}</Link></li>
            </>
          )}
          {/* Category already appears in the hero pill, the identity line,
              and the footer's explicit "More …" link. Repeating it here made
              the first phone screen say the same noun three times before the
              place name; this crumb now stays a simple place → town path. */}
        </ol>
      </nav>

      {/* PLAIN TOOL: the photograph runs edge to edge on a phone with no
          card around it, and the name sits below it on the white ground. */}
      <header
        data-place-identity
        data-decision-impression="true"
        data-decision-surface="place"
        data-decision-entity="place"
        data-decision-id={place.slug}
        data-decision-position="detail"
      >
        <PlaceHero
          slug={place.slug}
          name={place.name}
          category={place.category}
          aspectRatio="16/10"
          size="hero"
          priority
          photoSrc={place.google_photo_url}
          photoAttribution={place.google_photo_attribution}
          photoAttributions={place.google_photo_attributions}
          googleMapsUri={place.google_maps_uri}
        />
        <div className="space-y-3 pt-4">
          <Suspense fallback={null}>
            <MapReturnLink />
          </Suspense>
          {/* Title row carries the place name + address only. Save
              lives in exactly one place — the prominent "Add to My
              Radius" CTA below — so the visitor sees a single save
              action, not an icon pair crowding the title. Sharing
              stays in the footer ShareButton. */}
          <div className="min-w-0">
            <h1 className="text-[34px] font-extrabold leading-[1.04] tracking-[-0.04em] max-[359px]:text-[30px] sm:text-[44px]" style={{ color: "var(--app-ink)" }}>
              {place.name}
            </h1>
            {/* Identity line: what it is + where, at a glance. The street
                address lives in ONE place — the Location plate beside the
                map + directions — instead of being printed here too
                (July 2026 review: same fact twice above the fold). */}
            <p className="mt-1.5 text-[15px]" style={{ color: "var(--app-ink-2)" }}>
              {cat?.name ?? place.category} · {place.municipality_name}
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
          {/* Prominent text-style follow CTA — Phase 1's
              "Add to My Radius" / "In My Radius" pattern. Sits below
              the title row so it reads as the primary action on the
              place, not a header chrome icon. PendingFollowApplier
              consumes ?follow=<slug> from a post-sign-in redirect
              and applies it once before clearing the query param.

              Wrapped in <Suspense> because PendingFollowApplier calls
              useSearchParams(), which Next 16 requires under a Suspense
              boundary during static prerender of /places/[slug].
              Without this, `next build` fails the entire page export. */}
          <Suspense fallback={null}>
            <PendingFollowApplier slug={place.slug} name={place.name} />
          </Suspense>
          {/* One ruled strip holds the personal actions, so three unboxed
              text actions read as one set: 15px semibold ink, 18px icons,
              44px rows. They sit left-aligned with an even gap and wrap to a
              second line on a 320px phone instead of spreading apart or
              clipping. Without a description below, the sections' top rule
              closes the strip, so it draws only its top hairline. */}
          <div
            data-place-action-strip
            className={`flex flex-wrap items-center gap-x-5 sm:gap-x-6 ${desc ? "border-y" : "border-t"}`}
            style={{ borderColor: "var(--app-border)" }}
          >
            <MyRadiusButton slug={place.slug} name={place.name} />
            {isDestinationCategory(place.category) && isRecommendable(place) && place.is_operational !== "closed_permanently" && (
              <Suspense fallback={null}>
                <PlanFromPlaceLink slug={place.slug} name={place.name} />
              </Suspense>
            )}
            <BeenHereToggle placeSlug={place.slug} label={place.name} />
          </div>
          {desc && (
            <div>
              {/* max-w-[68ch]: cap the reading measure — on desktop the content
                  column is ~900px, which ran this prose past 100ch (UX audit). */}
              <p className="max-w-[68ch] text-[15px] leading-relaxed" style={{ color: "var(--app-ink-2)" }}>
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

      {/* PLAIN TOOL: everything below the identity is a stack of sections on
          the white ground with exactly one hairline between neighbors. The
          container draws the rules (divide-y) and the vertical rhythm (each
          direct child gets 20px above and below), so no section brings its
          own border, box or padding, and a section that renders nothing
          leaves no doubled rule behind. */}
      <div
        data-place-sections
        className="divide-y divide-[var(--app-border)] border-t *:py-5"
        style={{ borderColor: "var(--app-border)" }}
      >
      <div className="hidden grid-cols-[auto_1fr] items-center gap-x-6 gap-y-1 lg:grid lg:grid-cols-[minmax(12rem,auto)_repeat(4,auto)] lg:justify-start">
        <ActionButton href={googleUrl} icon={Navigation} label="Directions" decisionAction="directions" external primary />
        {place.email && <ActionButton href={`mailto:${place.email}`} icon={Mail} label="Email" decisionAction="email" />}
        {place.phone && <ActionButton href={`tel:${place.phone}`} icon={Phone} label="Call" decisionAction="call" />}
        {place.website && (
          <ActionButton
            href={place.website}
            icon={Globe}
            label="Website"
            decisionAction="website"
            external
          />
        )}
        <ActionButton href={appleUrl} icon={Apple} label="Apple Maps" decisionAction="directions" external />
      </div>

      <CommerceActions
        links={commerceLinks}
        placeSlug={place.slug}
        placeName={place.name}
      />

      {/* Secondary visit context is outside the identity hero and follows
          closure + action controls, so the first screen answers whether the
          place is visitable and what the user can do next. Each one is its
          own ruled section; one that has nothing to say renders nothing. */}
      <PlaceVisitDetailsCard details={visitDetails} />
      <PlaceCommunicationAccess place={place} />
      <KnownForCard
        knownFor={place.known_for}
        customersLoved={place.customers_loved}
      />
      <CourseInfoStrip slug={place.slug} />
      <PlaceAudienceTags tags={place.tags} />
      {hasFieldNotes(place.slug) ? (
        <FieldNotesCard slug={place.slug} />
      ) : (
        <BusinessExtrasCard info={businessInfo} />
      )}
      {/* The live Google check and the personal note tools are short
          actions, so they share one section instead of a rule each. */}
      <div className="space-y-2">
        <LiveGooglePlaceContext slug={place.slug} showSummary={!desc} />
        <PlaceMarginTools slug={place.slug} />
      </div>

      {/* "What you'll find": a plain two-column checklist. Self-hides
          when no amenities are curated for the place.
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
          <PlaceAmenityIcons amenities={amenities} />
        ) : null;
      })()}

      {parkActions.length > 0 && (
        <IntegrationRow
          icon={Car}
          title="Pay for parking"
          actions={parkActions}
        />
      )}

      {socialActions.length > 0 && (
        <IntegrationRow
          icon={Instagram}
          title="Follow"
          actions={socialActions}
        />
      )}

      {place.hours ? (
        <HoursBlock hours={place.hours} verified={place.hours_verified ?? false} provenance={hoursConfirmed ?? undefined} />
      ) : place.google_hours && place.google_hours.length > 0 ? (
        <GoogleHours lines={place.google_hours} />
      ) : <HoursBlock website={place.website} phone={place.phone} />}

      <PlacePhotoGallery
        key={place.slug}
        slug={place.slug}
        heroSrc={place.google_photo_url}
        heroAttribution={place.google_photo_attribution}
        photos={place.google_photos ?? []}
        name={place.name}
        attributions={place.google_photo_attributions}
      />

      <section className="space-y-3">
        <PlaceSectionLabel>Location</PlaceSectionLabel>
        {/* The address leads, then the locator in its thin frame. */}
        <div className="flex items-start gap-2 text-[15px] leading-snug">
          <MapPin className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={1.75} style={{ color: "var(--app-ink-2)" }} aria-hidden />
          <div>
            <p style={{ color: "var(--app-ink)" }}>{place.address}</p>
            <p className="text-[14px]" style={{ color: "var(--app-ink-2)" }}>{place.city}, {place.state} {place.postal_code}</p>
          </div>
        </div>
        <PlaceMiniMap lng={place.geom.lng} lat={place.geom.lat} name={place.name} color={cat?.color} />
        {/* "From above": the nearest geotagged drone shot, when one
            genuinely covers this spot (downtown Frederick). Self-hides
            elsewhere so it never fakes an aerial of a place we don't have. */}
        <AerialBeat lat={place.geom.lat} lng={place.geom.lng} label={place.city || "Frederick"} />
      </section>

      <NearbyArchiveContext lat={place.geom.lat} lng={place.geom.lng} excludeName={place.name} />

      {eventsAtThisVenue.length > 0 && (
        <section className="space-y-1">
          <div className="flex items-baseline justify-between gap-3">
            <PlaceSectionLabel>Upcoming here</PlaceSectionLabel>
            <span className="text-[14px] tabular-nums" style={{ color: "var(--app-ink-2)" }}>
              {eventsAtThisVenue.length} event{eventsAtThisVenue.length === 1 ? "" : "s"}
            </span>
          </div>
          {/* Ruled event rows. grid-cols-1 base: without an explicit column
              below lg the single implicit track sizes to max-content and
              pushed the detail page past the viewport at 320/375/768px (audit
              FR-004). min-w-0 lets each row shrink instead of forcing
              overflow. The last row drops its hairline because the section
              rule (or the "Show more" rule) already closes the list. */}
          <ul className={RULED_LIST}>
            {firstVenueEvents.map((e) => (
              <li key={`${e.slug}-${e.starts_at}`} className="min-w-0"><EventCard event={e} variant="glance" /></li>
            ))}
          </ul>
          {moreVenueEvents.length > 0 ? (
            <details className="group border-t" style={{ borderColor: "var(--app-border)" }}>
              <summary className={SHOW_MORE_SUMMARY} style={{ color: "var(--app-link)" }}>
                Show {moreVenueEvents.length} more
                <ChevronDown className="h-4 w-4 transition-transform group-open:rotate-180 motion-reduce:transition-none" strokeWidth={2} aria-hidden />
              </summary>
              <ul className={`${RULED_LIST} border-t`} style={{ borderColor: "var(--app-border)" }}>
                {moreVenueEvents.map((e) => (
                  <li key={`${e.slug}-${e.starts_at}`} className="min-w-0"><EventCard event={e} variant="glance" /></li>
                ))}
              </ul>
            </details>
          ) : null}
        </section>
      )}

      <section className="space-y-1">
        <div className="flex items-baseline justify-between gap-3">
          <PlaceSectionLabel>Nearby</PlaceSectionLabel>
          <Link prefetch={false} href={exploreAreaHref} className="tap-44 inline-flex items-center text-[14px] font-semibold underline-offset-2 hover:underline" style={{ color: "var(--app-link)" }}>
            View area <ArrowRight aria-hidden className="ml-1 h-3.5 w-3.5" strokeWidth={2.25} />
          </Link>
        </div>
        <ul className={RULED_LIST}>
          {firstNearbyPlaces.map((p) => (
            <li key={p.slug} className="min-w-0"><PlaceCard place={p} variant="row" /></li>
          ))}
        </ul>
        {moreNearbyPlaces.length > 0 ? (
          <details className="group border-t" style={{ borderColor: "var(--app-border)" }}>
            <summary className={SHOW_MORE_SUMMARY} style={{ color: "var(--app-link)" }}>
              Show {moreNearbyPlaces.length} more nearby
              <ChevronDown className="h-4 w-4 transition-transform group-open:rotate-180 motion-reduce:transition-none" strokeWidth={2} aria-hidden />
            </summary>
            <ul className={`${RULED_LIST} border-t`} style={{ borderColor: "var(--app-border)" }}>
              {moreNearbyPlaces.map((p) => (
                <li key={p.slug} className="min-w-0"><PlaceCard place={p} variant="row" /></li>
              ))}
            </ul>
          </details>
        ) : null}
      </section>

      {/* "Around here" — nearest Wikipedia articles (the what-am-I-looking-at
          context layer). Streamed so a slow Wikipedia fetch never blocks the
          page; renders nothing when there's no nearby history. */}
      <Suspense fallback={null}>
        <NearbyContext lat={place.geom.lat} lng={place.geom.lng} excludeName={place.name} />
      </Suspense>

      <footer className="space-y-1">
        <p className="text-[13px]" style={{ color: "var(--app-ink-3)" }}>
          {/* Freshness only. The source already speaks once, as the
              SourceBadge in the header decision zone — restating it here
              was the "source twice" duplicate (July 2026 review). */}
          Updated {place.updated_at}
        </p>
        <div className="flex flex-wrap items-center gap-x-5 text-[14px]">
          {cat && (
            <Link prefetch={false} href={`/category/${place.category}`} className="tap-44 inline-flex min-h-11 items-center font-semibold underline-offset-2 hover:underline" style={{ color: "var(--app-link)" }}>
              More {cat.name.toLowerCase()} <ArrowRight aria-hidden className="ml-1 inline h-3.5 w-3.5 -translate-y-px" strokeWidth={2.25} />
            </Link>
          )}
          <a
            href={`mailto:hello@frederickradius.app?subject=Correction for ${place.name}`}
            className="tap-44 inline-flex min-h-11 items-center underline underline-offset-2"
            style={{ color: "var(--app-ink-2)" }}
          >
            Report incorrect info
          </a>
          <ShareButton
            title={place.name}
            text={safeBlurb(place)}
            url={`/places/${place.slug}`}
            imageUrl={`/api/og?type=place&slug=${place.slug}&format=story`}
            className="inline-flex min-h-11 items-center gap-1.5 text-[14px] font-semibold underline-offset-2 hover:underline"
          />
        </div>
      </footer>
      </div>

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

      {/* Mobile-only thumb-reachable bar, flat against the bottom edge.
          Desktop keeps the inline action row above; this reuses the same
          directions/call links, pinned within thumb reach. Directions is the
          page's single filled coral action. Save is NOT here: it lives in
          exactly one place, the header action strip, so the page never shows
          two bookmark affordances at once (July 2026 audit). */}
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

/** A list of ruled rows (place rows, event rows). Each row ends in its own
 * hairline; the last one drops it because the section rule or a following
 * "Show more" rule already closes the list. */
const RULED_LIST =
  "grid grid-cols-1 lg:grid-cols-2 lg:gap-x-8 [&>li:last-child>*]:border-b-0";

const SHOW_MORE_SUMMARY =
  "tap-44 flex min-h-11 cursor-pointer list-none items-center justify-between text-[14px] font-semibold [&::-webkit-details-marker]:hidden";

function ActionButton({
  href, icon: Icon, label, decisionAction, external, primary = false,
}: {
  href: string;
  icon: typeof Phone;
  label: string;
  decisionAction: DecisionAction;
  external?: boolean;
  primary?: boolean;
}) {
  const Comp = external ? "a" : Link;
  return (
    <Comp
      href={href}
      data-decision-action={decisionAction}
      {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
      className={primary
        ? "tap-44 flex min-h-12 items-center justify-center gap-2 rounded-[var(--app-radius-md)] px-4 text-[15px] font-semibold"
        : "tap-44 flex min-h-12 items-center justify-start gap-2 px-1 text-[15px] font-semibold hover:underline"}
      style={primary
        ? { background: "var(--app-brand-press)", color: "var(--app-on-brand)" }
        : { color: "var(--app-ink)" }}
    >
      <Icon className="h-[18px] w-[18px]" strokeWidth={1.75} aria-hidden style={{ color: primary ? "var(--app-on-brand)" : "var(--app-ink-2)" }} />
      {label}
    </Comp>
  );
}

function ClosureBanner({
  severity, title, body, placeName,
}: { severity: "permanent" | "temporary"; title: string; body: string; placeName: string }) {
  // Closed is never red (design system). Permanent rides the neutral
  // closed-state grey; temporary keeps the Ochre caution. PLAIN TOOL: a flat
  // state band in its semantic tint with 6px corners and no outline. Title
  // and body carry the message in ink; the accent only colors the icon, so a
  // closure reads as information, not an alarm.
  const permanent = severity === "permanent";
  const bg = permanent ? "var(--state-closed-bg)" : "var(--app-warning-tint-14)";
  const accent = permanent ? "var(--state-closed)" : "var(--app-accent-press)";
  return (
    <div
      role="alert"
      className="flex items-start gap-3 rounded-[var(--app-radius-md)] px-4 py-3.5"
      style={{ background: bg }}
    >
      <AlertCircle className="mt-0.5 h-5 w-5 shrink-0" strokeWidth={1.75} aria-hidden style={{ color: accent }} />
      <div className="min-w-0 flex-1">
        <p className="text-[17px] font-semibold leading-snug" style={{ color: "var(--app-ink)" }}>{title}</p>
        <p className="mt-1 text-[15px] leading-relaxed" style={{ color: "var(--app-ink-2)" }}>{body}</p>
        <a
          href={`mailto:hello@frederickradius.app?subject=Closure status for ${placeName}`}
          className="inline-flex min-h-11 items-center text-[14px] font-semibold underline underline-offset-2"
          style={{ color: "var(--app-ink)" }}
        >
          Send a correction
        </a>
      </div>
    </div>
  );
}

function IntegrationRow({
  icon: Icon, title, actions,
}: {
  icon: typeof Phone;
  title: string;
  actions: Array<{ key: string; label: string; href: string }>;
}) {
  return (
    <section className="space-y-2">
      <PlaceSectionLabel className="inline-flex items-center gap-1.5">
        <Icon className="h-4 w-4" strokeWidth={1.75} aria-hidden style={{ color: "var(--app-cool-text)" }} />
        {title}
      </PlaceSectionLabel>
      {/* Outlined 6px link buttons; capsules are kept for filter chips. */}
      <div className="flex flex-wrap gap-2">
        {actions.map((a) => (
          <Button
            key={a.key}
            variant="secondary"
            size="md"
            href={a.href}
            target="_blank"
            rel="noopener noreferrer"
            className="border bg-transparent text-[15px]"
            style={{ borderColor: "var(--app-control-border)", backgroundColor: "transparent", color: "var(--app-ink)" }}
            iconRight={<ExternalLink className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden style={{ color: "var(--app-ink-3)" }} />}
          >
            {a.label}
          </Button>
        ))}
      </div>
    </section>
  );
}

// prettyAmenity() was removed when the amenities section moved from
// text pills to PlaceAmenityIcons. That component owns its own
// slug-to-label map (AMENITY_LABEL).
