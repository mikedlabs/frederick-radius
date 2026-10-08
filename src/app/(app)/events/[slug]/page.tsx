import { Suspense } from "react";
import MapReturnLink from "@/components/place/MapReturnLink";
import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { unstable_noStore as noStore } from "next/cache";
import Link from "next/link";
import { Accessibility, AlertTriangle, ArrowLeft, ArrowRight, Ban, Calendar, CarFront, ChevronDown, Clock, ExternalLink, MapPin, Music, Navigation, Ticket, Utensils, Wine } from "lucide-react";
import { PAPER_CREAM_BLUR } from "@/lib/blur-placeholder";
import { EVENTS } from "@/data/events";
import { seriesOccurrenceLabel, eventDateBlock } from "@/lib/loaders/events";
import {
  isOperationalEventResolutionError,
  resolveEventMetadataBySlug,
  resolveEventPageBySlug,
  type ResolvedEventPage,
} from "@/lib/loaders/eventResolver";
import EventLookupRecovery from "@/components/event/EventLookupRecovery";
import * as Sentry from "@sentry/nextjs";
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
  municipality_name?: string;
}): string {
  const d = (e.description ?? "").trim();
  if (d.length > 0) return d;
  // A venue-less row must not produce the broken "Music at ." — fall to
  // the town, then to the bare category.
  const venue = (e.venue_name ?? "").trim();
  if (venue) return `${e.category_name} at ${venue}.`;
  const town = (e.municipality_name ?? "").trim();
  return town ? `${e.category_name} in ${town}.` : `${e.category_name}.`;
}
import { CATEGORY_BY_SLUG } from "@/data/categories";
import PlaceCard from "@/components/place/PlaceCard";
import SaveButton from "@/components/saved/SaveButton";
import EventActions from "@/components/event/EventActions";
import EventVisualCredit from "@/components/event/EventVisualCredit";
import EventSourceLink from "@/components/event/EventSourceLink";
import { eventCardVisual, eventVisualTreatment } from "@/components/event/eventVisuals";
import {
  eventDesktopActionClass,
  eventDesktopActionStyle,
  eventMobilePrimaryAction,
} from "@/components/event/eventActionBar";
import {
  eventDateHeroPlates,
  eventDetailTimeCaution,
  eventGlanceGettingIn,
  eventGlanceParking,
  eventGlanceWhen,
  eventGuideMoment,
  eventMapCaption,
} from "@/components/event/eventDetailFacts";
import DatePlate from "@/components/event/DatePlate";
import GlanceTiles, { type GlanceTile } from "@/components/ui/GlanceTiles";
import {
  PlacePhotoScope,
  PlacePhotoScopeImage,
  PlacePhotoWhen,
} from "@/components/place/PlacePhotoState";
import { fieldNotesFor } from "@/lib/loaders/fieldNotes";
import GettingThere from "@/components/event/GettingThere";
import { momentForEventSlug } from "@/data/civic-moments";
import { momentSectionId } from "@/components/moment/momentGuide";
import VenueMiniMap from "@/components/event/VenueMiniMap";
import { eventSaveCount } from "@/lib/loaders/eventSaves";
import type { EventWithMeta } from "@/lib/loaders/events";
import { eventHasPreciseLocation } from "@/lib/events/geo-confidence";
import { clientPlaceBySlug } from "@/lib/loaders/places-client";
import EventCalendarButton from "@/components/event/EventCalendarButton";
import { MobileActionBar, MobileBarLink } from "@/components/ui/MobileActionBar";
import EventCard from "@/components/event/EventCard";
import EventSmartPairings from "@/components/event/EventSmartPairings";
import TrustChip from "@/components/ui/TrustChip";
import FreshnessChip from "@/components/ui/FreshnessChip";
import { eventFreshnessBasis, eventTrust } from "@/lib/trust";
import { easternOffsetIso, jsonLdScript } from "@/lib/seo/jsonld";
import { noticeForEvent } from "@/lib/events/notices";
import {
  eventAttendanceMode,
  eventOnlineActionUrl,
  hasPhysicalAttendance,
} from "@/lib/events/attendance";
import { communicationAccessLabels } from "@/lib/events/communication-access";
import { loadEventNearbyPlaces } from "@/lib/loaders/eventNearbyPlaces";
import { loadRelatedEventSections } from "@/lib/loaders/eventRelated";
import { eventHasTrustworthyEnd } from "@/lib/events/format";
import { isEventListingEnded } from "@/lib/eventHorizon";
import { MUNICIPALITY_BY_SLUG } from "@/data/municipalities";
import { nearestEventParking } from "@/lib/events/parking";
import { eventDecisionLocation, eventTimeCaution } from "@/lib/events/decision-facts";
import { isDateOnlyEventAnchor } from "@/lib/eventWhenLabel";
import { eventPlanEligibility } from "@/lib/plan/event-plan-eligibility";
import { withBrowseReturnTo } from "@/lib/browse-return";

function splitDescription(text: string, limit = 300): { preview: string; rest: string } {
  if (text.length <= limit) return { preview: text, rest: "" };
  const sentenceEnd = text.lastIndexOf(". ", limit);
  const wordEnd = text.lastIndexOf(" ", limit);
  const cut = sentenceEnd >= Math.floor(limit * 0.55) ? sentenceEnd + 1 : Math.max(wordEnd, limit);
  return { preview: text.slice(0, cut).trim(), rest: text.slice(cut).trim() };
}

function SeriesDateRow({
  event,
  nowMs,
}: {
  event: EventWithMeta;
  nowMs: number;
}) {
  const date = eventDateBlock(event);
  const label = seriesOccurrenceLabel(event) ?? event.title;
  const isPast = new Date(event.ends_at).getTime() < nowMs;
  const tag = /Opening Night/i.test(event.title)
    ? "Opening night"
    : /Season Finale/i.test(event.title)
      ? "Season finale"
      : null;

  return (
    <Link
      href={`/events/${event.slug}`}
      className="tap-44 flex items-center gap-3 border-b py-2.5 transition hover:bg-[var(--app-bg-sunken)]"
      style={{ borderColor: "var(--app-border)", opacity: isPast ? 0.55 : 1 }}
    >
      <span className="w-11 shrink-0 text-center" aria-hidden>
        <span className="block text-[10px] font-bold uppercase tracking-wider" style={{ color: "var(--app-ink-2)" }}>{date.month}</span>
        <span className="block font-serif text-lg font-semibold leading-none" style={{ color: "var(--app-ink)" }}>{date.day}</span>
        <span className="block text-[10px]" style={{ color: "var(--app-ink-3)" }}>{date.weekday}</span>
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-semibold" style={{ color: "var(--app-ink)" }}>{label}</span>
        <span className="block truncate text-xs" style={{ color: "var(--app-ink-3)" }}>
          {date.time} · {event.venue_name}
          {tag ? ` · ${tag}` : ""}
          {isPast ? " · Past" : ""}
        </span>
      </span>
      <ArrowRight className="h-3.5 w-3.5 shrink-0" strokeWidth={2} style={{ color: "var(--app-ink-3)" }} aria-hidden />
    </Link>
  );
}

