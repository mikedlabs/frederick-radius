import { stampEventProvenance } from "@/lib/provenance";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { Suspense } from "react";
import { Phone, Globe, MapPin, Navigation, Apple, AlertCircle, Utensils, ShoppingBag, Car, Instagram, ExternalLink } from "lucide-react";
import ShareButton from "@/components/place/ShareButton";
import { PLACES } from "@/data/places";
import { getPlaceBySlug } from "@/lib/loaders/places";
import { googleMapsDirections, appleMapsDirections, actionsForPlace } from "@/lib/integrations/deeplinks";
import OpenClosedDot from "@/components/place/OpenClosedDot";
import HoursBlock from "@/components/place/HoursBlock";
import GoogleHours from "@/components/place/GoogleHours";
import PlaceCard from "@/components/place/PlaceCard";
import EventCard from "@/components/event/EventCard";
import MyRadiusButton from "@/components/place/MyRadiusButton";
import PendingFollowApplier from "@/components/place/PendingFollowApplier";
import KnownForCard from "@/components/place/KnownForCard";
import ParkAmenitiesStrip from "@/components/place/ParkAmenitiesStrip";
import CourseInfoStrip from "@/components/place/CourseInfoStrip";
import PlaceAudienceTags from "@/components/place/PlaceAudienceTags";
import BusinessExtrasCard from "@/components/place/BusinessExtrasCard";
import FieldNotesCard from "@/components/place/FieldNotesCard";
import PlaceNoteCard from "@/components/place/PlaceNoteCard";
import { hasFieldNotes } from "@/lib/loaders/fieldNotes";
import { businessInfoFor } from "@/lib/loaders/businessInfo";
import PlaceVisitTracker from "@/components/place/PlaceVisitTracker";
import PlaceHero, { PhotoCredit } from "@/components/place/PlaceHero";
import PlaceMiniMap from "@/components/place/PlaceMiniMap";
import AerialBeat from "@/components/place/AerialBeat";
import PlacePhotoGallery from "@/components/place/PlacePhotoGallery";
import BeenHereToggle from "@/components/place/BeenHereToggle";
import PlaceAmenityIcons from "@/components/place/PlaceAmenityIcons";
import { CATEGORY_BY_SLUG } from "@/data/categories";
import { MUNICIPALITY_BY_SLUG } from "@/data/municipalities";
import { getVisibleEvents } from "@/lib/events/visible";
import { classifyDescription } from "@/lib/copy-quality";
import { Button } from "@/components/ui/Button";
import SourceBadge from "@/components/place/SourceBadge";
import { breadcrumbJsonLd } from "@/lib/seo/jsonld";

/**
 * Phase 2: never render scraped second-person copy (quality bar 9,
 * anti-pattern 12). Show the description only when the STYLE.md detector
 * passes it. Otherwise show nothing and let category and practical info
 * carry the page. No filler.
 */
function cleanCopy(name: string, raw: string | undefined): string | null {
  const q = classifyDescription(name, raw);
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
}): string {
  return (
    cleanCopy(p.name, p.description ?? p.short_blurb) ??
    `${p.category_name} in ${p.municipality_name}.`
  );
}

/** "today", "3 days ago", "last month" — for the hours freshness line. */
function confirmedAgo(iso: string | undefined): string | null {
  if (!iso) return null;
  const d = Date.now() - new Date(iso).getTime();
  if (!Number.isFinite(d) || d < 0) return null;
  const days = Math.floor(d / 86_400_000);
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 30) return `${days} days ago`;
  if (days < 60) return "last month";
  return `${Math.floor(days / 30)} months ago`;
}

const HOURS_SOURCE_LABEL: Record<string, string> = {
  google_places: "Google",
  osm: "OpenStreetMap",
  manual_override: "the Frederick Radius team",
};

