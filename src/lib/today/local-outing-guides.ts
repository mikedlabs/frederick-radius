import type { EventWithMeta } from "@/lib/loaders/events";
import { CITY_HOLIDAY_PARKING_URL, PARKING_RATE_SCHEDULE } from "@/data/parking-garages";
import { FROSTY_FRIDAY, TENTH_WARD_CONCERT, isTenthWardConcert, type HolidayGuideStatus } from "@/data/thanksgiving-events";
import { CREDITED_LOCAL_PLACE_PHOTOS } from "@/data/credited-local-place-photos";
import { HISTORY_BY_SLUG, type HistoryImage } from "@/data/history";
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
import { getOwnedPlacePhoto, OWNED_PLACE_PHOTOS, type OwnedPlacePhoto } from "@/lib/owned-place-photos";
import { easternDayKey, easternParts, easternWallToUtcISO } from "@/lib/tz";

export type GuidePhoto = Omit<OwnedPlacePhoto, "kind" | "referenceContext"> & {
  credit?: Omit<HistoryImage, "src" | "alt">;
};
export type GuideAction = { label: string; href: string };
export type RouteTimePreview = { stops: { title: string; minutes: number }[]; allowanceMinutes: number };

type StopPhoto = GuidePhoto & {
  caption: string;
};

export type GuideStop = {
  title: string;
  anchor?: string;
  routeName?: string;
  timeLabel?: string;
  timing?: Pick<EventWithMeta, "starts_at" | "ends_at" | "published_time" | "status" | "source" | "is_all_day">;
  when: string;
  suggestedMinutes?: number;
  where: string;
  description: string;
  action: GuideAction;
  source: GuideAction;
  detail?: string;
  visitTip?: string;
  statusNote?: string;
  tipSource?: GuideAction;
  price?: string;
  icon?: "parking" | "info" | "art" | "water";
  photo?: StopPhoto;
};

export type LocalOutingGuide = {
  title: string;
  summary?: string;
  scopeLabel: string;
  photo: GuidePhoto;
  photoCaption: string;
  stops: GuideStop[];
  stopLayout?: "choices";
  route?: { firstAction: GuideAction; durationLabel: string; allowanceMinutes: number; teaser: string };
  note?: string;
  secondaryAction?: GuideAction;
  notice?: { heading: string; text: string; sources: GuideAction[]; active?: boolean };
};

const delaplainePhoto = CREDITED_LOCAL_PLACE_PHOTOS["delaplaine-arts-center-frederick"].image;
const weinbergPhoto = CREDITED_LOCAL_PLACE_PHOTOS["weinberg-center-for-the-arts-frederick"].image;
const bridgePhoto = HISTORY_BY_SLUG["carroll-creek-park"].image!;

type DowntownGuide = LocalOutingGuide & { route: NonNullable<LocalOutingGuide["route"]> };

const garageDirections = { label: "Directions to East All Saints garage", href: directionsHref(39.4118117, -77.4072907, "driving") };

