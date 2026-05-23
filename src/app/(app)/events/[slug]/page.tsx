import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { Calendar, MapPin, Navigation, Ticket, ExternalLink, Wine, Utensils, Music, Ban } from "lucide-react";
import { EVENTS } from "@/data/events";
import { getEventBySlug, formatEventWhen, seriesKey, seriesOccurrenceLabel, eventDateBlock, allUpcoming } from "@/lib/loaders/events";
import { getLiveCardEventBySlug } from "@/lib/loaders/liveEvents";
/**
 * Event detail resolves the hand-authored static seed first
 * (getEventBySlug over EVENT_BY_SLUG); on a miss it falls back to the
 * live feed by recomputed slug (getLiveCardEventBySlug), so a live or
 * aggregated event opened from the explorer, or via a shared link, gets
 * a real in-app page instead of a 404. Seed copy is trusted editorial
 * text. Live copy is the feed's own description, already HTML-stripped
 * and length-capped upstream at ingest, rendered as written; the
 * scraped-copy detector still belongs on the ingest path, not here. The
 * fallback is a category and venue line, used only if a description is
 * ever empty.
 */
function eventBlurb(e: {
  description?: string;
  category_name: string;
  venue_name: string;
}): string {
  const d = (e.description ?? "").trim();
  return d.length > 0 ? d : `${e.category_name} at ${e.venue_name}.`;
}
import { decoratePlace, publicPlaces, type PlaceCardData } from "@/lib/loaders/places";
import { CATEGORY_BY_SLUG } from "@/data/categories";
import PlaceCard from "@/components/place/PlaceCard";
import SaveButton from "@/components/saved/SaveButton";
import EventActions from "@/components/event/EventActions";
import EventCalendarButton from "@/components/event/EventCalendarButton";
import EventCard from "@/components/event/EventCard";
import TrustChip from "@/components/ui/TrustChip";
import FreshnessChip from "@/components/ui/FreshnessChip";
import { eventTrust } from "@/lib/trust";

export const revalidate = 300;

export async function generateStaticParams() {
  return EVENTS.map((e) => ({ slug: e.slug }));
}

export async function generateMetadata(
  { params }: { params: Promise<{ slug: string }> }
): Promise<Metadata> {
  const { slug } = await params;
  const event = getEventBySlug(slug) ?? (await getLiveCardEventBySlug(slug));
  if (!event) return { title: "Event not found" };
  const blurb = eventBlurb(event).slice(0, 160);
  return {
    title: event.title,
    description: blurb,
    openGraph: {
      title: event.title,
      description: blurb,
      type: "article",
      images: [{ url: `/api/og?type=event&slug=${slug}`, width: 1200, height: 630 }],
    },
  };
}

