import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { Phone, Globe, MapPin, Navigation, Share2 } from "lucide-react";
import { PLACES } from "@/data/places";
import { getPlaceBySlug } from "@/lib/loaders/places";
import { formatDistance } from "@/lib/geo";
import OpenClosedDot from "@/components/place/OpenClosedDot";
import HoursBlock from "@/components/place/HoursBlock";
import PlaceCard from "@/components/place/PlaceCard";
import EventCard from "@/components/event/EventCard";
import SaveButton from "@/components/saved/SaveButton";
import { CATEGORY_BY_SLUG } from "@/data/categories";

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
  return {
    title: place.name,
    description: place.short_blurb,
    openGraph: {
      title: place.name,
      description: place.short_blurb,
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
  const directionsUrl = `https://www.google.com/maps/dir/?api=1&destination=${place.geom.lat},${place.geom.lng}`;
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
    description: place.description ?? place.short_blurb,
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
    <div className="space-y-6">
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

      <header
        className="overflow-hidden rounded-[var(--app-radius-xl)] border"
        style={{ borderColor: "var(--app-border)" }}
      >
        <div
          className="flex items-center justify-center px-6 py-12"
          style={{ background: `linear-gradient(135deg, ${cat?.color ?? "#C4451C"}26, ${cat?.color ?? "#C4451C"}10)` }}
        >
          <span className="text-7xl">
            <CategoryEmoji slug={place.category} />
          </span>
        </div>
        <div className="space-y-3 bg-[var(--app-bg-elevated)] p-5">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[11px] font-medium uppercase tracking-[0.1em]" style={{ color: cat?.color ?? "var(--app-brand)" }}>
                {cat?.name ?? place.category}
              </p>
              <h1 className="mt-0.5 font-serif text-[26px] font-semibold leading-tight tracking-tight" style={{ color: "var(--app-ink)" }}>
                {place.name}
              </h1>
            </div>
            <SaveButton refType="place" refId={place.slug} label={place.name} />
          </div>
          <p className="text-[15px] leading-relaxed" style={{ color: "var(--app-ink-2)" }}>
            {place.description ?? place.short_blurb}
          </p>
          <div className="flex items-center gap-3 text-xs">
            <OpenClosedDot status={place.open_status} />
            {place.price_band && (
              <span className="font-medium" style={{ color: "var(--app-ink-3)" }}>
                {"$".repeat(place.price_band)}
              </span>
            )}
            {place.is_verified && (
              <span
                className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide"
                style={{ background: `${"#1E6B3A"}14`, color: "var(--app-positive)" }}
              >
                Verified
              </span>
            )}
          </div>
        </div>
      </header>

      <div className="grid grid-cols-3 gap-2">
        <ActionButton href={directionsUrl} icon={Navigation} label="Directions" external />
        {place.phone && <ActionButton href={`tel:${place.phone}`} icon={Phone} label="Call" />}
        {place.website && <ActionButton href={place.website} icon={Globe} label="Website" external />}
      </div>

      <HoursBlock hours={place.hours} />

      <section className="space-y-2">
        <h2 className="text-xs font-medium uppercase tracking-[0.08em]" style={{ color: "var(--app-ink-3)" }}>
          Address
        </h2>
        <div className="flex items-start gap-2 rounded-[var(--app-radius-md)] border bg-[var(--app-bg-elevated)] p-3 text-sm"
             style={{ borderColor: "var(--app-border)" }}>
          <MapPin className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={1.75} style={{ color: "var(--app-ink-3)" }} aria-hidden />
          <div>
            <p style={{ color: "var(--app-ink)" }}>{place.address}</p>
            <p style={{ color: "var(--app-ink-3)" }}>{place.city}, {place.state} {place.postal_code}</p>
          </div>
        </div>
      </section>

      {place.amenities && place.amenities.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-xs font-medium uppercase tracking-[0.08em]" style={{ color: "var(--app-ink-3)" }}>
            Amenities
          </h2>
          <ul className="flex flex-wrap gap-1.5">
            {place.amenities.map((a) => (
              <li key={a}>
                <span
                  className="inline-block rounded-full border px-2.5 py-1 text-xs"
                  style={{ borderColor: "var(--app-border)", color: "var(--app-ink-2)" }}
                >
                  {prettyAmenity(a)}
                </span>
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
        <p className="text-[11px]" style={{ color: "var(--app-ink-3)" }}>
          Updated {place.updated_at} · Source: {place.source}
        </p>
        <div className="flex gap-3 text-xs">
          <Link href={`/category/${place.category}`} style={{ color: "var(--app-brand)" }}>
            More {cat?.name?.toLowerCase() ?? "places"} →
          </Link>
          <button
            className="inline-flex items-center gap-1"
            style={{ color: "var(--app-ink-3)" }}
            type="button"
          >
            <Share2 className="h-3.5 w-3.5" aria-hidden /> Share
          </button>
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
      className="flex flex-col items-center justify-center gap-1.5 rounded-[var(--app-radius-md)] border bg-[var(--app-bg-elevated)] py-3 text-xs font-medium transition hover:bg-[var(--app-bg-sunken)]"
      style={{ borderColor: "var(--app-border)", color: "var(--app-ink)" }}
    >
      <Icon className="h-5 w-5" strokeWidth={1.75} aria-hidden style={{ color: "var(--app-brand)" }} />
      {label}
    </Comp>
  );
}

function CategoryEmoji({ slug }: { slug: string }) {
  const map: Record<string, string> = {
    coffee: "☕", restaurant: "🍽", brewery: "🍺", bar: "🍸", bakery: "🥐",
    pizza: "🍕", park: "🌳", trail: "⛰", museum: "🏛", gallery: "🎨",
    theater: "🎭", music: "🎵", library: "📚", market: "🛒", antiques: "🪑",
    yoga: "🧘", lodging: "🏨", parking: "🅿️",
  };
  return <>{map[slug] ?? "📍"}</>;
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
