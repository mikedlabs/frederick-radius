import { Suspense } from "react";
import { eventDisplayTitle } from "@/lib/events/display-title";
import MapReturnLink from "@/components/place/MapReturnLink";
import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { unstable_noStore as noStore } from "next/cache";
import Link from "next/link";
import { AlertTriangle, ArrowRight, Ban, Calendar, Captions, ChevronDown, ExternalLink, MapPin, Navigation, Ticket, Utensils, Wine } from "lucide-react";
import { EVENTS } from "@/data/events";
import { formatEventWhen, seriesOccurrenceLabel, eventDateBlock } from "@/lib/loaders/events";
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
import EventVenuePhoto from "@/components/event/EventVenuePhoto";
import EventArtwork from "@/components/event/EventArtwork";
import EventSourceLink from "@/components/event/EventSourceLink";
import { eventCardVisual } from "@/components/event/eventVisuals";
import GettingThere from "@/components/event/GettingThere";
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
import { eventTrust } from "@/lib/trust";
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
      prefetch={false}
      href={`/events/${event.slug}`}
      className="tap-44 flex items-center gap-3 border-b py-2.5 transition hover:bg-[var(--app-bg-sunken)]"
      style={{ borderColor: "var(--app-border)", opacity: isPast ? 0.55 : 1 }}
    >
      <span className="w-11 shrink-0 text-center" aria-hidden>
        <span className="block text-[10px] font-bold uppercase tracking-wider" style={{ color: "var(--app-ink-2)" }}>{date.month}</span>
        <span className="block font-sans text-lg font-bold leading-none tabular-nums" style={{ color: "var(--app-ink)" }}>{date.day}</span>
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
  const directionsUrl = hasPreciseLocation
    ? `https://www.google.com/maps/dir/?api=1&destination=${pinGeom.lat},${pinGeom.lng}`
    : null;
  const hasTrustworthyEnd = eventHasTrustworthyEnd(event);
  const timeCaution = eventTimeCaution(event);
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

  const when = formatEventWhen(event);
  // Split the formatted when into its human date and its clock range so the
  // promoted "when" line can set the date in serif and the time in mono
  // (the brand's data voice). formatEventWhen joins same-day events as
  // "Sat, Jun 14 · 5:00 PM–8:00 PM"; multi-day has no " · " and stays whole.
  const whenSep = when.indexOf(" · ");
  const whenDate = whenSep >= 0 ? when.slice(0, whenSep) : when;
  const whenTime = whenSep >= 0 ? when.slice(whenSep + 3) : null;
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
  // When the desktop action row falls back to the publisher's page ("Official
  // page"), the Source row's inline link would be a second copy of the same
  // link one screen apart. Keep the inline link on phone, where the bottom
  // bar has no Official page action, and drop it at the row's breakpoint.
  // A cancelled or postponed event's row links the organizer's announcement,
  // which is the same page unless the notice names its own.
  const desktopRowHasSourceLink = Boolean(event.source_url) && (
    eventStatus !== "scheduled"
      ? (notice?.source_url ?? event.source_url) === event.source_url
      : hasEnded
        ? !event.venue_place_slug
        : !event.ticket_url && !event.rsvp_url && !(attendance !== "physical" && onlineActionUrl) && !event.venue_place_slug
  );
  const eventVisual = eventCardVisual(event);
  const photoVisual = eventVisual?.presentation === "photo" ? eventVisual : null;
  // Server component: request-time clock is correct here, not impure render.
  // eslint-disable-next-line react-hooks/purity
  const nowMs = Date.now();
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
  const moreUpcoming = related.moreUpcoming;
  const nearbyFood = nearby.food;
  const nearbyParking = nearby.parking;
  const parkingDecision =
    physicalAttendance && hasPreciseLocation
      ? nearestEventParking(pinGeom)
      : null;
  const firstLineupDates = lineup.slice(0, 4);
  const moreLineupDates = lineup.slice(4, 30);
  const firstUpcoming = moreUpcoming.items.slice(0, 3);
  const remainingUpcoming = moreUpcoming.items.slice(3);

  return (
    // AppMain owns the one shared mobile-chrome reserve. Adding another page
    // pad here created a large empty tail beneath every event.
    // One 720px reading column for the whole page, matching the header.
    <div
      className="max-w-[720px] space-y-5 sm:space-y-6"
      data-decision-surface="events"
      data-decision-entity="event"
      data-decision-id={event.slug}
      data-decision-position="detail"
    >
      <Suspense fallback={null}><MapReturnLink /></Suspense>

      {/* Event-content links load their destination only on a committed tap.
          This includes conditional/related links below: speculative route
          requests can race native document Back while detail hydrates. */}
      {/* Visually small breadcrumbs with invisible 44px hit areas
          (WCAG 2.5.5) — py-3.5/-my-3.5 grows the tap zone only. */}
      {
        <nav aria-label="Breadcrumb" className="text-xs">
          <ol className="flex items-center gap-1.5" style={{ color: "var(--app-ink-3)" }}>
            <li><Link prefetch={false} href="/events" className="inline-flex min-h-11 items-center gap-1.5 px-1 -mx-1 hover:underline">Events</Link></li>
            <li aria-hidden>·</li>
            <li>
              {physicalAttendance && MUNICIPALITY_BY_SLUG[event.municipality] ? (
                <Link prefetch={false} href={`/m/${event.municipality}`} className="inline-block px-1 py-3.5 -mx-1 -my-3.5 hover:underline">{event.municipality_name}</Link>
              ) : (
                <span>{physicalAttendance ? event.municipality_name : "Online"}</span>
              )}
            </li>
          </ol>
        </nav>
      }

      {/* Cancellation banner — loud, above the hero, so a user who
       *  came here for this event sees it's off before anything else.
       *  Renders when the event is not scheduled, or when an owner
       *  notice carries an advisory (still on, but know this first).
       *  A notice adds its one-line detail + the organizer's own
       *  announcement link, so the claim always shows its source. */}
      {/* Ended notice — calm and factual, never the alarm treatment: a past
          event is a record, not a problem. States the fact in Ink so the rest
          of the page (which stays fully readable as an archive) cannot be
          mistaken for an invitation. */}
      {hasEnded && (
        <div
          className="flex max-w-[720px] items-center gap-2 border-y py-2.5 text-[13px] font-medium"
          style={{ borderColor: "var(--app-border)", color: "var(--app-ink-2)" }}
        >
          <Calendar className="h-4 w-4 shrink-0" strokeWidth={2} aria-hidden style={{ color: "var(--app-ink-3)" }} />
          This event has already happened.
        </div>
      )}
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
            <div className="flex items-center gap-2 text-[13px] font-semibold" style={{ color: tone }}>
              <BannerIcon className="h-4 w-4 shrink-0" strokeWidth={2.25} aria-hidden />
              {lead}
            </div>
            {notice?.note && (
              <p className="mt-1 pl-6 text-[12.5px]" style={{ color: "var(--app-ink-2)" }}>
                {notice.note}
              </p>
            )}
            {notice?.source_url && (
              <a
                href={notice.source_url}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-1 inline-block pl-6 text-[12px] font-semibold underline"
                style={{ color: "var(--app-ink-2)" }}
              >
                Organizer&rsquo;s announcement
              </a>
            )}
          </div>
        );
      })()}

      {/* PLAIN TOOL header: no outer card. The category label, then the
       * heavy title, the approved venue photo when there is one, and the
       * decision facts as ruled rows (when, where, price, source) on the
       * white ground. The page's one filled coral action is in the action
       * row below. */}
      <header
        data-decision-impression="true"
        data-decision-surface="events"
        data-decision-entity="event"
        data-decision-id={event.slug}
        data-decision-position="detail"
        className="min-w-0 max-w-[720px]"
        style={{
          opacity: eventStatus === "cancelled" ? 0.85 : 1,
          viewTransitionName: `event-${event.slug}`,
        }}
      >
        <div className="relative min-w-0">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-3">
            <p className="text-[13px] font-semibold uppercase tracking-[0.06em]" style={{ color: "var(--app-ink-2)" }}>{cat?.name ?? "Event"}</p>
            <div className="flex shrink-0 items-center gap-1">
              <EventActions event={event} actions={["share"]} />
              <div className="hidden lg:block"><SaveButton refType="event" refId={event.slug} label={`Save ${eventDisplayTitle(event)}`} /></div>
            </div>
          </div>
          <h1 className="break-words text-[2rem] font-extrabold leading-[1.08] tracking-[-0.025em] sm:text-[2.5rem]" style={{ color: "var(--app-ink)" }}>{eventDisplayTitle(event)}</h1>
        </div>
        {photoVisual && <EventVenuePhoto visual={photoVisual} priority className="pt-4" />}
        <div className="space-y-4 pt-4">
          {/* Ruled fact rows. Each row is a short uppercase label and its
              value; hairlines separate them. WHEN leads, directly under the
              title, as the page's second-strongest element. */}
          <dl className="border-t" style={{ borderColor: "var(--app-border)" }}>
            <div className="grid grid-cols-[6rem_minmax(0,1fr)] gap-x-3 border-b py-3" style={{ borderColor: "var(--app-border)" }}>
              <dt className="pt-0.5 text-[13px] font-semibold uppercase tracking-[0.06em]" style={{ color: "var(--app-ink-2)" }}>When</dt>
              <dd className="min-w-0">
                <span className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
                  <span className="text-[1.0625rem] font-semibold leading-tight" style={{ color: "var(--app-ink)" }}>
                    {whenDate}
                  </span>
                  {whenTime && (
                    <span className="text-[15px] tabular-nums" style={{ color: "var(--app-ink)" }}>
                      {whenTime}
                    </span>
                  )}
                </span>
                {timeCaution && <span className="mt-1 block text-[13px] leading-relaxed" style={{ color: "var(--app-ink-2)" }}>{timeCaution}</span>}
                {event.is_recurring && event.recurrence_text && (
                  <span className="mt-1 block text-[13px] leading-snug" style={{ color: "var(--app-ink-2)" }}>{event.recurrence_text}</span>
                )}
                {saveCount !== null && (
                  <span className="mt-1 block text-[12px]" style={{ color: "var(--app-ink-3)" }}>
                    Saved {saveCount} times
                  </span>
                )}
              </dd>
            </div>
            {attendanceLabel && (
              <div className="grid grid-cols-[6rem_minmax(0,1fr)] gap-x-3 border-b py-3" style={{ borderColor: "var(--app-border)" }}>
                <dt className="pt-0.5 text-[13px] font-semibold uppercase tracking-[0.06em]" style={{ color: "var(--app-ink-2)" }}>{physicalAttendance ? "Where" : "Online"}</dt>
                <dd className="min-w-0 break-words text-[15px] leading-snug" style={{ color: "var(--app-ink)" }}>{attendanceLabel}</dd>
              </div>
            )}
            {(event.is_free || event.price_text) && (
              <div className="grid grid-cols-[6rem_minmax(0,1fr)] gap-x-3 border-b py-3" style={{ borderColor: "var(--app-border)" }}>
                <dt className="pt-0.5 text-[13px] font-semibold uppercase tracking-[0.06em]" style={{ color: "var(--app-ink-2)" }}>Price</dt>
                <dd className="min-w-0 break-words text-[15px] leading-snug tabular-nums" style={{ color: "var(--app-ink)" }}>{event.is_free ? "Free" : event.price_text}</dd>
              </div>
            )}
            {event.organizer && (
              <div className="grid grid-cols-[6rem_minmax(0,1fr)] gap-x-3 border-b py-3" style={{ borderColor: "var(--app-border)" }}>
                <dt className="pt-0.5 text-[13px] font-semibold uppercase tracking-[0.06em]" style={{ color: "var(--app-ink-2)" }}>Organizer</dt>
                <dd className="min-w-0 break-words text-[15px] leading-snug" style={{ color: "var(--app-ink)" }}>{event.organizer}</dd>
              </div>
            )}
            {communicationAccess.length > 0 && (
              // "Communication access" is wider than the 6rem label column, so
              // this one row puts its label above the value instead of
              // breaking the word. The captions glyph names ASL and
              // captioning, not wheelchair access.
              <div className="grid grid-cols-1 gap-y-1 border-b py-3" style={{ borderColor: "var(--app-border)" }}>
                <dt className="flex items-center gap-1.5 text-[13px] font-semibold uppercase tracking-[0.06em]" style={{ color: "var(--app-ink-2)" }}>
                  <Captions className="h-3.5 w-3.5 shrink-0" strokeWidth={2} aria-hidden />
                  Communication access
                </dt>
                <dd className="min-w-0">
                  <span className="block text-[15px] leading-snug" style={{ color: "var(--app-ink)" }}>{communicationAccess.join(" · ")}</span>
                  <span className="mt-0.5 block text-[12px]" style={{ color: "var(--app-ink-2)" }}>Shown only when stated by the event publisher.</span>
                </dd>
              </div>
            )}
            <div className="grid grid-cols-[6rem_minmax(0,1fr)] gap-x-3 border-b py-3" style={{ borderColor: "var(--app-border)" }}>
              <dt className="pt-0.5 text-[13px] font-semibold uppercase tracking-[0.06em]" style={{ color: "var(--app-ink-2)" }}>Source</dt>
              {/* Trust, freshness and the source link stack at every width,
                  as they do on phone, instead of running side by side. */}
              <dd className="flex min-w-0 flex-col items-start gap-y-1 text-xs" style={{ color: "var(--app-ink-2)" }}>
                <TrustChip signal={eventTrust(event)} detail />
                <FreshnessChip
                  iso={event.last_verified_at ?? undefined}
                  subject="Event"
                />
                {event.source_url && (desktopRowHasSourceLink
                  ? <span className="lg:hidden"><EventSourceLink href={event.source_url} /></span>
                  : <EventSourceLink href={event.source_url} />)}
              </dd>
            </div>
          </dl>
          {eventVisual?.presentation === "artwork" && <EventArtwork visual={eventVisual} />}
          {desc && (
            <div className="max-w-[68ch] text-[15px] leading-relaxed" style={{ color: "var(--app-ink-2)" }}>
              <p>{description.preview}</p>
              {description.rest ? (
                <details className="group mt-1">
                  <summary className="tap-44 inline-flex cursor-pointer list-none items-center gap-1 text-[13px] font-semibold [&::-webkit-details-marker]:hidden" style={{ color: "var(--app-link)" }}>
                    Read full description
                    <ChevronDown className="h-3.5 w-3.5 transition-transform group-open:rotate-180" strokeWidth={2} aria-hidden />
                  </summary>
                  <p className="pb-1">{description.rest}</p>
                </details>
              ) : null}
            </div>
          )}
        </div>
      </header>

      {eventStatus !== "scheduled" ? (
        (() => {
          // A cancelled/postponed event must not keep selling the plan
          // (July 2026 review): Tickets, Add-to-calendar, and Directions
          // all invite a trip that won't happen. The two honest actions
          // are the organizer's own word and a way back to tonight.
          const announceUrl = notice?.source_url ?? event.source_url ?? null;
          return (
            <div className={DESKTOP_ACTION_ROW}>
              <Link prefetch={false} href="/events?lens=today" className={DESKTOP_PRIMARY_CLASS} style={DESKTOP_PRIMARY_STYLE}>
                <Calendar className="h-[18px] w-[18px]" strokeWidth={1.75} style={DESKTOP_PRIMARY_ICON} aria-hidden />
                Find something else
              </Link>
              {announceUrl && (
                <a href={announceUrl} target="_blank" rel="noopener noreferrer" className={DESKTOP_QUIET_CLASS} style={DESKTOP_QUIET_STYLE}>
                  <ExternalLink className="h-[18px] w-[18px]" strokeWidth={1.75} style={DESKTOP_QUIET_ICON} aria-hidden />
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
            <div className={DESKTOP_ACTION_ROW}>
              <Link prefetch={false} href="/events?lens=today" className={DESKTOP_PRIMARY_CLASS} style={DESKTOP_PRIMARY_STYLE}>
                <Calendar className="h-[18px] w-[18px]" strokeWidth={1.75} style={DESKTOP_PRIMARY_ICON} aria-hidden />
                Find something else
              </Link>
              {recordAction && (recordAction.external ? (
                <a href={recordAction.href} target="_blank" rel="noopener noreferrer" className={DESKTOP_QUIET_CLASS} style={DESKTOP_QUIET_STYLE}>
                  <ExternalLink className="h-[18px] w-[18px]" strokeWidth={1.75} style={DESKTOP_QUIET_ICON} aria-hidden />
                  {recordAction.label}
                </a>
              ) : (
                <Link prefetch={false} href={recordAction.href} className={DESKTOP_QUIET_CLASS} style={DESKTOP_QUIET_STYLE}>
                  <MapPin className="h-[18px] w-[18px]" strokeWidth={1.75} style={DESKTOP_QUIET_ICON} aria-hidden />
                  {recordAction.label}
                </Link>
              ))}
            </div>
          );
        })()
      ) : (() => {
        // One clear primary in the action row (the old layout had three
        // equal-weight tiles = no primary). Priority for the accent fill:
        // Tickets -> RSVP -> Venue -> Official; if the event has none of those,
        // Directions is promoted so there's always exactly one lead action.
        const thirdAction =
          event.ticket_url ? { href: event.ticket_url, external: true, Icon: Ticket, label: "Tickets" } :
          event.rsvp_url ? { href: event.rsvp_url, external: true, Icon: ExternalLink, label: "RSVP" } :
          attendance !== "physical" && onlineActionUrl ? { href: onlineActionUrl, external: true, Icon: ExternalLink, label: "Online details" } :
          event.venue_place_slug ? { href: `/places/${event.venue_place_slug}`, external: false, Icon: MapPin, label: "Venue page" } :
          event.source_url ? { href: event.source_url, external: true, Icon: ExternalLink, label: "Official page" } :
          null;
        const hasThird = thirdAction !== null;
        const dirPrimary = physicalAttendance && hasPreciseLocation && !hasThird;


        return (
          <div className={DESKTOP_ACTION_ROW}>
            {/* The single filled action comes first, in reading order and on
                screen; the others follow as unboxed icon-and-label links. */}
            {thirdAction && (thirdAction.external ? (
              <a
                href={thirdAction.href}
                data-decision-action={
                  event.ticket_url
                    ? "ticket"
                    : event.rsvp_url
                      ? "reservation"
                      : "website"
                }
                target="_blank"
                rel="noopener noreferrer"
                className={DESKTOP_PRIMARY_CLASS}
                style={DESKTOP_PRIMARY_STYLE}
              >
                <thirdAction.Icon className="h-[18px] w-[18px]" strokeWidth={1.75} style={DESKTOP_PRIMARY_ICON} aria-hidden />
                {thirdAction.label}
              </a>
            ) : (
              <Link prefetch={false} href={thirdAction.href} data-decision-action="open" className={DESKTOP_PRIMARY_CLASS} style={DESKTOP_PRIMARY_STYLE}>
                <thirdAction.Icon className="h-[18px] w-[18px]" strokeWidth={1.75} style={DESKTOP_PRIMARY_ICON} aria-hidden />
                {thirdAction.label}
              </Link>
            ))}
            {physicalAttendance && hasPreciseLocation && directionsUrl && (
              <a
                href={directionsUrl}
                data-decision-action="directions"
                target="_blank"
                rel="noopener noreferrer"
                className={dirPrimary ? DESKTOP_PRIMARY_CLASS : DESKTOP_QUIET_CLASS}
                style={dirPrimary ? DESKTOP_PRIMARY_STYLE : DESKTOP_QUIET_STYLE}
              >
                <Navigation className="h-[18px] w-[18px]" strokeWidth={1.75} style={dirPrimary ? DESKTOP_PRIMARY_ICON : DESKTOP_QUIET_ICON} aria-hidden />
                Directions
              </a>
            )}
            {isLive ? (
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
              />
            ) : (
              <a href={icsUrl} download className={DESKTOP_QUIET_CLASS} style={DESKTOP_QUIET_STYLE}>
                <Calendar className="h-[18px] w-[18px]" strokeWidth={1.75} style={DESKTOP_QUIET_ICON} aria-hidden />
                Add to calendar
              </a>
            )}
          </div>
        );
      })()}

      {eventPlan.eligible && (
        <section
          aria-label="Plan this visit"
          className="border-y py-4"
          style={{ borderColor: "var(--app-border)" }}
        >
          <p className="text-sm leading-relaxed" style={{ color: "var(--app-ink-2)" }}>
            This plan reserves {eventPlanDuration} for the event. It can include one nearby stop when the hours fit.
          </p>
          <Link
            href={withBrowseReturnTo(
              `/plan?event=${encodeURIComponent(event.slug)}`,
              withBrowseReturnTo(`/events/${event.slug}`, returnTo),
            )}
            prefetch={false}
            className="tap-44 mt-1 inline-flex min-h-11 items-center gap-2 text-sm font-semibold underline underline-offset-4"
            style={{ color: "var(--app-link)" }}
          >
            Plan around this event
            <ArrowRight className="h-4 w-4" strokeWidth={1.75} aria-hidden />
          </Link>
        </section>
      )}

      {/* Smart pairings — the editorial decision layer the mobile
          review called out as the killer feature. Synthesizes
          weather at the event start, closest parking, and the
          nearest food spot into one card. Self-hides if none of
          the three signals are available. */}
      {physicalAttendance && hasPreciseLocation && eventStatus === "scheduled" && !hasEnded && !event.is_all_day && !isDateOnlyEventAnchor(event) && (
        <EventSmartPairings
          event={event}
          nearbyFood={nearbyFood}
          parkingDecision={null}
        />
      )}

      {/* Practical attendance context uses the same precise location as Directions. */}
      {physicalAttendance && hasPreciseLocation && (
        <div className="space-y-4">
          {eventStatus === "scheduled" && !hasEnded && (
            <GettingThere
              geom={pinGeom}
              venuePlaceSlug={event.venue_place_slug ?? undefined}
              geoPrecise
              parkingDecision={parkingDecision}
            />
          )}
          <VenueMiniMap geom={pinGeom} name={event.venue_name} />
        </div>
      )}

      {event.info && (event.info.admission || event.info.drinks || event.info.food) && (
        <section className="space-y-2">
          <h2 className="font-sans text-[20px] font-bold leading-tight tracking-[-0.02em]" style={{ color: "var(--app-ink)" }}>
            Good to know
          </h2>
          <ul
            className="divide-y border-y"
            style={{ borderColor: "var(--app-border)" }}
          >
            {event.info.admission && (
              <li className="flex items-start gap-3 py-2.5" style={{ borderColor: "var(--app-border)" }}>
                <Ticket className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={1.75} style={{ color: "var(--app-brand-text)" }} aria-hidden />
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: "var(--app-ink-3)" }}>Admission</p>
                  <p className="text-sm" style={{ color: "var(--app-ink-2)" }}>{event.info.admission}</p>
                </div>
              </li>
            )}
            {event.info.drinks && (
              <li className="flex items-start gap-3 py-2.5" style={{ borderColor: "var(--app-border)" }}>
                <Wine className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={1.75} style={{ color: "var(--app-brand-text)" }} aria-hidden />
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
                <Utensils className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={1.75} style={{ color: "var(--app-brand-text)" }} aria-hidden />
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
            className="font-sans text-[20px] font-bold leading-tight tracking-[-0.02em]"
            style={{ color: "var(--app-ink)" }}
          >
            Food trucks this week
          </h2>
          {/* Names are information, not controls: ruled rows, no capsules. */}
          <ul className="divide-y border-y" style={{ borderColor: "var(--app-border)" }}>
            {event.food_trucks.map((name) => (
              <li
                key={name}
                className="py-2.5 text-[15px] font-semibold"
                style={{ borderColor: "var(--app-border)", color: "var(--app-ink)" }}
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
            <h2 className="font-sans text-[20px] font-bold leading-tight tracking-[-0.02em]" style={{ color: "var(--app-ink)" }}>
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
              <summary className="tap-44 flex cursor-pointer list-none items-center justify-between text-[13px] font-semibold [&::-webkit-details-marker]:hidden" style={{ color: "var(--app-link)" }}>
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

      {/* More upcoming events — same-venue future when there are 2+,
          otherwise the next 6 county-wide. Sits below the Full lineup
          and primary "Good to know" content so the user has digested
          this event before being offered the next one. */}
      {moreUpcoming.items.length > 0 && (
        <section className="space-y-3">
          <div className="flex items-baseline justify-between gap-2">
            <h2
              className="font-sans text-[20px] font-bold leading-tight tracking-[-0.02em]"
              style={{ color: "var(--app-ink)" }}
            >
              {moreUpcoming.title}
            </h2>
            <Link
              prefetch={false}
              href="/events"
              className="tap-44 inline-flex items-center text-[12px] font-semibold"
              style={{ color: "var(--app-link)" }}
            >
              See all <ArrowRight aria-hidden className="ml-1 inline h-3.5 w-3.5 -translate-y-px" strokeWidth={2.25} />
            </Link>
          </div>
          <ul className="border-t" style={{ borderColor: "var(--app-border)" }}>
            {firstUpcoming.map((e) => (
              <li key={`${e.slug}-${e.starts_at}`}>
                {/* glance, not row: the unified pool arrives venue-thumb
                    decorated, so the section reads as a visual shelf now
                    instead of a text list. */}
                <EventCard event={e} variant="glance" />
              </li>
            ))}
          </ul>
          {remainingUpcoming.length > 0 ? (
            <details className="group">
              <summary className="tap-44 flex cursor-pointer list-none items-center justify-between text-[13px] font-semibold [&::-webkit-details-marker]:hidden" style={{ color: "var(--app-link)" }}>
                Show {remainingUpcoming.length} more
                <ChevronDown className="h-4 w-4 transition-transform group-open:rotate-180" strokeWidth={2} aria-hidden />
              </summary>
              <ul>
                {remainingUpcoming.map((e) => (
                  <li key={`${e.slug}-${e.starts_at}`}><EventCard event={e} variant="glance" /></li>
                ))}
              </ul>
            </details>
          ) : null}
        </section>
      )}

      {(nearbyFood.length > 0 || nearbyParking.length > 0) ? (
        <details className="group border-y" style={{ borderColor: "var(--app-border)" }}>
          <summary className="tap-44 flex cursor-pointer list-none items-center justify-between gap-3 py-2 text-[14px] font-semibold [&::-webkit-details-marker]:hidden" style={{ color: "var(--app-ink)" }}>
            More food &amp; parking nearby
            <ChevronDown className="h-4 w-4 transition-transform group-open:rotate-180" strokeWidth={2} style={{ color: "var(--app-ink-3)" }} aria-hidden />
          </summary>
          <div className="space-y-5 pb-4 pt-2">
            {nearbyFood.length > 0 ? (
              <section className="space-y-2.5">
                <h2 className="font-sans text-[20px] font-bold leading-tight tracking-[-0.02em]" style={{ color: "var(--app-ink)" }}>Eat &amp; drink nearby</h2>
                <ul className="border-t" style={{ borderColor: "var(--app-border)" }}>
                  {nearbyFood.map((p) => <li key={p.slug}><PlaceCard place={p} variant="row" /></li>)}
                </ul>
              </section>
            ) : null}
            {nearbyParking.length > 0 ? (
              <section className="space-y-2.5">
                <h2 className="font-sans text-[20px] font-bold leading-tight tracking-[-0.02em]" style={{ color: "var(--app-ink)" }}>Parking nearby</h2>
                <ul className="border-t" style={{ borderColor: "var(--app-border)" }}>
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
          grid above; this reuses the same .ics calendar button, ticket +
          directions links, and the SaveButton. The vermilion primary is
          Tickets when they exist, otherwise Add to calendar. A cancelled/
          postponed event gets the same replacement as the grid: the
          organizer's word + a way back to tonight (Save stays so a
          postponed event can be tracked for its new date). */}
      <MobileActionBar ariaLabel={`Actions for ${eventDisplayTitle(event)}`}>
        {eventStatus !== "scheduled" ? (
          <>
            {(notice?.source_url ?? event.source_url) && (
              <MobileBarLink
                href={notice?.source_url ?? event.source_url ?? ""}
                icon={ExternalLink}
                label="Announcement"
                ariaLabel={`Organizer's announcement for ${eventDisplayTitle(event)}`}
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
                ariaLabel={`Venue page for ${eventDisplayTitle(event)}`}
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
              barVariant={event.ticket_url || onlineActionUrl ? "quiet" : "primary"}
              // The short visible label keeps four cells inside a 320px bar;
              // the button's accessible name stays "Add to calendar".
              label="Calendar"
            />
            {event.ticket_url && (
              <MobileBarLink
                href={event.ticket_url}
                icon={Ticket}
                label="Tickets"
                ariaLabel={`Tickets for ${eventDisplayTitle(event)}`}
                external
                primary
                decisionAction="ticket"
              />
            )}
            {!event.ticket_url && attendance !== "physical" && onlineActionUrl && (
              <MobileBarLink
                href={onlineActionUrl}
                icon={ExternalLink}
                label="Online details"
                ariaLabel={`Online details for ${eventDisplayTitle(event)}`}
                external
                primary
                decisionAction="website"
              />
            )}
            {physicalAttendance && hasPreciseLocation && directionsUrl && (
              <MobileBarLink
                href={directionsUrl}
                icon={Navigation}
                label="Directions"
                ariaLabel={`Directions to ${event.venue_name || event.title}`}
                external
                decisionAction="directions"
              />
            )}
          </>
        )}
        <SaveButton refType="event" refId={event.slug} label={`Save ${eventDisplayTitle(event)}`} barLabel="Save" />
      </MobileActionBar>
    </div>
  );
}

/* The desktop action row matches the place page: one filled Deep Coral
   action, then unboxed icon-and-label links on the page ground. Each keeps a
   48px target. */
const DESKTOP_ACTION_ROW = "hidden flex-wrap items-center gap-x-6 gap-y-1 lg:flex";
const DESKTOP_PRIMARY_CLASS = "tap-44 flex min-h-12 items-center justify-center gap-2 rounded-[var(--app-radius-md)] px-4 text-[15px] font-semibold";
const DESKTOP_PRIMARY_STYLE = { background: "var(--app-brand-press)", color: "var(--app-on-brand)" };
const DESKTOP_PRIMARY_ICON = { color: "var(--app-on-brand)" };
const DESKTOP_QUIET_CLASS = "tap-44 flex min-h-12 items-center justify-start gap-2 px-1 text-[15px] font-semibold hover:underline";
const DESKTOP_QUIET_STYLE = { color: "var(--app-ink)" };
const DESKTOP_QUIET_ICON = { color: "var(--app-ink-2)" };