// Event slugs are an open set and a provider outage has a first-class recovery
// response. Keep the segment request-rendered so the conditional noStore()
// below runs in request scope. During on-demand ISR generation, Next 16 turns
// that same call into a DYNAMIC_SERVER_USAGE bailout and sends a 500 instead
// of the recovery UI. The resolver's provider fetches and durable archive are
// still cached independently, so this does not rebuild every upstream source.
export const dynamic = "force-dynamic";
// NOTE: this segment deliberately has NO loading.tsx. With a loading boundary,
// Next 16 can stream HTTP 200 for ANY slug before notFound() runs, which indexed
// dead event URLs as soft 404s (June-9 deep audit P0-2). Blocking render keeps
// true misses as honest 404 responses.

export async function generateStaticParams() {
  return EVENTS.map((e) => ({ slug: e.slug }));
}

// Cheap unknown-slug short-circuit (QW-13): every resolvable slug —
// seed, live (cleanEventSlug / legacy "live-…"), ingested — is lowercase
// kebab ([a-z0-9-]). Anything else (uppercase, "_", ".", encoded chars) can
// NEVER resolve, so 404 it before paying the full live-feed union. Slugs
// that LOOK valid still have to consult the feeds — a genuinely cheap slug
// index isn't possible without restructuring the feed caches (deferred).
const RESOLVABLE_SLUG = /^[a-z0-9-]+$/;

export async function generateMetadata(
  { params }: { params: Promise<{ slug: string }> }
): Promise<Metadata> {
  const { slug } = await params;
  if (!RESOLVABLE_SLUG.test(slug)) notFound();
  const resolution = await resolveEventMetadataBySlug(slug);
  // Metadata intentionally reads only editorial seed data and the bounded
  // durable archive. A newly published event may not have reached that archive
  // yet, and a transient archive failure is not proof the event is missing.
  // Return conservative metadata and let the blocking page body make the
  // authoritative hit / honest 404 / recoverable-unavailable decision.
  if (!resolution) {
    return {
      title: "Event in Frederick County",
      description:
        "Check event timing, location, and source information for Frederick County.",
      robots: { index: false, follow: false },
      openGraph: {
        title: "Event in Frederick County",
        description:
          "Check event timing, location, and source information for Frederick County.",
        type: "article",
      },
    };
  }
  const event = resolution.event;
  const blurb = eventBlurb(event).slice(0, 160);
  const canonicalSlug =
    resolution.kind === "seed" ? slug : event.slug;
  return {
    title: event.title,
    description: blurb,
    alternates: { canonical: `/events/${canonicalSlug}` },
    openGraph: {
      title: event.title,
      description: blurb,
      type: "article",
      images: [{ url: `/api/og?type=event&slug=${canonicalSlug}`, width: 1200, height: 630 }],
    },
  };
}

