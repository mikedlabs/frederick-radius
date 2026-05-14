import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { Calendar, MapPin, Navigation, Ticket, ExternalLink } from "lucide-react";
import { EVENTS } from "@/data/events";
import { getEventBySlug, formatEventWhen } from "@/lib/loaders/events";
import { decoratePlace, type PlaceCardData } from "@/lib/loaders/places";
import { PLACES } from "@/data/places";
import { CATEGORY_BY_SLUG } from "@/data/categories";
import PlaceCard from "@/components/place/PlaceCard";
import SaveButton from "@/components/saved/SaveButton";

export const revalidate = 300;

export async function generateStaticParams() {
  return EVENTS.map((e) => ({ slug: e.slug }));
}

export async function generateMetadata(
  { params }: { params: Promise<{ slug: string }> }
): Promise<Metadata> {
  const { slug } = await params;
  const event = getEventBySlug(slug);
  if (!event) return { title: "Event not found" };
  return {
    title: event.title,
    description: event.description.slice(0, 160),
    openGraph: {
      title: event.title,
      description: event.description.slice(0, 160),
      type: "article",
      images: [{ url: `/api/og?type=event&slug=${slug}`, width: 1200, height: 630 }],
    },
  };
}

export default async function EventPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const event = getEventBySlug(slug);
  if (!event) notFound();

  const cat = CATEGORY_BY_SLUG[event.category];
  const directionsUrl = `https://www.google.com/maps/dir/?api=1&destination=${event.geom.lat},${event.geom.lng}`;
  const icsUrl = `/api/events/${event.slug}/ics`;

  const nearbyFood: PlaceCardData[] = PLACES
    .filter((p) => ["restaurant", "coffee", "bar", "brewery", "bakery", "pizza"].includes(p.category))
    .map((p) => decoratePlace(p, event.geom))
    .filter((p) => (p.distance_m ?? Infinity) < 2000)
    .sort((a, b) => (a.distance_m ?? Infinity) - (b.distance_m ?? Infinity))
    .slice(0, 4);

  const nearbyParking: PlaceCardData[] = PLACES
    .filter((p) => p.category === "parking")
    .map((p) => decoratePlace(p, event.geom))
    .sort((a, b) => (a.distance_m ?? Infinity) - (b.distance_m ?? Infinity))
    .slice(0, 3);

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Event",
    name: event.title,
    description: event.description,
    startDate: event.starts_at,
    endDate: event.ends_at,
    eventStatus: "https://schema.org/EventScheduled",
    eventAttendanceMode: "https://schema.org/OfflineEventAttendanceMode",
    location: {
      "@type": "Place",
      name: event.venue_name,
      address: event.address,
      geo: { "@type": "GeoCoordinates", latitude: event.geom.lat, longitude: event.geom.lng },
    },
    organizer: event.organizer ? { "@type": "Organization", name: event.organizer } : undefined,
    isAccessibleForFree: event.is_free,
    offers: event.is_free
      ? { "@type": "Offer", price: "0", priceCurrency: "USD", availability: "https://schema.org/InStock" }
      : event.ticket_url ? { "@type": "Offer", url: event.ticket_url, availability: "https://schema.org/InStock" } : undefined,
  };

  const when = formatEventWhen(event);

  return (
    <div className="space-y-6">
      <nav aria-label="Breadcrumb" className="text-xs">
        <ol className="flex items-center gap-1.5" style={{ color: "var(--app-ink-3)" }}>
          <li><Link href="/app/events" className="hover:underline">Events</Link></li>
          <li aria-hidden>·</li>
          <li><Link href={`/app/m/${event.municipality}`} className="hover:underline">{event.municipality_name}</Link></li>
        </ol>
      </nav>

      <header
        className="overflow-hidden rounded-[var(--app-radius-xl)] border"
        style={{ borderColor: "var(--app-border)" }}
      >
        <div
          className="flex items-center gap-4 px-6 py-8"
          style={{ background: `linear-gradient(135deg, ${cat?.color ?? "#C4451C"}26, ${cat?.color ?? "#C4451C"}10)` }}
        >
          <Calendar className="h-10 w-10" strokeWidth={1.5} style={{ color: cat?.color ?? "var(--app-brand)" }} aria-hidden />
          <p className="font-serif text-lg font-semibold leading-snug" style={{ color: "var(--app-ink)" }}>
            {when}
          </p>
        </div>
        <div className="space-y-3 bg-[var(--app-bg-elevated)] p-5">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[11px] font-medium uppercase tracking-[0.1em]" style={{ color: cat?.color ?? "var(--app-brand)" }}>
                {cat?.name ?? event.category}
              </p>
              <h1 className="mt-0.5 font-serif text-[24px] font-semibold leading-tight tracking-tight" style={{ color: "var(--app-ink)" }}>
                {event.title}
              </h1>
            </div>
            <SaveButton refType="event" refId={event.slug} label={event.title} />
          </div>
          <p className="text-[15px] leading-relaxed" style={{ color: "var(--app-ink-2)" }}>
            {event.description}
          </p>
          <div className="flex flex-wrap items-center gap-3 text-xs" style={{ color: "var(--app-ink-3)" }}>
            <span className="inline-flex items-center gap-1">
              <MapPin className="h-3.5 w-3.5" aria-hidden /> {event.venue_name}
            </span>
            {event.is_free ? (
              <span className="font-medium" style={{ color: "var(--app-positive)" }}>Free</span>
            ) : event.price_text && (
              <span>{event.price_text}</span>
            )}
            {event.is_recurring && event.recurrence_text && (
              <span className="rounded-full bg-[var(--app-bg-sunken)] px-2 py-0.5 text-[11px]">
                {event.recurrence_text}
              </span>
            )}
            {event.organizer && (
              <span>by {event.organizer}</span>
            )}
          </div>
        </div>
      </header>

      <div className="grid grid-cols-3 gap-2">
        <a
          href={icsUrl}
          download
          className="flex flex-col items-center justify-center gap-1.5 rounded-[var(--app-radius-md)] border bg-[var(--app-bg-elevated)] py-3 text-xs font-medium transition hover:bg-[var(--app-bg-sunken)]"
          style={{ borderColor: "var(--app-border)", color: "var(--app-ink)" }}
        >
          <Calendar className="h-5 w-5" strokeWidth={1.75} style={{ color: "var(--app-brand)" }} aria-hidden />
          Add to calendar
        </a>
        <a
          href={directionsUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="flex flex-col items-center justify-center gap-1.5 rounded-[var(--app-radius-md)] border bg-[var(--app-bg-elevated)] py-3 text-xs font-medium transition hover:bg-[var(--app-bg-sunken)]"
          style={{ borderColor: "var(--app-border)", color: "var(--app-ink)" }}
        >
          <Navigation className="h-5 w-5" strokeWidth={1.75} style={{ color: "var(--app-brand)" }} aria-hidden />
          Directions
        </a>
        {event.ticket_url ? (
          <a
            href={event.ticket_url}
            target="_blank"
            rel="noopener noreferrer"
            className="flex flex-col items-center justify-center gap-1.5 rounded-[var(--app-radius-md)] border bg-[var(--app-bg-elevated)] py-3 text-xs font-medium transition hover:bg-[var(--app-bg-sunken)]"
            style={{ borderColor: "var(--app-border)", color: "var(--app-ink)" }}
          >
            <Ticket className="h-5 w-5" strokeWidth={1.75} style={{ color: "var(--app-brand)" }} aria-hidden />
            Tickets
          </a>
        ) : event.rsvp_url ? (
          <a
            href={event.rsvp_url}
            target="_blank"
            rel="noopener noreferrer"
            className="flex flex-col items-center justify-center gap-1.5 rounded-[var(--app-radius-md)] border bg-[var(--app-bg-elevated)] py-3 text-xs font-medium transition hover:bg-[var(--app-bg-sunken)]"
            style={{ borderColor: "var(--app-border)", color: "var(--app-ink)" }}
          >
            <ExternalLink className="h-5 w-5" strokeWidth={1.75} style={{ color: "var(--app-brand)" }} aria-hidden />
            RSVP
          </a>
        ) : event.venue_place_slug ? (
          <Link
            href={`/app/places/${event.venue_place_slug}`}
            className="flex flex-col items-center justify-center gap-1.5 rounded-[var(--app-radius-md)] border bg-[var(--app-bg-elevated)] py-3 text-xs font-medium transition hover:bg-[var(--app-bg-sunken)]"
            style={{ borderColor: "var(--app-border)", color: "var(--app-ink)" }}
          >
            <MapPin className="h-5 w-5" strokeWidth={1.75} style={{ color: "var(--app-brand)" }} aria-hidden />
            Venue page
          </Link>
        ) : (
          <div />
        )}
      </div>

      {nearbyFood.length > 0 && (
        <section className="space-y-3">
          <h2 className="font-serif text-lg font-semibold tracking-tight" style={{ color: "var(--app-ink)" }}>
            Eat & drink before
          </h2>
          <ul className="space-y-2">
            {nearbyFood.map((p) => (
              <li key={p.slug}><PlaceCard place={p} /></li>
            ))}
          </ul>
        </section>
      )}

      {nearbyParking.length > 0 && (
        <section className="space-y-3">
          <h2 className="font-serif text-lg font-semibold tracking-tight" style={{ color: "var(--app-ink)" }}>
            Parking nearby
          </h2>
          <ul className="space-y-2">
            {nearbyParking.map((p) => (
              <li key={p.slug}><PlaceCard place={p} compact /></li>
            ))}
          </ul>
        </section>
      )}

      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
    </div>
  );
}
