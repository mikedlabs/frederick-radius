import type { EventWithMeta } from "@/lib/loaders/events";
import { buildHorizonBounds, isRangeListing } from "@/lib/eventHorizon";
import { isDateOnlyEventAnchor, isEventEnded, isEventLiveNow } from "@/lib/eventWhenLabel";
import { hasPhysicalAttendance, hasRecommendationAttendance, isLikelyEventActionUrl } from "@/lib/events/attendance";
import { isPublicEvent } from "@/lib/events/classify";
import { eventDecisionLocation, eventDecisionTime } from "@/lib/events/decision-facts";
import { eventDecisionVerification } from "@/lib/events/decision-verification";
import { eventLeadTier, rankRecommendations } from "@/lib/events/lead-rank";
import { eventSourceLabel } from "@/lib/events/source-label";
import { EVENT_TZ, formatEventDate } from "@/lib/format/eventTime";
import { directionsHref } from "@/lib/map/directionsHref";
import { OWNED_PLACE_PHOTOS } from "@/lib/owned-place-photos";
import { easternDayKey, easternWallToUtcISO } from "@/lib/tz";

export type GuidePhoto = { src: string; alt: string; width: number; height: number };
export type GuideAction = { label: string; href: string };

export type GuideStop = {
  title: string;
  when: string;
  where: string;
  description: string;
  action: GuideAction;
  source: GuideAction;
  detail?: string;
};

export type LocalOutingGuide = {
  title: string;
  summary: string;
  scopeLabel: string;
  photo: GuidePhoto;
  photoCaption: string;
  stops: GuideStop[];
  note?: string;
  secondaryAction?: GuideAction;
};

export const downtownGuide: LocalOutingGuide = {
  title: "Two Hours Downtown",
  summary: "Park once, see local art, and follow Carroll Creek to the painted Community Bridge.",
  scopeLabel: "Downtown Frederick",
  photo: OWNED_PLACE_PHOTOS["carroll-creek-linear-park-frederick"],
  photoCaption: "Carroll Creek in downtown Frederick.",
  note: "Start between 9 AM and 3 PM Monday through Saturday, or between 11 AM and 3 PM on Sunday. If it rains, spend the creek portion at the galleries or the Visitor Center exhibits instead. Allow 15 minutes in total for parking and walking between stops. Details checked with the listed sources on Nov 16, 2026.",
  stops: [
    {
      title: "Park at East All Saints",
      when: "Open 24 hours",
      where: "125 E All Saints St, Frederick",
      description: "The garage is beside the Delaplaine. Start here and return after the creek walk.",
      detail: "The city lists accessible spaces on every level. If the garage is full, try Carroll Creek Garage at 44 E Patrick St.",
      action: { label: "Directions to parking", href: directionsHref(39.4118117, -77.4072907) },
      source: { label: "City parking information", href: "https://www.cityoffrederickmd.gov/1873/Parking-FAQs" },
    },
    {
      title: "Frederick Visitor Center",
      when: "20 minutes · Daily, 9 AM–5 PM",
      where: "151 S East St, Frederick",
      description: "Pick up a downtown map and visit the exhibits in a former industrial warehouse.",
      detail: "There is an accessible restroom. Visitors from outside Frederick County can ask here to validate up to three hours at East All Saints. Check the Visitor Center page for holiday closures.",
      action: { label: "Directions to the Visitor Center", href: "https://www.google.com/maps/dir/?api=1&destination=151+S+East+St,+Frederick,+MD&travelmode=walking" },
      source: { label: "Visit Frederick", href: "https://www.visitfrederick.org/plan-your-visit/visitor-center/" },
    },
    {
      title: "The Delaplaine Arts Center",
      when: "40 minutes · Mon–Sat, 9 AM–5 PM · Sun, 11 AM–5 PM",
      where: "40 S Carroll St, Frederick",
      description: "Admission is free. Browse the galleries or make something at an art cart.",
      detail: "Gallery hours differ on holidays. The center lists mobility-device access in public areas, with an exception for motorized scooters.",
      action: { label: "See current exhibitions", href: "https://delaplaine.org/exhibitions/" },
      source: { label: "Delaplaine visitor information", href: "https://delaplaine.org/visit/" },
    },
    {
      title: "Carroll Creek and Community Bridge",
      when: "45 minutes · Park open dawn–10 PM",
      where: "From S Carroll St toward S Market St and back",
      description: "Look for William Cochran’s painted stonework on Community Bridge, then follow the creek toward South Market Street. Turn back whenever you’re ready.",
      detail: "The city lists benches and walking paths. Use the restroom at the Visitor Center before leaving for the creek.",
      action: { label: "See the creek on Map", href: "/map?in=frederick&place=carroll-creek-linear-park-frederick" },
      source: { label: "City of Frederick park information", href: "https://www.cityoffrederickmd.gov/facilities/Facility/Details/86" },
    },
  ],
};

