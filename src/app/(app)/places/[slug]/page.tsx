import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { Phone, Globe, MapPin, Navigation, Apple, AlertCircle, Utensils, ShoppingBag, Car, Instagram, ExternalLink } from "lucide-react";
import Image from "next/image";
import { PAPER_CREAM_BLUR } from "@/lib/blur-placeholder";
import ShareButton from "@/components/place/ShareButton";
import { PLACES } from "@/data/places";
import { getPlaceBySlug } from "@/lib/loaders/places";
import { googleMapsDirections, appleMapsDirections, actionsForPlace } from "@/lib/integrations/deeplinks";
import OpenClosedDot from "@/components/place/OpenClosedDot";
import HoursBlock from "@/components/place/HoursBlock";
import GoogleHours from "@/components/place/GoogleHours";
import PlaceCard from "@/components/place/PlaceCard";
import EventCard from "@/components/event/EventCard";
import SaveButton from "@/components/saved/SaveButton";
import FollowButton from "@/components/place/FollowButton";
import PlaceHero, { PhotoCredit } from "@/components/place/PlaceHero";
import PlaceMiniMap from "@/components/place/PlaceMiniMap";
import BeenHereToggle from "@/components/place/BeenHereToggle";
import { CATEGORY_BY_SLUG } from "@/data/categories";
import { classifyDescription } from "@/lib/copy-quality";
import { Chip } from "@/components/ui/Chip";
import { Button } from "@/components/ui/Button";
import SourceBadge from "@/components/place/SourceBadge";

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

export const revalidate = 300;

export async function generateStaticParams() {
  return PLACES.map((p) => ({ slug: p.slug }));
}