export default async function EventPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ returnTo?: string | string[] }>;
}) {
  const { slug } = await params;
  const { returnTo } = await searchParams;
  if (!RESOLVABLE_SLUG.test(slug)) notFound();
  let resolution: ResolvedEventPage | null;
  try {
    resolution = await resolveEventPageBySlug(slug);
  } catch (error) {
    if (!isOperationalEventResolutionError(error)) throw error;

    // A provider outage is a known, recoverable product state. Returning the
    // event-scoped recovery view here keeps the response successful and useful;
    // throwing would make Next stamp a 500 on otherwise intentional UI. The
    // request-rendered segment ensures this transient state is never cached.
    noStore();
    Sentry.captureMessage("event-detail: served source-unavailable recovery", {
      level: "warning",
      tags: { surface: "event-detail", recovery: "source-unavailable" },
      extra: { slug, sources: error.sources },
    });
    return <EventLookupRecovery />;
  }
  if (!resolution) notFound();
  // Owner notice override (src/data/event-notices.json): a hand-confirmed
  // cancellation must beat whatever the source row says — the Alive @ Five
  // heat cancellation reached no feed, only the owner. Stamped BEFORE any
  // downstream read so the banner, the dimmed hero, and the JSON-LD
  // eventStatus all tell the same story. Advisory notices don't change
  // status (the event is still on); they only add the banner note below.
   
  const notice = noticeForEvent(slug, new Date());
  const event =
    notice && notice.status !== "advisory"
      ? { ...resolution.event, status: notice.status }
      : resolution.event;
  // Canonicalize live-event URLs (Phase 2). A live event always carries
  // its clean stored slug; if we resolved one through a legacy
  // "live-..." link or any non-canonical form, send the visitor to the
  // clean URL. Temporary (307) rather than permanent, because live-feed
  // events are windowed and a permanently-cached redirect could outlive
  // the event it points at. Seed events keep their hand-authored slug.
  if (resolution.kind !== "seed" && event.slug !== slug) {
    redirect(withBrowseReturnTo(`/events/${event.slug}`, returnTo));
  }
  // Reliable live-vs-seed signal: whether the static seed resolved it.
  // event.source is NOT usable here (hand-authored seed events also use
  // "manual"). A live event has no static ICS endpoint and no editorial
  // extras, so the calendar cell and the third action adapt off this.
  const isLive = resolution.kind !== "seed";
  const attendance = eventAttendanceMode(event);
  const physicalAttendance = hasPhysicalAttendance(event);
  const onlineActionUrl = eventOnlineActionUrl(event);
  const attendanceLabel = eventDecisionLocation(event);
  const communicationAccess = communicationAccessLabels(event);

  const cat = CATEGORY_BY_SLUG[event.category];
  const desc = (event.description ?? "").trim();
  const description = splitDescription(desc);
  const venuePlace = event.venue_place_slug
    ? clientPlaceBySlug(event.venue_place_slug)
    : null;
  const hasPreciseLocation = eventHasPreciseLocation(
    event,
    Boolean(venuePlace),
  );
  const pinGeom = venuePlace?.geom ?? event.geom;
  // A moment whose venue has no car access (Colorfest closes Frederick Road)
  // must not route drivers to the venue. Directions turns into a walking link
  // and never becomes the filled primary; the guide's parking and shuttle
  // section is offered instead.
  const arrivalMoment = momentForEventSlug(event.slug);
  const noCarAccess = Boolean(arrivalMoment?.venue?.arrivalSection);
  const directionsUrl = hasPreciseLocation
    ? `https://www.google.com/maps/dir/?api=1&destination=${pinGeom.lat},${pinGeom.lng}${noCarAccess ? "&travelmode=walking" : ""}`
    : null;
  const hasDirections = Boolean(physicalAttendance && hasPreciseLocation && directionsUrl);
  const hasTrustworthyEnd = eventHasTrustworthyEnd(event);
  const timeCaution = eventDetailTimeCaution(event, eventTimeCaution(event));
  const calendarEndsAt = hasTrustworthyEnd
    ? event.ends_at
    : event.starts_at;
  const icsUrl = `/api/events/${event.slug}/ics`;

  // Map our lifecycle status to schema.org's enum — a postponed/cancelled game
  // (Frederick Keys feeds these) must not tell Google "scheduled".
  const schemaEventStatus =
    event.status === "cancelled"
      ? "https://schema.org/EventCancelled"
      : event.status === "postponed"
        ? "https://schema.org/EventPostponed"
        : "https://schema.org/EventScheduled";
  // A present-but-EMPTY location name/address is a Rich-Results "incomplete
  // location" warning — worse than omitting the field. Some feed rows (an
  // un-enriched Visit Frederick row whose detail page timed out, a venue-less
  // ingested library/fire row) carry "". Fall the name back to the town and
  // drop an empty address rather than emit blanks.
  const physicalJsonLdLocation = {
    "@type": "Place",
    name: event.venue_name || event.municipality_name || "Frederick County",
    ...(event.address ? { address: event.address } : {}),
    ...(hasPreciseLocation
      ? {
          geo: {
            "@type": "GeoCoordinates",
            latitude: pinGeom.lat,
            longitude: pinGeom.lng,
          },
        }
      : {}),
  };
  const virtualJsonLdLocation = onlineActionUrl
    ? { "@type": "VirtualLocation", url: onlineActionUrl }
    : undefined;
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Event",
    name: event.title,
    description: eventBlurb(event),
    // Local-offset form (2026-06-11T17:00:00-04:00) — Google accepts UTC
    // "Z" but prefers this, and it self-documents tz correctness.
    startDate: easternOffsetIso(event.starts_at),
    ...(hasTrustworthyEnd
      ? { endDate: easternOffsetIso(event.ends_at) }
      : {}),
    eventStatus: schemaEventStatus,
    eventAttendanceMode:
      attendance === "online"
        ? "https://schema.org/OnlineEventAttendanceMode"
        : attendance === "mixed"
          ? "https://schema.org/MixedEventAttendanceMode"
          : "https://schema.org/OfflineEventAttendanceMode",
    location:
      attendance === "online"
        ? virtualJsonLdLocation
        : attendance === "mixed" && virtualJsonLdLocation
          ? [physicalJsonLdLocation, virtualJsonLdLocation]
          : physicalJsonLdLocation,
    organizer: event.organizer ? { "@type": "Organization", name: event.organizer } : undefined,
    isAccessibleForFree: event.is_free,
    offers: event.is_free
      ? { "@type": "Offer", price: "0", priceCurrency: "USD", availability: "https://schema.org/InStock" }
      : event.ticket_url ? { "@type": "Offer", url: event.ticket_url, availability: "https://schema.org/InStock" } : undefined,
  };

  // Lifecycle status — drives the cancellation banner + a dimmed hero.
  const eventStatus = event.status ?? "scheduled";
  // The durable archive keeps an event page alive long after the event — a
  // shared link from June should still resolve in August. But resolved-from-
  // archive must not mean rendered-as-upcoming: this page used to give a
  // months-past event the full forward treatment (Tickets as the vermilion
  // primary, Add to calendar, no statement that it happened). The listing
  // gate preserves current date ranges without treating them as continuous
  // sessions. A cancelled or postponed event keeps its own louder
  // treatment; ended-ness only speaks for events that actually ran.
  const hasEnded =
    eventStatus === "scheduled" && isEventListingEnded(event, new Date());
  const eventVisual = eventCardVisual(event);
  // Server component: request-time clock is correct here, not impure render.
  // eslint-disable-next-line react-hooks/purity
  const nowMs = Date.now();
  const now = new Date(nowMs);
  // One filled action: Directions on the way to the venue, otherwise the
  // listing's own lead (eventActionBar). Every clock in the rule is Eastern.
  const mobilePrimary = eventMobilePrimaryAction({
    ticketUrl: event.ticket_url,
    attendance,
    onlineActionUrl,
    now,
    startsAt: event.starts_at,
    endsAt: hasTrustworthyEnd ? event.ends_at : null,
    isAllDay: Boolean(event.is_all_day) || isDateOnlyEventAnchor(event),
    hasDirections: hasDirections && !noCarAccess,
    status: eventStatus,
  });
  const visualTreatment = eventVisual ? eventVisualTreatment(eventVisual) : null;
  const guideMoment = eventGuideMoment(event.slug, now);
  const eventPlan = eventPlanEligibility(event, {
    nowMs,
    hasResolvedVenue: Boolean(venuePlace),
    venueOperational: venuePlace?.is_operational,
  });
  const eventPlanDuration = eventPlan.eligible
    ? eventPlan.durationMinutes % 60 === 0
      ? `${eventPlan.durationMinutes / 60} ${eventPlan.durationMinutes === 60 ? "hour" : "hours"}`
      : `${eventPlan.durationMinutes} minutes`
    : null;
  // Secondary context is bounded and independent. The primary event has
  // already resolved; a slow related/nearby source degrades to the seed/slim
  // catalog fallback instead of rebuilding the full event and place catalogs.
  const [saveCount, related, nearby] = await Promise.all([
    eventSaveCount(event.slug).catch(() => null),
    loadRelatedEventSections(event, new Date(nowMs)),
    physicalAttendance && hasPreciseLocation
      ? loadEventNearbyPlaces(event)
      : Promise.resolve({ food: [], parking: [], source: "catalog-fallback" as const }),
  ]);
  const lineup = related.lineup;
  const relatedSections = related.sections;
  const nearbyFood = nearby.food;
  const nearbyParking = nearby.parking;
  const parkingDecision =
    physicalAttendance && hasPreciseLocation
      ? nearestEventParking(pinGeom)
      : null;
  // Glance tiles state only what a field or a cited source supplies. Parking
  // is that source's own wording, and an absent fact is an absent tile.
  const whenFact = eventGlanceWhen(event, now);
  const gettingInFact = eventGlanceGettingIn(event);
  const parkingFact =
    physicalAttendance && hasPreciseLocation && eventStatus === "scheduled" && !hasEnded
      ? eventGlanceParking({
          fieldNote: event.venue_place_slug
            ? fieldNotesFor(event.venue_place_slug)?.parking
            : null,
          parkingDecision,
        })
      : null;
  const glanceTiles: GlanceTile[] = [];
  if (whenFact) glanceTiles.push({ id: "when", icon: Clock, label: "When", ...whenFact });
  if (gettingInFact) glanceTiles.push({ id: "getting-in", icon: Ticket, label: "Getting in", ...gettingInFact });
  if (parkingFact) glanceTiles.push({ id: "parking", icon: CarFront, label: "Parking", ...parkingFact });
  const heroPlates = eventDateHeroPlates(event);
  const breadcrumbs = (
    <nav aria-label="Breadcrumb" className="text-xs">
      <ol className="flex items-center gap-1.5" style={{ color: "var(--app-ink-3)" }}>
        <li><Link href="/events" className="inline-block px-1 py-3.5 -mx-1 -my-3.5 hover:underline">Events</Link></li>
        <li aria-hidden>·</li>
        <li>
          {physicalAttendance && MUNICIPALITY_BY_SLUG[event.municipality] ? (
            <Link href={`/m/${event.municipality}`} className="inline-block px-1 py-3.5 -mx-1 -my-3.5 hover:underline">{event.municipality_name}</Link>
          ) : (
            <span>{physicalAttendance ? event.municipality_name : "Online"}</span>
          )}
        </li>
      </ol>
    </nav>
  );
  // The title on Cream, under every picture except Radius's own photo.
  const titleBlock = (
    <div className="flex items-start justify-between gap-3" data-event-title>
      <div className="min-w-0">
        <p className="text-meta-lg font-semibold" style={{ color: "var(--app-ink-3)" }}>{cat?.name ?? "Event"}</p>
        <h1 className="display-2 mt-1" style={{ color: "var(--app-ink)" }}>{event.title}</h1>
      </div>
      <div className="flex shrink-0 items-center gap-1">
        <EventActions event={event} actions={["share"]} />
        <div className="hidden lg:block"><SaveButton refType="event" refId={event.slug} label={event.title} /></div>
      </div>
    </div>
  );
  const firstLineupDates = lineup.slice(0, 4);
  const moreLineupDates = lineup.slice(4, 30);

  return (
    // AppMain owns the one shared mobile-chrome reserve. Adding another page
    // pad here created a large empty tail beneath every event.
    <div
      className="space-y-5 sm:space-y-6"
      data-decision-surface="events"
      data-decision-entity="event"
      data-decision-id={event.slug}
      data-decision-position="detail"
    >
      <Suspense fallback={null}><MapReturnLink /></Suspense>

      {/* One photo state for the whole first screen. The hero slot follows
          the honest picture ladder (docs/VISUAL_FIRST.md), chosen by
          eventVisualTreatment:
            - owned: Radius's own photo, the only picture type may sit on;
            - flyer: the publisher's image shown whole on sunken paper, with
              nothing drawn over it and the title on Cream below;
            - venue: a credited venue photo, title below;
            - otherwise, or when the photo fails: the venue's block on the
              county map for a precisely located in-person event, else the
              event's days as date plates.
          A venue photo the proxy could not deliver answers with its failure
          signal, and the page then renders that photoless layout. The scope
          reaches down to Getting there so the venue map renders once: in the
          hero when it is the picture, below when a photo leads. */}
      <PlacePhotoScope src={eventVisual?.src}>
      {/* Visually small breadcrumbs with invisible 44px hit areas
          (WCAG 2.5.5): py-3.5/-my-3.5 grows the tap zone only. The owned
          photo hero carries its own Back link instead. */}
      {visualTreatment === "owned" ? (
        <PlacePhotoWhen is="missing">{breadcrumbs}</PlacePhotoWhen>
      ) : (
        breadcrumbs
      )}

      {/* Ended notice: calm and factual, never the alarm treatment. A past
          event is a record, not a problem. States the fact in Ink so the rest
          of the page (which stays fully readable as an archive) cannot be
          mistaken for an invitation. */}
      {hasEnded && (
        <div
          className="flex items-center gap-2 rounded-[var(--app-radius-md)] border px-4 py-2.5 text-meta-lg font-medium"
          style={{ borderColor: "var(--app-border)", color: "var(--app-ink-2)", background: "var(--app-bg-elevated)" }}
        >
          <Calendar className="h-4 w-4 shrink-0" strokeWidth={2} aria-hidden style={{ color: "var(--app-ink-3)" }} />
          This event has already happened.
        </div>
      )}
      {/* Cancellation banner: loud, above the hero, so a user who came here
          for this event sees it's off before anything else. Renders when the
          event is not scheduled, or when an owner notice carries an advisory
          (still on, but know this first). A notice adds its one-line detail
          and the organizer's own announcement link, so the claim always
          shows its source. */}
      {(eventStatus !== "scheduled" || notice) && (() => {
        const tone = eventStatus === "cancelled" ? "var(--app-danger)" : "var(--app-warning)";
        const BannerIcon = eventStatus === "scheduled" ? AlertTriangle : Ban;
        const lead =
          eventStatus === "cancelled"
            ? "This event has been cancelled."
            : eventStatus === "postponed"
              ? "This event has been postponed. Check the official page for a new date."
              : notice?.headline;
        return (
          <div
            className="rounded-[var(--app-radius-md)] px-4 py-2.5"
            style={{
              background: `color-mix(in srgb, ${tone} 16%, var(--app-bg-elevated))`,
              border: `1px solid ${tone}`,
            }}
          >
            <div className="flex items-center gap-2 text-meta-lg font-semibold" style={{ color: tone }}>
              <BannerIcon className="h-4 w-4 shrink-0" strokeWidth={2.25} aria-hidden />
              {lead}
            </div>
            {notice?.note && (
              <p className="mt-1 pl-6 text-meta-lg" style={{ color: "var(--app-ink-2)" }}>
                {notice.note}
              </p>
            )}
            {notice?.source_url && (
              <a
                href={notice.source_url}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-1 inline-block pl-6 text-meta font-semibold underline"
                style={{ color: "var(--app-ink-2)" }}
              >
                Organizer&rsquo;s announcement
              </a>
            )}
          </div>
        );
      })()}

      <header
        className="space-y-4"
        data-decision-impression="true"
        data-decision-surface="events"
        data-decision-entity="event"
        data-decision-id={event.slug}
        data-decision-position="detail"
        style={{
          opacity: eventStatus === "cancelled" ? 0.85 : 1,
          viewTransitionName: `event-${event.slug}`,
        }}
      >
        {eventVisual && visualTreatment === "owned" ? (
          // Radius's own photograph: the one picture the title may sit on,
          // over an Ink scrim on its bottom 60%.
          <PlacePhotoWhen is="visible">
            <div
              className="relative -mx-4 -mt-4 h-64 overflow-hidden sm:mx-0 sm:mt-0 sm:h-72 sm:rounded-[var(--app-radius-lg)]"
              style={{ background: "var(--app-bg-sunken)" }}
              data-event-hero="owned"
            >
              <PlacePhotoScopeImage
                alt=""
                fill
                priority
                sizes="(max-width: 720px) 100vw, 720px"
                placeholder="blur"
                blurDataURL={PAPER_CREAM_BLUR}
                className="object-cover"
              />
              <span
                aria-hidden
                className="absolute inset-x-0 bottom-0 h-3/5"
                style={{
                  background:
                    "linear-gradient(to top, color-mix(in srgb, var(--app-ink) 88%, transparent), color-mix(in srgb, var(--app-ink) 46%, transparent) 55%, transparent)",
                }}
              />
              <div className="absolute inset-x-0 top-0 flex items-start justify-between gap-3 p-4">
                <Link
                  href="/events"
                  className="tactile-interactive inline-flex h-11 items-center justify-center gap-1.5 rounded-full px-3.5 text-meta-lg font-semibold"
                  style={{ background: "color-mix(in srgb, var(--app-bg) 90%, transparent)", color: "var(--app-ink)" }}
                >
                  <ArrowLeft className="h-4 w-4" strokeWidth={2.25} aria-hidden />
                  Back
                </Link>
                <div
                  className="flex shrink-0 items-center gap-1 rounded-full px-1"
                  style={{ background: "color-mix(in srgb, var(--app-bg) 90%, transparent)" }}
                >
                  <EventActions event={event} actions={["share"]} />
                  <div className="hidden lg:block">
                    <SaveButton refType="event" refId={event.slug} label={event.title} />
                  </div>
                </div>
              </div>
              <div className="absolute inset-x-0 bottom-0 p-5" style={{ color: "var(--app-ink-inverse)" }}>
                <p className="text-meta-lg font-semibold">{cat?.name ?? "Event"}</p>
                <h1 className="display-2 mt-0.5">{event.title}</h1>
              </div>
            </div>
            <PlacePhotoWhen is="ready">
              <EventVisualCredit visual={eventVisual} className="-mt-2" />
            </PlacePhotoWhen>
          </PlacePhotoWhen>
        ) : eventVisual ? (
          // A publisher's flyer is shown whole at its own aspect on sunken
          // paper. A venue photo may be cropped. Neither carries type or
          // controls, and the credit appears only after the image loads.
          <PlacePhotoWhen is="visible">
            <figure className="-mx-4 sm:mx-0" data-event-hero={visualTreatment ?? "venue"}>
              <div
                data-event-hero-frame
                className={`relative w-full overflow-hidden sm:rounded-[var(--app-radius-lg)] ${
                  visualTreatment === "flyer" ? "aspect-[16/10] max-h-[360px]" : "h-56 sm:h-72"
                }`}
                style={{ background: "var(--app-bg-sunken)" }}
              >
                {visualTreatment === "flyer" ? (
                  <PlacePhotoScopeImage
                    alt=""
                    fill
                    priority
                    sizes="(max-width: 720px) 100vw, 720px"
                    className="object-contain"
                  />
                ) : (
                  <PlacePhotoScopeImage
                    alt={`Photo of ${eventVisual.attribution?.venue_name ?? event.venue_name}`}
                    fill
                    priority
                    sizes="(max-width: 720px) 100vw, 720px"
                    placeholder="blur"
                    blurDataURL={PAPER_CREAM_BLUR}
                    className="object-cover"
                  />
                )}
              </div>
              <PlacePhotoWhen is="ready">
                <figcaption className="px-4 pt-2 sm:px-0">
                  <EventVisualCredit visual={eventVisual} />
                </figcaption>
              </PlacePhotoWhen>
            </figure>
            {titleBlock}
          </PlacePhotoWhen>
        ) : null}

        {/* No photograph, or one that failed: the venue's own block when the
            location is precise, otherwise the event's days. */}
        <PlacePhotoWhen is="missing">
          {physicalAttendance && hasPreciseLocation ? (
            <div className="space-y-4" data-event-hero="map">
              <VenueMiniMap
                variant="hero"
                geom={pinGeom}
                name={event.venue_name || event.title}
                address={event.address}
                caption={eventMapCaption({ venueName: event.venue_name, address: event.address, geom: pinGeom })}
              />
              {titleBlock}
            </div>
          ) : (
            <div
              className="flex flex-col gap-4 sm:flex-row sm:items-start sm:gap-5"
              data-event-hero="date"
            >
              {heroPlates.plates.length > 0 ? (
                <ul aria-label="Event dates" className="flex shrink-0 items-center gap-2">
                  {heroPlates.plates.map((day, index) => (
                    <li key={day.date} className="flex items-center gap-2">
                      {heroPlates.range && index > 0 ? (
                        <span aria-hidden className="text-meta-lg" style={{ color: "var(--app-ink-3)" }}>to</span>
                      ) : null}
                      <DatePlate
                        month={day.month}
                        day={day.day}
                        weekday={day.weekday}
                        accent="var(--app-brand)"
                        size="md"
                      />
                      <span className="sr-only">{heroPlates.range && index > 0 ? `to ${day.label}` : day.label}</span>
                    </li>
                  ))}
                </ul>
              ) : null}
              <div className="min-w-0 flex-1">{titleBlock}</div>
            </div>
          )}
        </PlacePhotoWhen>

        <GlanceTiles tiles={glanceTiles} />

        {guideMoment ? (
          <Link
            href={`/moments/${guideMoment.slug}`}
            className="tap-44 inline-flex min-h-11 items-center gap-1.5 text-body font-semibold underline underline-offset-4"
            style={{ color: "var(--app-brand-press)" }}
            data-event-guide-link
          >
            Open the {guideMoment.title} guide
            <ArrowRight className="h-4 w-4" strokeWidth={1.75} aria-hidden />
          </Link>
        ) : null}

        {timeCaution && <p className="text-meta-lg" style={{ color: "var(--app-ink-3)" }}>{timeCaution}</p>}

        {/* Provenance and the listing's remaining facts, then the description. */}
        <div className="space-y-3">
          <TrustChip signal={eventTrust(event)} detail />
          <div className="flex flex-wrap items-center gap-3 text-xs" style={{ color: "var(--app-ink-3)" }}>
            {attendanceLabel && (
              <span className="inline-flex items-center gap-1">
                {physicalAttendance ? (
                  <MapPin className="h-3.5 w-3.5" aria-hidden />
                ) : (
                  <ExternalLink className="h-3.5 w-3.5" aria-hidden />
                )}
                {attendanceLabel}
              </span>
            )}
            {event.is_recurring && event.recurrence_text && (
              <span className="rounded-full bg-[var(--app-bg-sunken)] px-2 py-0.5 text-caption">
                {event.recurrence_text}
              </span>
            )}
            {event.organizer && (
              <span>by {event.organizer}</span>
            )}
            {saveCount ? <span>Saved {saveCount} times</span> : null}
            <FreshnessChip
              iso={event.last_verified_at ?? undefined}
              subject="Event"
              basis={eventFreshnessBasis(event)}
            />
            {event.source_url && <EventSourceLink href={event.source_url} />}
          </div>
        </div>
        {desc && (
          <div className="max-w-[68ch] text-body" style={{ color: "var(--app-ink-2)" }}>
            <p>{description.preview}</p>
            {description.rest ? (
              <details className="group mt-1">
                <summary className="tap-44 inline-flex cursor-pointer list-none items-center gap-1 text-meta-lg font-semibold [&::-webkit-details-marker]:hidden" style={{ color: "var(--app-brand-press)" }}>
                  Read full description
                  <ChevronDown className="h-3.5 w-3.5 transition-transform group-open:rotate-180" strokeWidth={2} aria-hidden />
                </summary>
                <p className="pb-1">{description.rest}</p>
              </details>
            ) : null}
          </div>
        )}
        {communicationAccess.length > 0 && (
          <div
            className="flex items-start gap-2.5 rounded-[var(--app-radius-md)] border px-3 py-2.5"
            style={{
              borderColor: "color-mix(in srgb, var(--app-cool) 30%, var(--app-border))",
              background: "color-mix(in srgb, var(--app-cool) 7%, var(--app-bg-elevated))",
            }}
          >
            <Accessibility
              className="mt-0.5 h-4 w-4 shrink-0"
              strokeWidth={2}
              style={{ color: "var(--app-cool)" }}
              aria-hidden
            />
            <div className="min-w-0">
              <p className="text-meta font-semibold" style={{ color: "var(--app-ink)" }}>
                Communication access
              </p>
              <p className="mt-0.5 text-meta" style={{ color: "var(--app-ink-2)" }}>
                {communicationAccess.join(" · ")}
              </p>
              <p className="mt-0.5 text-caption" style={{ color: "var(--app-ink-3)" }}>
                Shown only when stated by the event publisher.
              </p>
            </div>
          </div>
        )}
      </header>

      {/* Desktop actions: one row instead of a grid of full-width slabs.
          The primary is a single 48px filled button sized to its label and
          leads the row; every other action is a 44px text button. Phones get
          the same actions in the MobileActionBar below. */}
      {eventStatus !== "scheduled" ? (
        (() => {
          // A cancelled/postponed event must not keep selling the plan
          // (July 2026 review): Tickets, Add-to-calendar, and Directions
          // all invite a trip that won't happen. The two honest actions
          // are the organizer's own word and a way back to tonight.
          const announceUrl = notice?.source_url ?? event.source_url ?? null;
          return (
            <div className="hidden flex-wrap items-center gap-2 lg:flex" data-event-actions="desktop">
              <Link href="/events?lens=today" className={eventDesktopActionClass(true)} style={eventDesktopActionStyle(true)}>
                <Calendar className="h-5 w-5" strokeWidth={1.75} aria-hidden />
                Find something else
              </Link>
              {announceUrl && (
                <a href={announceUrl} target="_blank" rel="noopener noreferrer" className={eventDesktopActionClass(false)} style={eventDesktopActionStyle(false)}>
                  <ExternalLink className="h-4 w-4" strokeWidth={1.75} aria-hidden />
                  Organizer&rsquo;s announcement
                </a>
              )}
            </div>
          );
        })()
      ) : hasEnded ? (
        // A past event must not keep selling the plan either: Tickets,
        // Add-to-calendar, and Directions all invite a trip whose moment is
        // gone. The record stays; the actions become the venue's page (the
        // durable thing a reader can still visit) and a way back to tonight.
        (() => {
          const recordAction =
            event.venue_place_slug
              ? { href: `/places/${event.venue_place_slug}`, external: false, label: "Venue page" }
              : event.source_url
                ? { href: event.source_url, external: true, label: "Official page" }
                : null;
          return (
            <div className="hidden flex-wrap items-center gap-2 lg:flex" data-event-actions="desktop">
              <Link href="/events?lens=today" className={eventDesktopActionClass(true)} style={eventDesktopActionStyle(true)}>
                <Calendar className="h-5 w-5" strokeWidth={1.75} aria-hidden />
                Find something else
              </Link>
              {recordAction && (recordAction.external ? (
                <a href={recordAction.href} target="_blank" rel="noopener noreferrer" className={eventDesktopActionClass(false)} style={eventDesktopActionStyle(false)}>
                  <ExternalLink className="h-4 w-4" strokeWidth={1.75} aria-hidden />
                  {recordAction.label}
                </a>
              ) : (
                <Link href={recordAction.href} className={eventDesktopActionClass(false)} style={eventDesktopActionStyle(false)}>
                  <MapPin className="h-4 w-4" strokeWidth={1.75} aria-hidden />
                  {recordAction.label}
                </Link>
              ))}
            </div>
          );
        })()
      ) : (() => {
        // Exactly one filled primary. On the way to the venue (eventActionBar)
        // that is Directions, and Tickets step down to a text button. Otherwise
        // the listing's own action leads: Tickets, RSVP, online details, the
        // venue page or the official page, else Directions, else the calendar.
        const thirdAction =
          event.ticket_url ? { href: event.ticket_url, external: true, Icon: Ticket, label: "Tickets", decision: "ticket" as const } :
          event.rsvp_url ? { href: event.rsvp_url, external: true, Icon: ExternalLink, label: "RSVP", decision: "reservation" as const } :
          attendance !== "physical" && onlineActionUrl ? { href: onlineActionUrl, external: true, Icon: ExternalLink, label: "Online details", decision: "website" as const } :
          event.venue_place_slug ? { href: `/places/${event.venue_place_slug}`, external: false, Icon: MapPin, label: "Venue page", decision: "open" as const } :
          event.source_url ? { href: event.source_url, external: true, Icon: ExternalLink, label: "Official page", decision: "website" as const } :
          null;
        const primary: "directions" | "third" | "calendar" =
          mobilePrimary === "directions" && hasDirections
            ? "directions"
            : thirdAction
              ? "third"
              : hasDirections
                ? "directions"
                : "calendar";
        const iconFor = (isPrimary: boolean) => (isPrimary ? "h-5 w-5" : "h-4 w-4");

        const calendar = isLive ? (
          <EventCalendarButton
            key="calendar"
            appearance={primary === "calendar" ? "primary" : "text"}
            event={{
              slug: event.slug,
              title: event.title,
              starts_at: event.starts_at,
              ends_at: calendarEndsAt,
              description: event.description,
              venue_name: event.venue_name,
              address: event.address,
              is_all_day: event.is_all_day,
            }}
          />
        ) : (
          <a
            key="calendar"
            href={icsUrl}
            download
            className={eventDesktopActionClass(primary === "calendar")}
            style={eventDesktopActionStyle(primary === "calendar")}
          >
            <Calendar className={iconFor(primary === "calendar")} strokeWidth={1.75} aria-hidden />
            Add to calendar
          </a>
        );
        const directions = hasDirections && directionsUrl ? (
          <a
            key="directions"
            href={directionsUrl}
            data-decision-action="directions"
            target="_blank"
            rel="noopener noreferrer"
            className={eventDesktopActionClass(primary === "directions")}
            style={eventDesktopActionStyle(primary === "directions")}
          >
            <Navigation className={iconFor(primary === "directions")} strokeWidth={1.75} aria-hidden />
            Directions
          </a>
        ) : null;
        const third = thirdAction ? (thirdAction.external ? (
          <a
            key="third"
            href={thirdAction.href}
            data-decision-action={thirdAction.decision}
            target="_blank"
            rel="noopener noreferrer"
            className={eventDesktopActionClass(primary === "third")}
            style={eventDesktopActionStyle(primary === "third")}
          >
            <thirdAction.Icon className={iconFor(primary === "third")} strokeWidth={1.75} aria-hidden />
            {thirdAction.label}
          </a>
        ) : (
          <Link
            key="third"
            href={thirdAction.href}
            data-decision-action={thirdAction.decision}
            className={eventDesktopActionClass(primary === "third")}
            style={eventDesktopActionStyle(primary === "third")}
          >
            <thirdAction.Icon className={iconFor(primary === "third")} strokeWidth={1.75} aria-hidden />
            {thirdAction.label}
          </Link>
        )) : null;
        const byKind = { calendar, directions, third };
        const order = [primary, ...(["third", "directions", "calendar"] as const).filter((kind) => kind !== primary)];

        return (
          <div className="hidden flex-wrap items-center gap-2 lg:flex" data-event-actions="desktop">
            {order.map((kind) => byKind[kind])}
          </div>
        );
      })()}

      {eventPlan.eligible && (
        <section
          aria-label="Plan this visit"
          className="border-y py-4"
          style={{ borderColor: "var(--app-border)" }}
        >
          <p className="text-body" style={{ color: "var(--app-ink-2)" }}>
            This plan reserves {eventPlanDuration} for the event. It can include one nearby stop when the hours fit.
          </p>
          <Link
            href={withBrowseReturnTo(
              `/plan?event=${encodeURIComponent(event.slug)}`,
              withBrowseReturnTo(`/events/${event.slug}`, returnTo),
            )}
            prefetch={false}
            className="tap-44 mt-1 inline-flex min-h-11 items-center gap-2 text-sm font-semibold underline underline-offset-4"
            style={{ color: "var(--app-brand-press)" }}
          >
            Plan around this event
            <ArrowRight className="h-4 w-4" strokeWidth={1.75} aria-hidden />
          </Link>
        </section>
      )}

      {/* Smart pairings: weather at the event start and the nearest food
          spot in one card. Self-hides if none of the signals are available. */}
      {physicalAttendance && hasPreciseLocation && eventStatus === "scheduled" && !hasEnded && !event.is_all_day && !isDateOnlyEventAnchor(event) && (
        <EventSmartPairings
          event={event}
          nearbyFood={nearbyFood}
          parkingDecision={null}
        />
      )}

      {/* Practical attendance context uses the same precise location as
          Directions. The venue map renders here only when a photograph
          leads the page; otherwise it is already the hero. */}
      {noCarAccess && arrivalMoment?.venue?.note && eventStatus === "scheduled" && !hasEnded && (
        <section
          aria-label="Parking and shuttle"
          data-event-arrival={arrivalMoment.slug}
          className="flex items-start gap-3 border-t py-4"
          style={{ borderColor: "var(--app-border)" }}
        >
          <CarFront className="mt-0.5 h-5 w-5 shrink-0" style={{ color: "var(--app-cool)" }} aria-hidden />
          <div className="min-w-0">
            <p className="text-body" style={{ color: "var(--app-ink)" }}>{arrivalMoment.venue.note}</p>
            <Link
              href={`/moments/${arrivalMoment.slug}#${momentSectionId(arrivalMoment.venue.arrivalSection ?? "")}`}
              className="mt-1 inline-flex min-h-11 items-center gap-1 font-semibold underline underline-offset-2"
              style={{ color: "var(--app-brand-press)" }}
            >
              Parking and shuttle
              <ArrowRight className="h-4 w-4" aria-hidden />
            </Link>
          </div>
        </section>
      )}
      {physicalAttendance && hasPreciseLocation && eventStatus === "scheduled" && !hasEnded && (
        <GettingThere
          geom={pinGeom}
          venuePlaceSlug={event.venue_place_slug ?? undefined}
          geoPrecise
          parkingDecision={parkingDecision}
        />
      )}
      {physicalAttendance && hasPreciseLocation && eventVisual ? (
        <PlacePhotoWhen is="visible">
          <VenueMiniMap geom={pinGeom} name={event.venue_name} address={event.address} />
        </PlacePhotoWhen>
      ) : null}
      </PlacePhotoScope>

      {event.info && (event.info.admission || event.info.drinks || event.info.food) && (
        <section className="space-y-2">
          <h2 className="font-serif text-lg font-semibold tracking-tight" style={{ color: "var(--app-ink)" }}>
            Good to know
          </h2>
          <ul
            className="divide-y border-y"
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

      {lineup.length > 0 && (
        <section className="space-y-3">
          <div className="flex items-baseline justify-between">
            <h2 className="inline-flex items-center gap-2 font-serif text-lg font-semibold tracking-tight" style={{ color: "var(--app-ink)" }}>
              <Music className="h-4 w-4" strokeWidth={2} style={{ color: "var(--app-brand)" }} aria-hidden />
              More dates
            </h2>
            <span className="text-xs" style={{ color: "var(--app-ink-3)" }}>{lineup.length} dates</span>
          </div>
          {event.recurrence_text && (
            <p className="-mt-1 text-xs" style={{ color: "var(--app-ink-3)" }}>{event.recurrence_text}</p>
          )}
          <ul>
            {firstLineupDates.map((seriesEvent) => (
              <li key={seriesEvent.slug}><SeriesDateRow event={seriesEvent} nowMs={nowMs} /></li>
            ))}
          </ul>
          {moreLineupDates.length > 0 ? (
            <details className="group">
              <summary className="tap-44 flex cursor-pointer list-none items-center justify-between text-[13px] font-semibold [&::-webkit-details-marker]:hidden" style={{ color: "var(--app-brand-press)" }}>
                Show {moreLineupDates.length} more dates
                <ChevronDown className="h-4 w-4 transition-transform group-open:rotate-180" strokeWidth={2} aria-hidden />
              </summary>
              <ul>
                {moreLineupDates.map((seriesEvent) => (
                  <li key={seriesEvent.slug}><SeriesDateRow event={seriesEvent} nowMs={nowMs} /></li>
                ))}
              </ul>
            </details>
          ) : null}
          {lineup.length > 30 ? (
            <p className="text-xs" style={{ color: "var(--app-ink-3)" }}>The next 30 of {lineup.length} dates are shown.</p>
          ) : null}
        </section>
      )}

      {/* Related shelves: "More at <venue>", then "Same night nearby" or
          the event's weekend, at most three rows each (eventRelated). They
          sit below the Full lineup and primary "Good to know" content so
          the user has digested this event before being offered the next
          one. */}
      {relatedSections.map((section) => (
        <section key={section.kind} className="space-y-3">
          <div className="flex items-baseline justify-between gap-2">
            <h2
              className="inline-flex items-center gap-2 font-serif text-lg font-semibold tracking-tight"
              style={{ color: "var(--app-ink)" }}
            >
              <Calendar className="h-4 w-4" strokeWidth={2} style={{ color: "var(--app-brand)" }} aria-hidden />
              {section.title}
            </h2>
            <Link
              href="/events"
              className="tap-44 inline-flex items-center text-[12px] font-semibold"
              style={{ color: "var(--app-brand-press)" }}
            >
              See all <ArrowRight aria-hidden className="ml-1 inline h-3.5 w-3.5 -translate-y-px" strokeWidth={2.25} />
            </Link>
          </div>
          <ul className="space-y-2">
            {section.items.map((e) => (
              <li key={`${e.slug}-${e.starts_at}`}>
                {/* glance, not row: archived rows arrive venue-thumb
                    decorated, so the section reads as a visual shelf
                    instead of a text list. */}
                <EventCard event={e} variant="glance" />
              </li>
            ))}
          </ul>
        </section>
      ))}

      {(nearbyFood.length > 0 || nearbyParking.length > 0) ? (
        <details className="group border-y" style={{ borderColor: "var(--app-border)" }}>
          <summary className="tap-44 flex cursor-pointer list-none items-center justify-between gap-3 py-2 text-[14px] font-semibold [&::-webkit-details-marker]:hidden" style={{ color: "var(--app-ink)" }}>
            More food &amp; parking nearby
            <ChevronDown className="h-4 w-4 transition-transform group-open:rotate-180" strokeWidth={2} style={{ color: "var(--app-ink-3)" }} aria-hidden />
          </summary>
          <div className="space-y-5 pb-4 pt-2">
            {nearbyFood.length > 0 ? (
              <section className="space-y-2.5">
                <h2 className="font-serif text-lg font-semibold tracking-tight" style={{ color: "var(--app-ink)" }}>Eat &amp; drink nearby</h2>
                <ul className="space-y-2">
                  {nearbyFood.map((p) => <li key={p.slug}><PlaceCard place={p} variant="row" /></li>)}
                </ul>
              </section>
            ) : null}
            {nearbyParking.length > 0 ? (
              <section className="space-y-2.5">
                <h2 className="font-serif text-lg font-semibold tracking-tight" style={{ color: "var(--app-ink)" }}>Parking nearby</h2>
                <ul className="space-y-2">
                  {nearbyParking.map((p) => <li key={p.slug}><PlaceCard place={p} variant="row" /></li>)}
                </ul>
              </section>
            ) : null}
          </div>
        </details>
      ) : null}

      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLdScript(jsonLd) }}
      />

      {/* Mobile-only thumb-reachable dock. Desktop keeps the inline action
          row above; this reuses the same .ics calendar button, ticket +
          directions links, and the SaveButton. Exactly one action is the
          filled primary (eventMobilePrimaryAction): Directions on the way to
          a precisely located in-person event, with Tickets beside it and the
          calendar set aside until the event is over; otherwise Tickets when
          they exist, Online details for an online or hybrid event without
          tickets, else Add to calendar. A cancelled/postponed event gets the
          same replacement as the desktop row: the organizer's word + a way
          back to tonight (Save stays so a postponed event can be tracked for
          its new date). */}
      <MobileActionBar ariaLabel={`Actions for ${event.title}`}>
        {eventStatus !== "scheduled" ? (
          <>
            {(notice?.source_url ?? event.source_url) && (
              <MobileBarLink
                href={notice?.source_url ?? event.source_url ?? ""}
                icon={ExternalLink}
                label="Announcement"
                ariaLabel={`Organizer's announcement for ${event.title}`}
                external
                decisionAction="website"
              />
            )}
            <MobileBarLink
              href="/events?lens=today"
              icon={Calendar}
              label="What's on"
              ariaLabel="Find something else on today"
              primary
              decisionAction="open"
            />
          </>
        ) : hasEnded ? (
          <>
            {event.venue_place_slug && (
              <MobileBarLink
                href={`/places/${event.venue_place_slug}`}
                icon={MapPin}
                label="Venue"
                ariaLabel={`Venue page for ${event.title}`}
                decisionAction="open"
              />
            )}
            <MobileBarLink
              href="/events?lens=today"
              icon={Calendar}
              label="What's on"
              ariaLabel="Find something else on today"
              primary
              decisionAction="open"
            />
          </>
        ) : (
          <>
            {mobilePrimary !== "directions" && (
              <EventCalendarButton
                event={{
                  slug: event.slug,
                  title: event.title,
                  starts_at: event.starts_at,
                  ends_at: calendarEndsAt,
                  description: event.description,
                  venue_name: event.venue_name,
                  address: event.address,
                  is_all_day: event.is_all_day,
                }}
                barVariant={mobilePrimary === "calendar" ? "primary" : "quiet"}
                label="Add to calendar"
              />
            )}
            {(mobilePrimary === "tickets" || mobilePrimary === "directions") && event.ticket_url && (
              <MobileBarLink
                href={event.ticket_url}
                icon={Ticket}
                label="Tickets"
                ariaLabel={`Tickets for ${event.title}`}
                external
                primary={mobilePrimary === "tickets"}
                decisionAction="ticket"
              />
            )}
            {mobilePrimary === "online" && onlineActionUrl && (
              <MobileBarLink
                href={onlineActionUrl}
                icon={ExternalLink}
                label="Online details"
                ariaLabel={`Online details for ${event.title}`}
                external
                primary
                decisionAction="website"
              />
            )}
            {hasDirections && directionsUrl && (
              <MobileBarLink
                href={directionsUrl}
                icon={Navigation}
                label="Directions"
                ariaLabel={`Directions to ${event.venue_name || event.title}`}
                external
                primary={mobilePrimary === "directions"}
                decisionAction="directions"
              />
            )}
          </>
        )}
        <SaveButton refType="event" refId={event.slug} label={event.title} barLabel="Save" />
      </MobileActionBar>
    </div>
  );
}