type EditionPick = Omit<GuideStop, "when"> & {
  sessions: { through: number; when: string }[];
};

const firstFriday = Date.parse(easternWallToUtcISO(2026, 11, 20, 17, 0));
const firstSaturday = new Date(easternWallToUtcISO(2026, 11, 21, 0, 0));

// Reviewed against the linked organizer and destination pages on November 16.
// The concert publisher did not list an end, so retire the pick at showtime.
const firstEdition: EditionPick[] = [
  {
    title: "Sailing Through the Winter Solstice launch",
    where: "Carroll Creek Park, Frederick",
    description: "Watch crews lower the lighted boats into Carroll Creek from the suspension bridge.",
    detail: "Free admission. The launch uses heavy machinery, so watch from the designated viewing areas. Come back near dusk to see the boats light up.",
    action: { label: "See launch details", href: "https://www.visitfrederick.org/event/launch-day-%7C-sailing-through-the-winter-solstice/17638/" },
    source: { label: "Visit Frederick", href: "https://www.visitfrederick.org/event/launch-day-%7C-sailing-through-the-winter-solstice/17638/" },
    sessions: [{ when: "Sat, Nov 21 · 8–11 AM", through: Date.parse(easternWallToUtcISO(2026, 11, 21, 11, 0)) }],
  },
  {
    title: "Valley Craft Network Studio Tour",
    where: "Middletown and Pleasant Valley studios",
    description: "Meet working artists on a free, self-guided driving tour. Pick a few studios from the organizer’s map before setting out.",
    detail: "One Frederick County stop is Willow Oaks Craft Cider and Wine at 6219 Harley Rd in Middletown. The tour also reaches studios outside the county.",
    action: { label: "Choose studios from the tour map", href: "https://www.valleycraftnetwork.org/download-brochuremap-pdf" },
    source: { label: "Valley Craft Network", href: "https://www.valleycraftnetwork.org/" },
    sessions: [
      { when: "Sat, Nov 21 · 10 AM–5 PM", through: Date.parse(easternWallToUtcISO(2026, 11, 21, 17, 0)) },
      { when: "Sun, Nov 22 · 10 AM–5 PM", through: Date.parse(easternWallToUtcISO(2026, 11, 22, 17, 0)) },
    ],
  },
  {
    title: "A Motown Christmas",
    where: "Weinberg Center for the Arts, 20 W Patrick St, Frederick",
    description: "Hear vocalists from the Miracles and the Contours perform Motown and holiday songs with a six-piece band.",
    detail: "The theater lists standard tickets at $52–$64. Check the theater’s page for available seats.",
    action: { label: "Check tickets at the Weinberg", href: "https://weinbergcenter.org/shows/a-motown-christmas-2026/" },
    source: { label: "Weinberg Center for the Arts", href: "https://weinbergcenter.org/shows/a-motown-christmas-2026/" },
    sessions: [{ when: "Sat, Nov 21 · 8 PM", through: Date.parse(easternWallToUtcISO(2026, 11, 21, 20, 0)) }],
  },
];

