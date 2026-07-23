/**
 * One attendance-mode contract for every event surface.
 *
 * Feed publishers are inconsistent: some expose schema.org attendance data,
 * while Frederick County currently signals online and hybrid sessions only in
 * the title or venue. Keeping the conservative fallback here prevents an
 * online class from inheriting a town centroid and turning into directions,
 * parking, weather, or "nearby food" advice.
 */
export type EventAttendanceMode = "physical" | "online" | "mixed";

export type EventAttendanceInput = {
  title?: string | null;
  venue_name?: string | null;
  address?: string | null;
  attendance_mode?: EventAttendanceMode | null;
  online_url?: string | null;
  rsvp_url?: string | null;
  ticket_url?: string | null;
  source_url?: string | null;
};

const MIXED_MARKER =
  /\bhybrid\b|(?:&|\band\b|\+|\/)\s*(?:virtual|online)\b|\b(?:virtual|online)\s*(?:&|\band\b|\+|\/)/i;
const ONLINE_VENUE =
  /^(?:virtual|online|zoom|webex|microsoft teams)(?:\b|\s|$)/i;
const ONLINE_TITLE_PREFIX =
  /^(?:virtual|online|zoom|webex|microsoft teams)\b/i;
const ONLINE_TITLE_SUFFIX =
  /(?:^|[\s@|:()–—-])(?:virtual|online|zoom|webex|microsoft teams)(?:\s+(?:class|session|program|event))?\)?\s*$/i;

/** Conservative inference for feeds that do not publish a structured mode. */
export function eventAttendanceMode(
  event: EventAttendanceInput,
): EventAttendanceMode {
  if (event.attendance_mode) return event.attendance_mode;

  const title = (event.title ?? "").trim();
  const venue = (event.venue_name ?? "").trim();
  const address = (event.address ?? "").trim();
  const haystack = `${title} ${venue} ${address}`;

  if (MIXED_MARKER.test(haystack)) return "mixed";

  // "Virtual reality" is normally the subject of an in-person event, not an
  // attendance instruction. A venue explicitly named Online/Virtual still
  // wins below.
  const titleWithoutVirtualReality = title.replace(/\bvirtual reality\b/gi, "");
  if (
    ONLINE_VENUE.test(venue) ||
    ONLINE_VENUE.test(address) ||
    ONLINE_TITLE_PREFIX.test(titleWithoutVirtualReality) ||
    ONLINE_TITLE_SUFFIX.test(titleWithoutVirtualReality)
  ) {
    return "online";
  }

  return "physical";
}

export function hasPhysicalAttendance(event: EventAttendanceInput): boolean {
  return eventAttendanceMode(event) !== "online";
}

export function isOnlineOnlyEvent(event: EventAttendanceInput): boolean {
  return eventAttendanceMode(event) === "online";
}

/**
 * A direct event/registration page is useful; a raw calendar/feed endpoint is
 * not. This is deliberately URL-shape based so an online row whose publisher
 * omitted its item URL cannot lead discovery with nowhere for a user to go.
 */
export function isLikelyEventActionUrl(value?: string | null): value is string {
  if (!value) return false;
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return false;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return false;

  const pathAndQuery = `${url.pathname}${url.search}`.toLowerCase();
  if (
    /\.ics(?:$|\?)/.test(pathAndQuery) ||
    /\.xml(?:$|\?)/.test(pathAndQuery) ||
    /\/rssfeed\.aspx/.test(pathAndQuery) ||
    /\/page\/ical\/?/.test(pathAndQuery) ||
    /[?&]ical=1(?:&|$)/.test(pathAndQuery) ||
    /\/wp-json\/tribe\/events\/v1\/events\/?$/.test(url.pathname.toLowerCase())
  ) {
    return false;
  }

  return true;
}

/** Best user action for an online or hybrid event, in priority order. */
export function eventOnlineActionUrl(
  event: EventAttendanceInput,
): string | null {
  for (const value of [
    event.online_url,
    event.rsvp_url,
    event.ticket_url,
    event.source_url,
  ]) {
    if (isLikelyEventActionUrl(value)) return value;
  }
  return null;
}

/**
 * Online-only discovery without a join, registration, or event page is a dead
 * end. Mixed and physical events remain actionable through their real venue.
 */
export function hasActionableAttendance(event: EventAttendanceInput): boolean {
  return !isOnlineOnlyEvent(event) || eventOnlineActionUrl(event) !== null;
}

/** User-facing venue text shared by cards and sheets. */
export function eventAttendanceLabel(event: EventAttendanceInput): string {
  const mode = eventAttendanceMode(event);
  if (mode === "online") return "Online";
  if (mode === "mixed") {
    const venue = (event.venue_name ?? "").trim();
    return venue ? `${venue} · Online option` : "In person + online";
  }
  return (event.venue_name ?? "").trim();
}