export const downtownGuide: DowntownGuide = {
  title: "Two Hours Downtown",
  summary: "Visit the galleries in a former mill, then find the painted stonework on Community Bridge.",
  route: {
    firstAction: garageDirections,
    durationLabel: "About 2 hours",
    allowanceMinutes: 15,
    teaser: "See free galleries and walk Carroll Creek. Start at East All Saints garage.",
  },
  scopeLabel: "Downtown Frederick",
  photo: {
    src: bridgePhoto.src,
    alt: bridgePhoto.alt ?? "The brick promenade beside Carroll Creek, looking toward Community Bridge.",
    width: 1280,
    height: 921,
    credit: bridgePhoto,
  },
  photoCaption: "Carroll Creek near Community Bridge",
  note: "Start between 9 AM and 3 PM Monday through Saturday, or between 11 AM and 3 PM on Sunday. Start earlier on short winter days if you want daylight at the creek. If it rains, spend the creek portion at the galleries or the Visitor Center exhibits instead. On Sunday, 11 AM–1 PM fits both the gallery hours and the free garage window. Hours and parking checked Nov 24, 2026.",
  stops: [
    {
      title: "Park at East All Saints",
      anchor: "east-all-saints-garage",
      routeName: "East All Saints Street Garage",
      when: "Open 24 hours",
      where: "125 E All Saints St, Frederick",
      icon: "parking",
      price: `${PARKING_RATE_SCHEDULE.hourly} · Free Sundays, 8 AM–2 PM`,
      description: "The garage is beside the Delaplaine. Start here and return after the creek walk.",
      detail: "The city lists accessible spaces on every level. If the garage is full, try Carroll Creek Garage at 44 E Patrick St.",
      action: { label: "Garage rates and payment", href: "https://cityoffrederickmd.gov/1342/Garage-Parking" },
      source: { label: "City parking information", href: "https://www.cityoffrederickmd.gov/1873/Parking-FAQs" },
    },
    {
      title: "Frederick Visitor Center",
      anchor: "visitor-center",
      routeName: "Frederick Visitor Center",
      timeLabel: "Visitor Center",
      suggestedMinutes: 20,
      when: "Daily, 9 AM–5 PM",
      where: "151 S East St, Frederick",
      icon: "info",
      description: "Pick up a downtown map and visit the exhibits in a former industrial warehouse.",
      detail: "There is an accessible restroom. Visitors from outside Frederick County can ask here to validate up to three hours at East All Saints. Check the Visitor Center page for holiday closures.",
      action: { label: "Directions to the Visitor Center", href: "https://www.google.com/maps/dir/?api=1&destination=151+S+East+St,+Frederick,+MD&travelmode=walking" },
      source: { label: "Visit Frederick", href: "https://www.visitfrederick.org/plan-your-visit/visitor-center/" },
    },
    {
      title: "The Delaplaine Arts Center",
      anchor: "delaplaine",
      routeName: "The Delaplaine Arts Center",
      timeLabel: "Delaplaine",
      suggestedMinutes: 40,
      when: "Mon–Sat, 9 AM–5 PM · Sun, 11 AM–5 PM",
      where: "40 S Carroll St, Frederick",
      price: "Free admission",
      photo: { ...delaplainePhoto, width: 1280, height: 833, caption: "The Delaplaine exterior", credit: delaplainePhoto },
      description: "Browse the galleries or make something at an art cart.",
      detail: "Gallery hours differ on holidays. The center lists mobility-device access in public areas, with an exception for motorized scooters.",
      action: { label: "See current exhibitions", href: "https://delaplaine.org/exhibitions/" },
      source: { label: "Delaplaine visitor information", href: "https://delaplaine.org/visit/" },
      tipSource: { label: "History of the mill", href: "https://delaplaine.org/about/" },
    },
    {
      title: "Carroll Creek and Community Bridge",
      anchor: "carroll-creek",
      routeName: "Carroll Creek & Community Bridge",
      timeLabel: "Carroll Creek",
      suggestedMinutes: 45,
      when: "Dawn–10 PM",
      where: "From S Carroll St toward S Market St and back",
      description: "Look for William Cochran’s painted stonework on Community Bridge, then follow the creek toward South Market Street. Turn back whenever you’re ready.",
      detail: "The city lists benches and walking paths. Use the restroom at the Visitor Center before leaving for the creek.",
      action: { label: "See the creek on Map", href: "/map?in=frederick&place=carroll-creek-linear-park-frederick" },
      source: { label: "City of Frederick park information", href: "https://www.cityoffrederickmd.gov/facilities/Facility/Details/86" },
    },
  ],
};

export function downtownGuideForDate(now: Date): DowntownGuide {
  const day = easternDayKey(now);
  if (day < "2026-11-23" || day > "2026-11-29") return downtownGuide;
  const [garage, visitorCenter, galleries, creek] = downtownGuide.stops;
  const holidayParking = { label: "City holiday parking schedule", href: CITY_HOLIDAY_PARKING_URL };
  const holidayGarage: GuideStop = {
    ...garage,
    price: "Free Thu, Nov 26 through Sun, Nov 29",
    tipSource: holidayParking,
  };
  const notice = {
    heading: "Thanksgiving · Thu, Nov 26",
    text: "The Visitor Center and Delaplaine galleries close for Thanksgiving. The creek walk is outdoors. City garage parking is free Nov 26–29.",
    sources: [
      { label: "Visitor Center hours", href: visitorCenter.source.href },
      { label: "Gallery hours", href: galleries.source.href },
      holidayParking,
    ],
  };
  if (day < "2026-11-26") return { ...downtownGuide, notice };
  if (day > "2026-11-26") return { ...downtownGuide, stops: [holidayGarage, visitorCenter, galleries, creek] };
  return {
    ...downtownGuide,
    title: "Thanksgiving Creek Walk",
    summary: "Walk from East All Saints garage to Community Bridge and along Carroll Creek, then return the same way.",
    route: {
      firstAction: garageDirections,
      durationLabel: "About 1 hour",
      allowanceMinutes: 15,
      teaser: "Park free at East All Saints garage for an hour outdoors along Carroll Creek.",
    },
    notice: { ...notice, active: true },
    note: "Choose a daytime start if you want to see the painted bridge in daylight. The Visitor Center restrooms are closed on Thanksgiving.",
    stops: [
      holidayGarage,
      { ...creek, detail: "Follow the paved creek path toward South Market Street and return to the garage the same way. The City lists benches along the path." },
    ],
  };
}