// Pipeline source ids -> reader-facing provenance labels.
const SOURCE_LABEL: Record<string, string> = {
  seed: "Radius editorial",
  manual: "Radius editorial",
  dfp: "Downtown Frederick Partnership",
  google: "Google Places",
  osm: "OpenStreetMap",
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
  return {
    title: place.name,
    description: blurb,
    alternates: { canonical: `/places/${slug}` },
    openGraph: {
      title: place.name,
      description: blurb,
      type: "website",
      images: [{ url: `/api/og?type=place&slug=${slug}`, width: 1200, height: 630 }],
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
  const desc = cleanCopy(place.name, place.description ?? place.short_blurb);
  const hoursConfirmed = place.hours_source
    ? `Hours from ${HOURS_SOURCE_LABEL[place.hours_source] ?? place.hours_source}, confirmed ${confirmedAgo(place.hours_updated_at) ?? "recently"}.`
    : null;
  const googleUrl = googleMapsDirections(place.geom.lat, place.geom.lng);
  const appleUrl = appleMapsDirections(place.geom.lat, place.geom.lng, place.name);
  const actions = actionsForPlace(place);
  const reserveActions = actions.filter((a) => a.category === "reserve");
  const orderActions = actions.filter((a) => a.category === "order");
  const parkActions = actions.filter((a) => a.category === "park");
  const socialActions = actions.filter((a) => a.category === "social");
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
    url: place.website,
    priceRange: place.price_band ? "$".repeat(place.price_band) : undefined,
  };

  return (
    <div className="space-y-6 reveal-up">
      {/* Records this slug into the device-local recent-places list
          so /my-radius can show "Recently viewed". Client island so
          the rest of the page stays a server component. */}
      <PlaceVisitTracker slug={place.slug} />
      {/* Breadcrumbs stay visually small, but each link carries an
          expanded (invisible) hit area to the 44px WCAG 2.5.5 target —
          py-3.5/-my-3.5 grows the TAP zone without moving the layout. */}
      <nav aria-label="Breadcrumb" className="text-xs">
        <ol className="flex items-center gap-1.5" style={{ color: "var(--app-ink-3)" }}>
          <li><Link href="/places" className="inline-block px-1 py-3.5 -mx-1 -my-3.5 hover:underline">Places</Link></li>
          {town && (
            <>
              <li aria-hidden>·</li>
              <li><Link href={`/m/${place.municipality}`} className="inline-block px-1 py-3.5 -mx-1 -my-3.5 hover:underline">{town.name}</Link></li>
            </>
          )}
          {cat && (
            <>
              <li aria-hidden>·</li>
              <li><Link href={`/category/${place.category}`} className="inline-block px-1 py-3.5 -mx-1 -my-3.5 hover:underline">{cat.name}</Link></li>
            </>
          )}
        </ol>
      </nav>

      <header className="overflow-hidden rounded-[var(--app-radius-xl)] tactile tactile-e2">
        <PlaceHero
          slug={place.slug}
          name={place.name}
          category={place.category}
          blurb={desc ?? undefined}
          aspectRatio="16/10"
          size="hero"
          priority
          photoSrc={place.google_photo_url}
        />
        <div className="space-y-3 bg-[var(--app-bg-elevated)] p-5">
          {/* Title row carries the place name + address only. Save
              lives in exactly one place — the prominent "Add to My
              Radius" CTA below — so the visitor sees a single save
              action, not an icon pair crowding the title. Sharing
              stays in the footer ShareButton. */}
          <div className="min-w-0">
            <h1 className="display-2 breathe-in" style={{ color: "var(--app-ink)" }}>
              {place.name}
            </h1>
            <p className="mt-1 text-sm" style={{ color: "var(--app-ink-3)" }}>
              {place.address} · {place.municipality_name}
            </p>
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
          <div className="-mt-1">
            <MyRadiusButton slug={place.slug} name={place.name} />
          </div>
          {desc && (
            <p className="text-[15px] leading-relaxed" style={{ color: "var(--app-ink-2)" }}>
              {desc}
            </p>
          )}
          {/* "What people say" — the distilled signal from public
              reviews: known_for chips + customers_loved items. Renders
              nothing when neither array is populated. Sits above the
              raw review snippet so the SCANNABLE answer comes before
              the paragraph quote. */}
          <KnownForCard
            knownFor={place.known_for}
            customersLoved={place.customers_loved}
          />
          {/* Park amenity rollup (shelters/fields/playgrounds/trails) from
              the county GIS — renders only for parks that have it. */}
          <ParkAmenitiesStrip slug={place.slug} />
          {/* Golf course facts (holes/par/access/designer) from curated
              course-info.json — renders only for golf courses. */}
          <CourseInfoStrip slug={place.slug} />
          {/* "Good to know" — surfaces the audience facet (kid/teen-friendly,
              wheelchair accessible, good for groups) + key feature tags
              (rainy-day, seasonal) that were shadow data. Self-hides when none. */}
          <PlaceAudienceTags tags={place.tags} />
          {/* Verified Field Notes (the moat) take precedence — happy hour /
              deals / parking / insider, each agent-confirmed at a cited
              source, with the FieldStamp seal. Falls back to the legacy
              business-info "Good to know" card when a place has no Field
              Notes yet. Both render nothing when empty. */}
          {hasFieldNotes(place.slug) ? (
            <FieldNotesCard slug={place.slug} />
          ) : (
            <BusinessExtrasCard info={businessInfoFor(place.slug)} />
          )}
          {/* The user's own margin notes for this place (on-device). */}
          <PlaceNoteCard slug={place.slug} />
          {place.review_snippet && (
            <figure
              className="border-l-2 pl-3"
              style={{ borderColor: "color-mix(in srgb, var(--app-cool) 45%, transparent)" }}
            >
              <blockquote className="text-[13px] italic leading-relaxed" style={{ color: "var(--app-ink-2)" }}>
                &ldquo;{place.review_snippet}&rdquo;
              </blockquote>
              <figcaption className="mt-1 text-[11px]" style={{ color: "var(--app-ink-3)" }}>
                {place.review_author ? `${place.review_author} · ` : ""}via Google reviews
              </figcaption>
            </figure>
          )}
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <OpenClosedDot status={place.open_status} />
            {place.price_band && (
              <span className="font-medium" style={{ color: "var(--app-ink-3)" }}>
                {"$".repeat(place.price_band)}
              </span>
            )}
            <SourceBadge place={place} size="md" />
            {/* Hours provenance moved into the HoursBlock details (passed as
                `provenance`) so the freshness label stays honest without
                crowding the open/closed decision zone in the header. */}
          </div>
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

      <div className="grid grid-cols-2 gap-2">
        <ActionButton href={appleUrl} icon={Apple} label="Apple Maps" external />
        <ActionButton href={googleUrl} icon={Navigation} label="Google Maps" external />
        {place.phone && <ActionButton href={`tel:${place.phone}`} icon={Phone} label="Call" />}
        {place.website && <ActionButton href={place.website} icon={Globe} label="Website" external />}
      </div>

      {/* Personal "been here" marker — demoted below the directional/contact
          grid; it's a quiet device-local note, not a primary action. */}
      <div className="flex">
        <BeenHereToggle placeSlug={place.slug} label={place.name} />
      </div>

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

      {reserveActions.length > 0 && (
        <IntegrationRow
          icon={Utensils}
          title="Reserve a table"
          actions={reserveActions}
        />
      )}

      {orderActions.length > 0 && (
        <IntegrationRow
          icon={ShoppingBag}
          title="Order online"
          actions={orderActions}
        />
      )}

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
      ) : null}

      <PlacePhotoGallery photos={place.google_photos ?? []} name={place.name} />

      <section className="space-y-2">
        <h2 className="eyebrow">
          Location
        </h2>
        <PlaceMiniMap lng={place.geom.lng} lat={place.geom.lat} color={cat?.color ?? "#A03A22"} />
        {/* "From above" — the nearest geotagged drone shot, when one
            genuinely covers this spot (downtown Frederick). Self-hides
            elsewhere so it never fakes an aerial of a place we don't have. */}
        <AerialBeat lat={place.geom.lat} lng={place.geom.lng} label={place.city || "Frederick"} />
        <div className="flex items-start gap-2 rounded-[var(--app-radius-md)] tactile bg-[var(--app-bg-elevated)] p-3 text-sm">
          <MapPin className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={1.75} style={{ color: "var(--app-ink-3)" }} aria-hidden />
          <div>
            <p style={{ color: "var(--app-ink)" }}>{place.address}</p>
            <p style={{ color: "var(--app-ink-3)" }}>{place.city}, {place.state} {place.postal_code}</p>
          </div>
        </div>
      </section>

      {/* The text-pill amenities section that used to live here was
          replaced by the Waze-style icon row directly under the
          primary action buttons. Same data source (place.amenities),
          one rendering, much faster to scan. */}

      {eventsAtThisVenue.length > 0 && (
        <section className="space-y-3">
          <h2 className="font-serif text-lg font-semibold tracking-tight" style={{ color: "var(--app-ink)" }}>
            Upcoming at {place.name}
          </h2>
          <ul className="space-y-2">
            {eventsAtThisVenue.map((e) => (
              <li key={`${e.slug}-${e.starts_at}`}><EventCard event={e} /></li>
            ))}
          </ul>
        </section>
      )}

      <section className="space-y-3">
        <h2 className="font-serif text-lg font-semibold tracking-tight" style={{ color: "var(--app-ink)" }}>
          Near here
        </h2>
        <ul className="space-y-2">
          {place.nearby_places.slice(0, 5).map((p) => (
            <li key={p.slug}><PlaceCard place={p} /></li>
          ))}
        </ul>
      </section>

      <footer className="space-y-2 pt-4">
        <PhotoCredit slug={place.slug} hasGooglePhoto={Boolean(place.google_photo_url)} />
        <p className="text-[11px]" style={{ color: "var(--app-ink-3)" }}>
          {/* User-facing provenance, not pipeline jargon — "Source: seed"
              means nothing to a reader (June-9 deep audit P2). */}
          Updated {place.updated_at} · Source:{" "}
          {SOURCE_LABEL[place.source] ?? place.source}
        </p>
        <div className="flex flex-wrap gap-3 text-xs">
          {cat && (
            <Link href={`/category/${place.category}`} style={{ color: "var(--app-brand-press)" }}>
              More {cat.name.toLowerCase()} →
            </Link>
          )}
          <a
            href={`mailto:hello@frederickradius.app?subject=Correction for ${place.name}`}
            style={{ color: "var(--app-ink-3)" }}
          >
            Report incorrect info
          </a>
          {/* Owner front door — deep-links a claim with the slug pre-attached;
              the claim -> manage -> post -> push flow is already built. */}
          <Link
            href={`/business/claim?place=${place.slug}`}
            style={{ color: "var(--app-ink-3)" }}
          >
            Claim this business
          </Link>
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
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      {/* BreadcrumbList (June-9 audit P2): mirrors the visible breadcrumb. */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(
            breadcrumbJsonLd([
              { name: "Places", path: "/places" },
              ...(town ? [{ name: town.name, path: `/m/${place.municipality}` }] : []),
              ...(cat ? [{ name: cat.name, path: `/category/${place.category}` }] : []),
              { name: place.name, path: `/places/${place.slug}` },
            ]),
          ),
        }}
      />
    </div>
  );
}