function usableWeekendEvent(event: EventWithMeta, bounds: ReturnType<typeof buildHorizonBounds>, now: Date): boolean {
  const start = Date.parse(event.starts_at);
  if (!(start >= bounds.weekendStart && start < bounds.weekendEnd)) return false;
  if (
    !isPublicEvent(event) ||
    !hasPhysicalAttendance(event) ||
    !hasRecommendationAttendance(event) ||
    eventLeadTier(event) !== 0 ||
    isRangeListing(event) ||
    isDateOnlyEventAnchor(event) ||
    !isLikelyEventActionUrl(event.source_url)
  ) return false;

  const canStillGo = event.is_all_day || start > bounds.now || isEventLiveNow(event, now);
  return canStillGo && !isEventEnded(event, now) && eventDecisionVerification(event, now).sourceVerified;
}

function stopForEvent(event: EventWithMeta): GuideStop {
  const source = { label: eventSourceLabel(event.source, event.organizer), href: event.source_url!.trim() };
  return {
    title: event.title,
    when: `${formatEventDate(event.starts_at)} · ${eventDecisionTime(event)}`,
    where: eventDecisionLocation(event),
    description: event.description,
    detail: event.price_text?.trim() || (event.is_free ? "Free admission." : undefined),
    action: { label: "Check event details", href: source.href },
    source,
  };
}

const weekendDate = new Intl.DateTimeFormat("en-US", {
  timeZone: EVENT_TZ,
  month: "short",
  day: "numeric",
});

function firstEditionStops(now: number, events: readonly EventWithMeta[]): GuideStop[] {
  const notices = events.filter((event) => (
    (event.status === "cancelled" || event.status === "postponed") &&
    Number.isFinite(Date.parse(event.starts_at))
  ));

  return firstEdition.flatMap(({ sessions, ...stop }) => {
    const remaining = sessions.filter((session) => (
      session.through > now && !notices.some((event) => (
        (event.title.toLowerCase() === stop.title.toLowerCase() || event.source_url === stop.source.href) &&
        easternDayKey(new Date(event.starts_at)) === easternDayKey(new Date(session.through))
      ))
    ));
    return remaining.length ? [{ ...stop, when: remaining.map((session) => session.when).join(" · ") }] : [];
  });
}

export function weekendGuide(now: Date, verifiedEvents: readonly EventWithMeta[] = []): LocalOutingGuide {
  const bounds = buildHorizonBounds(now);
  const isFirstEdition = bounds.weekendStart === firstFriday;
  const weekendLabel = weekendDate.formatRange(
    isFirstEdition ? firstSaturday : new Date(bounds.weekendStart),
    new Date(bounds.weekendEnd - 1),
  );
  let stops: GuideStop[];

  if (isFirstEdition) {
    stops = firstEditionStops(bounds.now, verifiedEvents);
  } else {
    const seen = new Set<string>();
    const choices = rankRecommendations(verifiedEvents.filter((event) => usableWeekendEvent(event, bounds, now)), { limit: 3 });
    stops = [];
    for (const event of choices) {
      const titleKey = event.title.trim().toLowerCase();
      if (seen.has(titleKey)) continue;
      seen.add(titleKey);
      stops.push(stopForEvent(event));
      if (stops.length === 3) break;
    }
  }

  return {
    title: "This Weekend",
    summary: stops.length
      ? "Find a weekend outing and check the time, location, and source before you go."
      : "We don’t have any confirmed guide picks for these dates. Browse Events for more listings.",
    scopeLabel: `Whole county · ${weekendLabel}`,
    photo: OWNED_PLACE_PHOTOS["st-john-the-evangelist-catholic-church-frederick"],
    photoCaption: "East Church Street in Frederick at sunset.",
    stops,
    note: stops.length
      ? isFirstEdition
        ? "Schedules checked with the listed sources on Nov 16, 2026. Check the source for changes before heading out."
        : "Check the listed source for changes before heading out."
      : undefined,
    secondaryAction: { label: "Browse weekend events", href: "/events?in=county&lens=weekend" },
  };
}