export default async function EventPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const seed = getEventBySlug(slug);
  const event = seed ?? (await getLiveCardEventBySlug(slug));
  if (!event) notFound();
  // Reliable live-vs-seed signal: whether the static seed resolved it.
  // event.source is NOT usable here (hand-authored seed events also use
  // "manual"). A live event has no static ICS endpoint and no editorial
  // extras, so the calendar cell and the third action adapt off this.
  const isLive = seed === null;

  const cat = CATEGORY_BY_SLUG[event.category];
  const desc = (event.description ?? "").trim();
  const directionsUrl = `https://www.google.com/maps/dir/?api=1&destination=${event.geom.lat},${event.geom.lng}`;
  const icsUrl = `/api/events/${event.slug}/ics`;

  const nearbyFood: PlaceCardData[] = publicPlaces()
    .filter((p) => ["restaurant", "coffee", "bar", "brewery", "bakery", "pizza"].includes(p.category))
    .map((p) => decoratePlace(p, event.geom))
    .filter((p) => (p.distance_m ?? Infinity) < 2000)
    .sort((a, b) => (a.distance_m ?? Infinity) - (b.distance_m ?? Infinity))
    .slice(0, 4);

  const nearbyParking: PlaceCardData[] = publicPlaces()
    .filter((p) => p.category === "parking")
    .map((p) => decoratePlace(p, event.geom))
    .sort((a, b) => (a.distance_m ?? Infinity) - (b.distance_m ?? Infinity))
    .slice(0, 3);

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Event",
    name: event.title,
    description: eventBlurb(event),
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
  // Lifecycle status — drives the cancellation banner + a dimmed hero.
  const eventStatus = event.status ?? "scheduled";
  // Server component: request-time clock is correct here, not impure render.
  // eslint-disable-next-line react-hooks/purity
  const nowMs = Date.now();
  const lineup = event.is_recurring
    ? EVENTS
        .filter((e) => seriesKey(e) === seriesKey(event))
        .sort((a, b) => +new Date(a.starts_at) - +new Date(b.starts_at))
    : [];

  // "More upcoming" — events the user is likely to want to see right
  // after this one. Same-venue future events come first (most useful
  // context: "what else is happening at this place?"); we fall back to
  // the next county-wide future events when the venue is quiet. The
  // current event and any siblings from its recurring series are
  // always excluded — series siblings are already covered by Full
  // lineup above. allUpcoming() handles past-filtering + decoration.
  const currentSeries = seriesKey(event);
  const upcomingPool = allUpcoming(new Date(nowMs)).filter(
    (e) => e.slug !== event.slug && seriesKey(e) !== currentSeries,
  );
  const venueKey = event.venue_place_slug ?? event.venue_name.toLowerCase();
  const sameVenueUpcoming = upcomingPool
    .filter((e) => {
      const k = e.venue_place_slug ?? e.venue_name.toLowerCase();
      return k === venueKey;
    })
    .slice(0, 4);
  const moreUpcoming =
    sameVenueUpcoming.length >= 2
      ? { title: `More at ${event.venue_name}`, items: sameVenueUpcoming }
      : { title: "More upcoming events", items: upcomingPool.slice(0, 6) };

  return (
    <div className="space-y-6">
      <nav aria-label="Breadcrumb" className="text-xs">
        <ol className="flex items-center gap-1.5" style={{ color: "var(--app-ink-3)" }}>
          <li><Link href="/events" className="hover:underline">Events</Link></li>
          <li aria-hidden>·</li>
          <li><Link href={`/m/${event.municipality}`} className="hover:underline">{event.municipality_name}</Link></li>
        </ol>
      </nav>

      {/* Cancellation banner — loud, above the hero, so a user who
       *  came here for this event sees it's off before anything else.
       *  Only renders when the event is not scheduled. */}
      {eventStatus !== "scheduled" && (
        <div
          className="flex items-center gap-2 rounded-[var(--app-radius-md)] px-4 py-2.5 text-[13px] font-semibold"
          style={{
            background: eventStatus === "cancelled"
              ? "color-mix(in srgb, var(--app-negative, #C0392B) 16%, var(--app-bg-elevated))"
              : "color-mix(in srgb, var(--app-warning, #B8860B) 16%, var(--app-bg-elevated))",
            color: eventStatus === "cancelled" ? "var(--app-negative, #C0392B)" : "var(--app-warning, #B8860B)",
            border: `1px solid ${eventStatus === "cancelled" ? "var(--app-negative, #C0392B)" : "var(--app-warning, #B8860B)"}`,
          }}
        >
          <Ban className="h-4 w-4 shrink-0" strokeWidth={2.25} aria-hidden />
          {eventStatus === "cancelled"
            ? "This event has been cancelled."
            : "This event has been postponed. Check the official page for a new date."}
        </div>
      )}

      {/* Cinematic hero. Two paths:
       *   - With hero_image: full-bleed 16:11 photo, dark legibility
       *     gradient, date pill + share/save floating on top, title +
       *     category eyebrow overlaid at the bottom. Same visual
       *     language as FeaturedTonight on /today.
       *   - Without hero_image: a richer category-tinted graphic hero
       *     with a watermark calendar glyph + a bigger title. Still
       *     reads as editorial, not as "missing image."
       * Shader-rim around the whole card for parity with the Today
       * editorial moments. */}
      <header
        className="shader-rim overflow-hidden rounded-[var(--app-radius-xl)] border"
        style={{
          borderColor: "var(--app-border)",
          opacity: eventStatus === "cancelled" ? 0.85 : 1,
        }}
      >
        {event.hero_image ? (
          <div className="relative h-64 w-full overflow-hidden sm:h-72">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={event.hero_image}
              alt=""
              className="absolute inset-0 h-full w-full object-cover"
              loading="eager"
            />
            {/* Legibility gradient — dark at bottom for the title, soft
             *  at top for the date pill. */}
            <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/30 to-black/10" />
            {/* Top row: date pill + action cluster */}
            <div className="absolute inset-x-0 top-0 flex items-start justify-between gap-3 p-4">
              <span
                className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.12em] text-white backdrop-blur"
                style={{ background: `${cat?.color ?? "#C4451C"}D0` }}
              >
                <Calendar className="h-3 w-3" strokeWidth={2.25} aria-hidden />
                {when}
              </span>
              <div className="flex shrink-0 items-center gap-1">
                <EventActions event={event} actions={["share"]} />
                <SaveButton refType="event" refId={event.slug} label={event.title} />
              </div>
            </div>
            {/* Bottom: category eyebrow + title */}
            <div className="absolute inset-x-0 bottom-0 p-5 text-white">
              <p className="text-[11px] font-medium uppercase tracking-[0.14em] opacity-85">
                {cat?.name ?? event.category}
              </p>
              <h1 className="mt-0.5 font-serif text-[26px] font-semibold leading-tight tracking-tight sm:text-[30px]">
                {event.title}
              </h1>
            </div>
          </div>
        ) : (
          <div
            className="relative h-56 overflow-hidden sm:h-60"
            style={{
              background: `linear-gradient(135deg, ${cat?.color ?? "#C4451C"}40, ${cat?.color ?? "#C4451C"}0F 60%, var(--app-bg-elevated))`,
            }}
          >
            {/* Watermark calendar — quietly anchors the right side. */}
            <Calendar
              className="pointer-events-none absolute -right-4 -top-2 h-44 w-44 opacity-15"
              strokeWidth={1}
              style={{ color: cat?.color ?? "var(--app-brand)" }}
              aria-hidden
            />
            {/* Top-right action cluster */}
            <div className="absolute right-3 top-3 z-10 flex shrink-0 items-center gap-1">
              <EventActions event={event} actions={["share"]} />
              <SaveButton refType="event" refId={event.slug} label={event.title} />
            </div>
            <div className="absolute inset-x-0 bottom-0 p-5">
              <p
                className="text-[11px] font-medium uppercase tracking-[0.14em]"
                style={{ color: cat?.color ?? "var(--app-brand)" }}
              >
                {cat?.name ?? event.category} · {when}
              </p>
              <h1
                className="mt-1 font-serif text-[26px] font-semibold leading-tight tracking-tight sm:text-[30px]"
                style={{ color: "var(--app-ink)" }}
              >
                {event.title}
              </h1>
            </div>
          </div>
        )}
        {/* Below-the-hero metadata strip: trust + description + venue/
         *  free/recurrence/organizer/freshness. */}
        <div className="space-y-3 bg-[var(--app-bg-elevated)] p-5">
          <TrustChip signal={eventTrust(event)} detail />
          {desc && (
            <p className="text-[15px] leading-relaxed" style={{ color: "var(--app-ink-2)" }}>
              {desc}
            </p>
          )}
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
            <FreshnessChip iso={event.last_verified_at} />
          </div>
        </div>
      </header>

      <div className="grid grid-cols-3 gap-2">
        {isLive ? (
          <EventCalendarButton
            event={{
              slug: event.slug,
              title: event.title,
              starts_at: event.starts_at,
              ends_at: event.ends_at,
              description: event.description,
              venue_name: event.venue_name,
              address: event.address,
              is_all_day: event.is_all_day,
            }}
          />
        ) : (
          <a
            href={icsUrl}
            download
            className="flex flex-col items-center justify-center gap-1.5 rounded-[var(--app-radius-md)] border bg-[var(--app-bg-elevated)] py-3 text-xs font-medium transition hover:bg-[var(--app-bg-sunken)]"
            style={{ borderColor: "var(--app-border)", color: "var(--app-ink)" }}
          >
            <Calendar className="h-5 w-5" strokeWidth={1.75} style={{ color: "var(--app-brand)" }} aria-hidden />
            Add to calendar
          </a>
        )}
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
            href={`/places/${event.venue_place_slug}`}
            className="flex flex-col items-center justify-center gap-1.5 rounded-[var(--app-radius-md)] border bg-[var(--app-bg-elevated)] py-3 text-xs font-medium transition hover:bg-[var(--app-bg-sunken)]"
            style={{ borderColor: "var(--app-border)", color: "var(--app-ink)" }}
          >
            <MapPin className="h-5 w-5" strokeWidth={1.75} style={{ color: "var(--app-brand)" }} aria-hidden />
            Venue page
          </Link>
        ) : event.source_url ? (
          <a
            href={event.source_url}
            target="_blank"
            rel="noopener noreferrer"
            className="flex flex-col items-center justify-center gap-1.5 rounded-[var(--app-radius-md)] border bg-[var(--app-bg-elevated)] py-3 text-xs font-medium transition hover:bg-[var(--app-bg-sunken)]"
            style={{ borderColor: "var(--app-border)", color: "var(--app-ink)" }}
          >
            <ExternalLink className="h-5 w-5" strokeWidth={1.75} style={{ color: "var(--app-brand)" }} aria-hidden />
            Official page
          </a>
        ) : (
          <div />
        )}
      </div>

      {event.info && (event.info.admission || event.info.drinks || event.info.food) && (
        <section className="space-y-2">
          <h2 className="font-serif text-lg font-semibold tracking-tight" style={{ color: "var(--app-ink)" }}>
            Good to know
          </h2>
          <ul
            className="divide-y rounded-[var(--app-radius-md)] border bg-[var(--app-bg-elevated)] px-3"
            style={{ borderColor: "var(--app-border)" }}
          >
            {event.info.admission && (
              <li className="flex items-start gap-3 py-2.5" style={{ borderColor: "var(--app-border)" }}>
                <Ticket className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={1.75} style={{ color: "var(--app-brand)" }} aria-hidden />
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: "var(--app-ink-3)" }}>Admission</p>
                  <p className="text-sm" style={{ color: "var(--app-ink-2)" }}>{event.info.admission}</p>
                </div>
              </li>
            )}
            {event.info.drinks && (
              <li className="flex items-start gap-3 py-2.5" style={{ borderColor: "var(--app-border)" }}>
                <Wine className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={1.75} style={{ color: "var(--app-brand)" }} aria-hidden />
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: "var(--app-ink-3)" }}>Drinks</p>
                  <p className="text-sm" style={{ color: "var(--app-ink-2)" }}>{event.info.drinks}</p>
                </div>
              </li>
            )}
            {/* Generic food-vendors blurb. Suppressed when a specific
                weekly truck lineup is present below — no point repeating
                "rotating vendors" right above the actual lineup. */}
            {event.info.food && !(event.food_trucks && event.food_trucks.length > 0) && (
              <li className="flex items-start gap-3 py-2.5" style={{ borderColor: "var(--app-border)" }}>
                <Utensils className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={1.75} style={{ color: "var(--app-brand)" }} aria-hidden />
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: "var(--app-ink-3)" }}>Food vendors</p>
                  <p className="text-sm" style={{ color: "var(--app-ink-2)" }}>{event.info.food}</p>
                </div>
              </li>
            )}
          </ul>
        </section>
      )}

      {/* Per-week food-truck lineup — currently used by Alive @ Five.
          Renders as chips when food_trucks is populated on the event.
          Hand-curated in src/data/events.ts (no live ingest yet). */}
      {event.food_trucks && event.food_trucks.length > 0 && (
        <section className="space-y-2">
          <h2
            className="inline-flex items-center gap-2 font-serif text-lg font-semibold tracking-tight"
            style={{ color: "var(--app-ink)" }}
          >
            <Utensils
              className="h-4 w-4"
              strokeWidth={2}
              style={{ color: "var(--app-brand)" }}
              aria-hidden
            />
            Food trucks this week
          </h2>
          <ul className="flex flex-wrap gap-1.5">
            {event.food_trucks.map((name) => (
              <li
                key={name}
                className="inline-flex items-center rounded-full border px-2.5 py-1 text-[12px] font-semibold"
                style={{
                  borderColor: "var(--app-border)",
                  background: "var(--app-bg-elevated)",
                  color: "var(--app-ink-2)",
                }}
              >
                {name}
              </li>
            ))}
          </ul>
        </section>
      )}

      {lineup.length > 1 && (
        <section className="space-y-3">
          <div className="flex items-baseline justify-between">
            <h2 className="inline-flex items-center gap-2 font-serif text-lg font-semibold tracking-tight" style={{ color: "var(--app-ink)" }}>
              <Music className="h-4 w-4" strokeWidth={2} style={{ color: "var(--app-brand)" }} aria-hidden />
              Full lineup
            </h2>
            <span className="text-xs" style={{ color: "var(--app-ink-3)" }}>{lineup.length} dates</span>
          </div>
          {event.recurrence_text && (
            <p className="-mt-1 text-xs" style={{ color: "var(--app-ink-3)" }}>{event.recurrence_text}</p>
          )}
          <ul className="space-y-1.5">
            {lineup.slice(0, 30).map((s) => {
              const db = eventDateBlock(s);
              const label = seriesOccurrenceLabel(s) ?? s.title;
              const isCurrent = s.slug === event.slug;
              const isPast = new Date(s.ends_at).getTime() < nowMs;
              const tag = /Opening Night/i.test(s.title)
                ? "Opening night"
                : /Season Finale/i.test(s.title)
                ? "Season finale"
                : null;
              const Inner = (
                <div
                  className="flex items-center gap-3 rounded-[var(--app-radius-md)] border px-3 py-2.5 transition"
                  style={{
                    borderColor: isCurrent ? (cat?.color ?? "var(--app-brand)") : "var(--app-border)",
                    background: isCurrent ? `${cat?.color ?? "#C4451C"}14` : "var(--app-bg-elevated)",
                    opacity: isPast && !isCurrent ? 0.5 : 1,
                  }}
                >
                  <div
                    className="flex h-12 w-12 shrink-0 flex-col items-center justify-center rounded-[var(--app-radius-md)] border"
                    style={{ borderColor: "var(--app-border)", background: "var(--app-bg-sunken)" }}
                    aria-hidden
                  >
                    <span className="text-[9px] font-bold uppercase tracking-wider" style={{ color: "var(--app-brand)" }}>{db.month}</span>
                    <span className="font-serif text-base font-semibold leading-none" style={{ color: "var(--app-ink)" }}>{db.day}</span>
                    <span className="text-[9px]" style={{ color: "var(--app-ink-3)" }}>{db.weekday}</span>
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold" style={{ color: "var(--app-ink)" }}>
                      {label}
                    </p>
                    <p className="flex flex-wrap items-center gap-x-2 text-xs" style={{ color: "var(--app-ink-3)" }}>
                      <span>{db.time} · {s.venue_name}</span>
                      {tag && (
                        <span className="rounded-full px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider" style={{ background: "var(--app-bg-sunken)", color: "var(--app-ink-3)" }}>
                          {tag}
                        </span>
                      )}
                      {isCurrent && (
                        <span className="rounded-full px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-white" style={{ background: cat?.color ?? "var(--app-brand)" }}>
                          You&apos;re here
                        </span>
                      )}
                      {isPast && !isCurrent && (
                        <span className="rounded-full px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider" style={{ background: "var(--app-bg-sunken)", color: "var(--app-ink-3)" }}>
                          Past
                        </span>
                      )}
                    </p>
                  </div>
                  {!isCurrent && (
                    <ExternalLink className="h-3.5 w-3.5 shrink-0" strokeWidth={1.75} style={{ color: "var(--app-ink-3)" }} aria-hidden />
                  )}
                </div>
              );
              return (
                <li key={s.slug}>
                  {isCurrent ? Inner : <Link href={`/events/${s.slug}`}>{Inner}</Link>}
                </li>
              );
            })}
          </ul>
          {lineup.length > 30 && (
            <p className="text-xs" style={{ color: "var(--app-ink-3)" }}>
              + {lineup.length - 30} more dates
            </p>
          )}
        </section>
      )}

      {/* More upcoming events — same-venue future when there are 2+,
          otherwise the next 6 county-wide. Sits below the Full lineup
          and primary "Good to know" content so the user has digested
          this event before being offered the next one. */}
      {moreUpcoming.items.length > 0 && (
        <section className="space-y-3">
          <div className="flex items-baseline justify-between gap-2">
            <h2
              className="inline-flex items-center gap-2 font-serif text-lg font-semibold tracking-tight"
              style={{ color: "var(--app-ink)" }}
            >
              <Calendar className="h-4 w-4" strokeWidth={2} style={{ color: "var(--app-brand)" }} aria-hidden />
              {moreUpcoming.title}
            </h2>
            <Link
              href="/events"
              className="text-[12px] font-semibold"
              style={{ color: "var(--app-brand)" }}
            >
              See all →
            </Link>
          </div>
          <ul className="space-y-2">
            {moreUpcoming.items.map((e) => (
              <li key={e.slug}>
                <EventCard event={e} variant="row" />
              </li>
            ))}
          </ul>
        </section>
      )}

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