export async function generateMetadata(
  { params }: { params: Promise<{ slug: string }> }
): Promise<Metadata> {
  const { slug } = await params;
  const place = getPlaceBySlug(slug);
  if (!place) return { title: "Place not found" };
  const blurb = safeBlurb(place);
  return {
    title: place.name,
    description: blurb,
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
  const desc = cleanCopy(place.name, place.description ?? place.short_blurb);
  const hoursConfirmed = place.hours_source
    ? `Hours from ${HOURS_SOURCE_LABEL[place.hours_source] ?? place.hours_source}, confirmed ${confirmedAgo(place.hours_updated_at) ?? "recently"}.`
    : null;
  const googleUrl = googleMapsDirections(place.geom.lat, place.geom.lng, place.name);
  const appleUrl = appleMapsDirections(place.geom.lat, place.geom.lng, place.name);
  const actions = actionsForPlace(place);
  const reserveActions = actions.filter((a) => a.category === "reserve");
  const orderActions = actions.filter((a) => a.category === "order");
  const parkActions = actions.filter((a) => a.category === "park");
  const socialActions = actions.filter((a) => a.category === "social");
  const eventsAtThisVenue = place.upcoming_events.map((e) => ({
    ...e,
    distance_m: undefined,
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
    <div className="space-y-6 stagger">
      <nav aria-label="Breadcrumb" className="text-xs">
        <ol className="flex items-center gap-1.5" style={{ color: "var(--app-ink-3)" }}>
          <li><Link href="/" className="hover:underline">Today</Link></li>
          <li aria-hidden>·</li>
          <li><Link href={`/m/${place.municipality}`} className="hover:underline">{place.municipality_name}</Link></li>
          {cat && (
            <>
              <li aria-hidden>·</li>
              <li><Link href={`/category/${place.category}`} className="hover:underline">{cat.name}</Link></li>
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
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h1 className="display-2" style={{ color: "var(--app-ink)" }}>
                {place.name}
              </h1>
              <p className="mt-1 text-sm" style={{ color: "var(--app-ink-3)" }}>
                {place.address} · {place.municipality_name}
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <FollowButton slug={place.slug} name={place.name} />
              <SaveButton refType="place" refId={place.slug} label={place.name} />
            </div>
          </div>
          {desc && (
            <p className="text-[15px] leading-relaxed" style={{ color: "var(--app-ink-2)" }}>
              {desc}
            </p>
          )}
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
            {hoursConfirmed && (
              <span
                className="ml-auto text-[10px] font-medium"
                style={{ color: "var(--app-ink-3)" }}
                title="Hours provenance and freshness"
              >
                {hoursConfirmed}
              </span>
            )}
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

      <div className="flex">
        <BeenHereToggle placeSlug={place.slug} label={place.name} />
      </div>

      <div className="grid grid-cols-2 gap-2">
        <ActionButton href={appleUrl} icon={Apple} label="Apple Maps" external />
        <ActionButton href={googleUrl} icon={Navigation} label="Google Maps" external />
        {place.phone && <ActionButton href={`tel:${place.phone}`} icon={Phone} label="Call" />}
        {place.website && <ActionButton href={place.website} icon={Globe} label="Website" external />}
      </div>

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
        <HoursBlock hours={place.hours} verified={place.hours_verified ?? false} />
      ) : place.google_hours && place.google_hours.length > 0 ? (
        <GoogleHours lines={place.google_hours} />
      ) : null}

      {place.google_photos && place.google_photos.length > 1 && (
        <section className="space-y-2">
          <h2 className="eyebrow">
            Photos
          </h2>
          <div className="shelf-rail -mx-1 gap-2 px-1 pb-1">
            {place.google_photos.slice(1, 8).map((url, i) => (
              <div
                key={i}
                className="relative h-28 w-40 shrink-0 overflow-hidden rounded-[var(--app-radius-md)] border"
                style={{ borderColor: "var(--app-border)" }}
              >
                <Image
                  src={url}
                  alt={`${place.name} photo ${i + 2}`}
                  fill
                  loading="lazy"
                  sizes="160px"
                  placeholder="blur"
                  blurDataURL={PAPER_CREAM_BLUR}
                  className="object-cover"
                />
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="space-y-2">
        <h2 className="eyebrow">
          Location
        </h2>
        <PlaceMiniMap lng={place.geom.lng} lat={place.geom.lat} color={cat?.color ?? "#A8462C"} />
        <div className="flex items-start gap-2 rounded-[var(--app-radius-md)] tactile bg-[var(--app-bg-elevated)] p-3 text-sm">
          <MapPin className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={1.75} style={{ color: "var(--app-ink-3)" }} aria-hidden />
          <div>
            <p style={{ color: "var(--app-ink)" }}>{place.address}</p>
            <p style={{ color: "var(--app-ink-3)" }}>{place.city}, {place.state} {place.postal_code}</p>
          </div>
        </div>
      </section>

      {place.amenities && place.amenities.length > 0 && (
        <section className="space-y-2">
          <h2 className="eyebrow">
            Amenities
          </h2>
          <ul className="flex flex-wrap gap-1.5">
            {place.amenities.map((a) => (
              <li key={a}>
                <Chip tone="neutral" className="px-2.5 py-1 text-xs">
                  {prettyAmenity(a)}
                </Chip>
              </li>
            ))}
          </ul>
        </section>
      )}

      {eventsAtThisVenue.length > 0 && (
        <section className="space-y-3">
          <h2 className="font-serif text-lg font-semibold tracking-tight" style={{ color: "var(--app-ink)" }}>
            Upcoming at {place.name}
          </h2>
          <ul className="space-y-2">
            {eventsAtThisVenue.map((e) => (
              <li key={e.slug}><EventCard event={e} /></li>
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
        <PhotoCredit category={place.category} slug={place.slug} hasGooglePhoto={Boolean(place.google_photo_url)} />
        <p className="text-[11px]" style={{ color: "var(--app-ink-3)" }}>
          Updated {place.updated_at} · Source: {place.source}
        </p>
        <div className="flex flex-wrap gap-3 text-xs">
          <Link href={`/category/${place.category}`} style={{ color: "var(--app-brand)" }}>
            More {cat?.name?.toLowerCase() ?? "places"} →
          </Link>
          <a
            href={`mailto:hello@frederickradius.app?subject=Correction for ${place.name}`}
            style={{ color: "var(--app-ink-3)" }}
          >
            Report incorrect info
          </a>
          <ShareButton
            title={place.name}
            text={safeBlurb(place)}
            url={`/places/${place.slug}`}
          />
        </div>
      </footer>

      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
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
      <Icon className="h-5 w-5" strokeWidth={1.75} aria-hidden style={{ color: "var(--app-brand)" }} />
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

function prettyAmenity(slug: string): string {
  const map: Record<string, string> = {
    "wifi": "Free WiFi",
    "outdoor-seating": "Outdoor seating",
    "dog-friendly": "Dog friendly",
    "parking-lot": "Parking lot",
    "bike-rack": "Bike parking",
    "restroom": "Restroom",
    "patio": "Patio",
    "live-music": "Live music",
    "takeout": "Takeout",
    "delivery": "Delivery",
    "reservations": "Reservations",
    "byob": "BYOB",
    "accessible": "Wheelchair accessible",
  };
  return map[slug] ?? slug.replace(/-/g, " ");
}