function ActionButton({
  href, icon: Icon, label, external,
}: { href: string; icon: typeof Phone; label: string; external?: boolean }) {
  const Comp = external ? "a" : Link;
  return (
    <Comp
      href={href}
      {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
      className="tactile tactile-interactive flex flex-col items-center justify-center gap-1.5 rounded-[var(--app-radius-md)] bg-[var(--app-bg-elevated)] py-3 text-xs font-medium"
      style={{ color: "var(--app-ink)" }}
    >
      <Icon className="h-5 w-5" strokeWidth={1.75} aria-hidden style={{ color: "var(--app-brand-press)" }} />
      {label}
    </Comp>
  );
}

function ClosureBanner({
  severity, title, body, placeName,
}: { severity: "permanent" | "temporary"; title: string; body: string; placeName: string }) {
  const bg = severity === "permanent" ? "var(--app-danger)" : "var(--app-warning)";
  return (
    <div
      role="alert"
      className="flex items-start gap-3 rounded-[var(--app-radius-lg)] p-4 text-white shadow-[var(--app-shadow-1)]"
      style={{ background: bg }}
    >
      <AlertCircle className="mt-0.5 h-5 w-5 shrink-0" strokeWidth={2} aria-hidden />
      <div className="min-w-0 flex-1">
        <p className="font-serif text-lg font-semibold leading-tight">{title}</p>
        <p className="mt-1 text-[13px] leading-relaxed opacity-95">{body}</p>
        <a
          href={`mailto:hello@frederickradius.app?subject=Closure status for ${placeName}`}
          className="mt-2 inline-block text-[12px] font-semibold underline underline-offset-2"
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
      <h2 className="eyebrow inline-flex items-center gap-1.5">
        <Icon className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden style={{ color: "var(--app-cool)" }} />
        {title}
      </h2>
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