/** A daytime walk is a useful plan for the following day once its recommended
 * start window ends. Use noon UTC to advance the local calendar day across DST. */
function nextFrederickDay(now: Date): Date {
  const noon = new Date(`${easternDayKey(now)}T12:00:00Z`);
  noon.setUTCDate(noon.getUTCDate() + 1);
  return noon;
}

export function routeTimePreview(stops: GuideStop[], allowanceMinutes: number): RouteTimePreview {
  return {
    allowanceMinutes,
    stops: stops.flatMap(stop => stop.suggestedMinutes ? [{ title: stop.timeLabel ?? stop.title, minutes: stop.suggestedMinutes }] : []),
  };
}

export function downtownFeatureForToday(now: Date) {
  const tomorrow = easternParts(now).hour >= 15;
  const visit = tomorrow ? nextFrederickDay(now) : now;
  const guide = downtownGuideForDate(visit);
  return {
    downtown: "/images/seasons/summer/SUMMER CARROL CREEK.jpg",
    downtownTitle: guide.title,
    routePreview: routeTimePreview(guide.stops, guide.route.allowanceMinutes),
    downtownTeaser: guide.route.teaser,
    downtownWhen: tomorrow ? "Tomorrow" : "Daytime walk",
    downtownHref: tomorrow ? `/today/two-hours-downtown?day=${easternDayKey(visit)}` : "/today/two-hours-downtown",
  };
}

export function downtownGuideForVisit(now: Date, requestedDay?: string | string[]): DowntownGuide {
  const tomorrow = nextFrederickDay(now);
  const visit = requestedDay === easternDayKey(tomorrow) ? tomorrow : now;
  const guide = downtownGuideForDate(visit);
  return { ...guide, scopeLabel: `Downtown Frederick · ${formatEventDate(visit.toISOString())}` };
}

type EditionPick = Omit<GuideStop, "when"> & {
  sessions: { through: number; when: string }[];
};

const firstFriday = Date.parse(easternWallToUtcISO(2026, 11, 20, 17, 0));
const firstSaturday = new Date(easternWallToUtcISO(2026, 11, 21, 0, 0));
const boatLaunchEnd = Date.parse(easternWallToUtcISO(2026, 11, 21, 11, 0));
const boatSaturdayVisitEnd = Date.parse(easternWallToUtcISO(2026, 11, 21, 22, 0));
const boatSundayVisitEnd = Date.parse(easternWallToUtcISO(2026, 11, 22, 22, 0));
const boatLightsSource = { label: "Color on the Creek", href: "https://coloronthecreek.com/sttws/" };

function eveningBoatVisit(now: number): GuideStop {
  return {
    title: "See the lighted boats after dark",
    when: now < boatSaturdayVisitEnd ? "Sat or Sun · After 5:20 PM" : "Sun · After 5:20 PM",
    where: "Carroll Creek between Market Street and Carroll Street",
    icon: "water",
    price: "Free to view",
    visitTip: "Start at East All Saints Garage, 125 E All Saints St.",
    description: "The organizer lights the boats from dusk. Around 5:20 PM is a suggested arrival after twilight.",
    detail: "The city lists the park as open until 10 PM. Check the organizer for changes.",
    action: { label: "See the boats on Map", href: "/map?in=frederick&place=carroll-creek-linear-park-frederick" },
    source: boatLightsSource,
    tipSource: { label: "City garage locations", href: "https://cityoffrederickmd.gov/1342/Garage-Parking" },
  };
}

export function weekendGuideCover(now: Date): Pick<LocalOutingGuide, "photo" | "photoCaption"> {
  if (buildHorizonBounds(now).weekendStart === firstFriday) {
    return {
      photo: {
        src: "/images/seasons/winter/WINTER BOATS.jpg",
        alt: "A line of illuminated sailboats on Carroll Creek, seen from above on a snowy morning.",
        width: 1920,
        height: 1079,
      },
      photoCaption: "Lighted boats on Carroll Creek in January 2022.",
    };
  }
  return {
    photo: OWNED_PLACE_PHOTOS["st-john-the-evangelist-catholic-church-frederick"],
    photoCaption: "East Church Street in Frederick at sunset.",
  };
}

// Reviewed against the linked organizer and destination pages on November 16.
// The concert publisher did not list an end, so retire the pick at showtime.
const firstEdition: EditionPick[] = [
  {
    title: "Sailing Through the Winter Solstice launch",
    where: "Carroll Creek Park, Frederick",
    icon: "water",
    price: "Free admission",
    visitTip: "Miss the launch? Aim for 5:20 PM to see the boats lit between Market and Carroll streets.",
    tipSource: boatLightsSource,
    description: "Watch crews lower the lighted boats into Carroll Creek from the suspension bridge.",
    detail: "The launch uses heavy machinery, so watch from the designated viewing areas. Come back near dusk to see the boats light up.",
    action: { label: "See launch details", href: "https://www.visitfrederick.org/event/launch-day-%7C-sailing-through-the-winter-solstice/17638/" },
    source: { label: "Visit Frederick", href: "https://www.visitfrederick.org/event/launch-day-%7C-sailing-through-the-winter-solstice/17638/" },
    sessions: [{ when: "Sat, Nov 21 · 8–11 AM", through: boatLaunchEnd }],
  },
  {
    title: "Valley Craft Network Studio Tour",
    where: "Middletown and Pleasant Valley studios",
    price: "Free tour",
    icon: "art",
    visitTip: "At Willow Oaks, see handmade jewelry and small-batch cider in one stop.",
    description: "Meet working artists on a self-guided driving tour. Pick a few studios from the organizer’s map before setting out.",
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
    price: "$52–$64 standard tickets",
    photo: { ...weinbergPhoto, width: 1280, height: 960, caption: "The Weinberg Center exterior", credit: weinbergPhoto },
    description: "Hear vocalists from the Miracles and the Contours perform Motown and holiday songs with a six-piece band.",
    detail: "Check the theater’s page for available seats.",
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
  const venuePhoto = event.venue_place_slug ? getOwnedPlacePhoto(event.venue_place_slug) : null;
  return {
    title: event.title,
    timing: { starts_at: event.starts_at, ends_at: event.ends_at, published_time: event.published_time,
      status: event.status, source: event.source, is_all_day: event.is_all_day },
    when: `${formatEventDate(event.starts_at)} · ${eventDecisionTime(event)}`,
    where: eventDecisionLocation(event),
    description: event.description,
    price: event.price_text?.trim() || (event.is_free ? "Free admission" : undefined),
    photo: venuePhoto && venuePhoto.referenceContext !== "appearance-unverified"
      ? { ...venuePhoto, caption: "Venue photograph" }
      : undefined,
    action: { label: "Check event details", href: source.href },
    source,
  };
}

const thanksgivingFriday = Date.parse(easternWallToUtcISO(2026, 11, 27, 17, 0));
const thanksgivingEdition: EditionPick[] = [
  {
    title: FROSTY_FRIDAY.title,
    timing: { starts_at: FROSTY_FRIDAY.startsAt, ends_at: FROSTY_FRIDAY.endsAt, published_time: "range", source: "manual" },
    where: "Downtown Frederick",
    description: "Browse downtown shops and hear live holiday music. Check the organizer’s schedule to choose a time and meeting spot.",
    visitTip: "City garages and on-street parking are free on Frosty Friday.",
    tipSource: { label: "City holiday parking schedule", href: CITY_HOLIDAY_PARKING_URL },
    action: { label: "See the Frosty Friday schedule", href: FROSTY_FRIDAY.url },
    source: { label: "Downtown Frederick Partnership", href: FROSTY_FRIDAY.url },
    sessions: [{ when: "Fri, Nov 27 · 9 AM–9 PM", through: Date.parse(FROSTY_FRIDAY.endsAt) }],
  },
  {
    title: TENTH_WARD_CONCERT.title,
    timing: { starts_at: TENTH_WARD_CONCERT.startsAt, ends_at: TENTH_WARD_CONCERT.endsAt, published_time: "range", source: "manual" },
    where: "Tenth Ward Distilling Company, 55 E Patrick St, Frederick",
    description: "Hear the Brahman Noodles play live at Tenth Ward on Friday evening.",
    action: { label: "See the performance details", href: TENTH_WARD_CONCERT.url },
    source: { label: "Tenth Ward Distilling Company", href: TENTH_WARD_CONCERT.url },
    sessions: [{ when: "Fri, Nov 27 · 8–10 PM", through: Date.parse(TENTH_WARD_CONCERT.endsAt) }],
  },
];

const weekendDate = new Intl.DateTimeFormat("en-US", {
  timeZone: EVENT_TZ,
  month: "short",
  day: "numeric",
});

function editionStops(picks: EditionPick[], now: number, events: readonly EventWithMeta[]): GuideStop[] {
  const notices = events.filter((event) => (
    (event.status === "cancelled" || event.status === "postponed") &&
    Number.isFinite(Date.parse(event.starts_at))
  ));

  return picks.flatMap(({ sessions, ...stop }) => {
    const remaining = sessions.filter((session) => (
      session.through > now && !notices.some((event) => (
        (event.title.toLowerCase() === stop.title.toLowerCase() || event.source_url === stop.source.href ||
          (stop.source.href === TENTH_WARD_CONCERT.url && isTenthWardConcert(event))) &&
        easternDayKey(new Date(event.starts_at)) === easternDayKey(new Date(session.through))
      ))
    ));
    return remaining.length ? [{ ...stop, when: remaining.map((session) => session.when).join(" · ") }] : [];
  });
}

export function weekendGuideDateLabel(now: Date): string {
  const bounds = buildHorizonBounds(now);
  return weekendDate.formatRange(
    bounds.weekendStart === firstFriday ? firstSaturday : new Date(bounds.weekendStart),
    new Date(bounds.weekendEnd - 1),
  );
}

export function weekendGuide(now: Date, verifiedEvents: readonly EventWithMeta[] = [], holidayStatus: HolidayGuideStatus = {}): LocalOutingGuide {
  const bounds = buildHorizonBounds(now);
  const isFirstEdition = bounds.weekendStart === firstFriday;
  let stops: GuideStop[];

  if (isFirstEdition) {
    stops = editionStops(firstEdition, bounds.now, verifiedEvents);
    if (bounds.now >= boatLaunchEnd && bounds.now < boatSundayVisitEnd) {
      stops.unshift(eveningBoatVisit(bounds.now));
    }
  } else {
    const holidayWeekend = bounds.weekendStart === thanksgivingFriday;
    stops = holidayWeekend ? editionStops(thanksgivingEdition, bounds.now, verifiedEvents).flatMap((stop) => {
      const status = holidayStatus[stop.source.href];
      if (status === "withdrawn") return [];
      if (status === "scheduled") return [stop];
      return [{ ...stop, statusNote: "Schedule checked Nov 24. Confirm with the organizer before leaving." }];
    }) : [];
    const seen = new Set(stops.map((stop) => stop.title.toLowerCase()));
    const choices = rankRecommendations(verifiedEvents.filter((event) => {
      if (holidayWeekend && (isTenthWardConcert(event) || event.source_url === FROSTY_FRIDAY.url || event.title.trim().toLowerCase() === FROSTY_FRIDAY.title.toLowerCase())) return false;
      return usableWeekendEvent(event, bounds, now);
    }), { limit: 3 });
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
    stopLayout: "choices",
    summary: stops.length ? undefined : "We don’t have any confirmed guide picks for these dates. Browse Events for more listings.",
    scopeLabel: `Whole county · ${weekendGuideDateLabel(now)}`,
    ...weekendGuideCover(now),
    stops,
    note: stops.length
      ? isFirstEdition
        ? "Schedules checked with the listed sources on Nov 16, 2026. Check the source for changes before heading out."
        : "Check the listed source for changes before heading out."
      : undefined,
    secondaryAction: { label: "Browse weekend events", href: "/events?in=county&lens=weekend" },
  };
}
