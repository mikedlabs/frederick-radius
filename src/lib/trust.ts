/**
 * Trust as a designed system, not a scattered disclaimer.
 *
 * The app already refuses to lie ("Likely open", "Hours not confirmed",
 * curated vs live feeds). This turns those honest-but-ad-hoc strings
 * into one typed signal every surface can render the same way, so a
 * resident can answer "can I trust this, and where did it come from?"
 * at a glance.
 *
 * Four levels, each grounded in data the app actually has. We do not
 * invent a "last checked 2 minutes ago" when there is no timestamp:
 * freshness is optional and only set when a real one exists. Honest
 * beats impressive.
 */

import type { Hours } from "@/data/places";
import { isDisplayOnlyHours, isScheduleEvidenceCurrent, type OpenStatus } from "@/lib/hours";

export type TrustLevel = "verified" | "likely" | "unconfirmed";

export type TrustSignal = {
  level: TrustLevel;
  /** One- or two-word chip text. */
  label: string;
  /** Plain-language basis, shown on detail surfaces and as the tooltip. */
  basis: string;
  /** Relative freshness, only when a real timestamp exists. */
  checked?: string;
};

/** Structural subset of an event — EventWithMeta satisfies it. */
export type EventTrustInput = {
  /** Any adapter source. The label branches below name the sources they
   *  know; everything else reads as a live feed row. */
  source: string;
  is_verified: boolean;
};

const PUBLISHER_SOURCE_BASIS: Readonly<Record<string, string>> = {
  dfp: "Published by Downtown Frederick Partnership",
  celebrate: "Published by Celebrate Frederick",
  hood: "Published by Hood College",
  "visit-frederick": "Published by Visit Frederick",
  weinberg: "Published by the Weinberg Center",
  delaplaine: "Published by Delaplaine Arts Center",
  fair: "Published by The Great Frederick Fair",
  "heritage-frederick": "Published by Heritage Frederick",
  monocacy: "Published by Monocacy Brewing",
  fcvfra: "Published by the Frederick County Volunteer Fire and Rescue Association",
  mdcc: "Published by the Maryland Deaf Community Center",
  "mount-st-marys": "Published by Mount St. Mary's University",
  isf: "Published by the Islamic Society of Frederick",
  elc: "Published by Evangelical Lutheran Church",
  "civil-war-med": "Published by the National Museum of Civil War Medicine",
  "maryland-ensemble": "Published by Maryland Ensemble Theatre",
  catoctin: "Published by Catoctin Land Trust",
  fcc: "Published by Frederick Community College",
  "frederick-keys": "Published by the Frederick Keys",
};

const GOVERNMENT_SOURCE_BASIS: Readonly<Record<string, string>> = {
  county: "Published by Frederick County Government",
  fcpl: "Published by Frederick County Public Libraries",
  "city-frederick": "Published by the City of Frederick",
  "mount-airy": "Published by the Town of Mount Airy",
  thurmont: "Published by the Town of Thurmont",
  parks: "Published by Frederick County Parks and Recreation",
  msd: "Published by the Maryland School for the Deaf",
};

function sourceBasis(
  sources: Readonly<Record<string, string>>,
  source: string,
): string | undefined {
  return Object.prototype.hasOwnProperty.call(sources, source)
    ? sources[source]
    : undefined;
}

/** Trust for an event, from its provenance and verification flag.
 *  A source's own calendar is a publisher listing, not a Radius partnership.
 *  Government calendars are named as government listings without implying
 *  that the agency operates or endorses Radius. Radius-reviewed rows remain
 *  editorial, and all other live rows keep the existing fail-soft language. */
export function eventTrust(e: EventTrustInput): TrustSignal {
  if (e.source === "seed") {
    return {
      level: "verified",
      label: "Radius reviewed",
      basis: "Selected and reviewed by Frederick Radius",
    };
  }
  const governmentBasis = sourceBasis(GOVERNMENT_SOURCE_BASIS, e.source);
  if (governmentBasis) {
    return {
      level: "verified",
      label: "Government listing",
      basis: governmentBasis,
    };
  }
  const publisherBasis = sourceBasis(PUBLISHER_SOURCE_BASIS, e.source);
  if (publisherBasis) {
    return {
      level: "verified",
      label: "Publisher listing",
      basis: publisherBasis,
    };
  }
  // manual / live feed
  return e.is_verified
    ? {
        level: "verified",
        label: "Checked at source",
        basis: "Checked by Frederick Radius against the source",
      }
    : {
        level: "likely",
        label: "Live",
        basis: "Aggregated from a live feed",
      };
}

/**
 * Trust for a place's hours. "Verified" only when hours are confirmed
 * against a live source; curated-but-unconfirmed hours are honestly
 * "Likely"; no hours at all is "Unconfirmed". A supplied display-only
 * schedule is checked for freshness separately from the venue opening state.
 */
export function placeHoursTrust(
  status: OpenStatus,
  evidence?: { hours?: Hours; verified?: boolean; now?: Date },
): TrustSignal {
  // A checked kitchen, museum or admission schedule can be useful without
  // establishing whether the whole venue is open. Keep those two facts apart.
  if (isDisplayOnlyHours(evidence?.hours)) {
    if (evidence?.verified && evidence.hours && isScheduleEvidenceCurrent(evidence.hours, evidence.now ?? new Date())) {
      return {
        level: "verified",
        label: "Checked at source",
        basis: "Official schedule checked. This schedule does not confirm whether the venue is open.",
      };
    }
    return {
      level: "unconfirmed",
      label: "Needs a new check",
      basis: "This posted schedule needs a new source check. Check the official source before going.",
    };
  }
  switch (status.state) {
    case "open":
    case "closing-soon":
    case "closed":
      return {
        level: "verified",
        label: "Checked at source",
        basis: "Checked against posted hours",
      };
    case "unverified":
      return {
        level: "likely",
        label: "Likely",
        basis: "Estimated from curated hours, not yet confirmed",
      };
    default:
      return {
        level: "unconfirmed",
        label: "Unconfirmed",
        basis: "No posted hours. Call ahead to confirm.",
      };
  }
}

/**
 * The two dates a place detail surface may show, kept apart on purpose.
 *
 * `hours` is when the hours themselves were last observed. It belongs in the
 * status line beside the hours caveat ("Hours not recently confirmed · Hours
 * checked Aug 22"), because that is the claim it qualifies. `listing` is the
 * listing-level check and belongs in the muted source line after the content.
 * Showing both side by side read as two contradictory "checked" claims
 * (November 2026 detail audit), so each surface takes exactly one of them.
 */
export type PlaceFreshnessEvidence = {
  hours?: string;
  listing?: string;
};

export function placeFreshnessEvidence(place: {
  hours_updated_at?: string;
  last_verified_at?: string;
}): PlaceFreshnessEvidence {
  return {
    hours: place.hours_updated_at || undefined,
    listing: place.last_verified_at || undefined,
  };
}

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/**
 * Relative freshness for a real timestamp. Pure: nowMs is injectable so
 * the output is deterministic in tests. Returns null for a missing or
 * unparseable input rather than guessing.
 */
/**
 * The time zone that prints a stored timestamp as the day it records. A
 * date-only value ("2026-05-14") or a padded midnight-UTC stamp
 * ("2026-08-22T00:00:00.000Z") names a calendar day, so it is read in UTC;
 * anything else is a real moment and is read in Frederick's time zone.
 * Pinning the zone also keeps server and client output identical.
 */
export function recordedDayTimeZone(iso: string): "UTC" | "America/New_York" {
  return /^\d{4}-\d{2}-\d{2}(?:T00:00:00(?:\.000)?Z)?$/.test(iso.trim()) ? "UTC" : "America/New_York";
}

/** "Aug 22, 2026" for a stored check timestamp, or null when it is unusable. */
export function formatCheckedDay(iso: string | undefined): string | null {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return null;
  return new Date(t).toLocaleDateString("en-US", {
    month: "short", day: "numeric", year: "numeric", timeZone: recordedDayTimeZone(iso),
  });
}

export function formatChecked(iso: string | undefined, nowMs: number = Date.now()): string | null {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return null;
  const diff = nowMs - t;
  if (diff < 0) return "Updated just now";
  if (diff < 2 * MINUTE) return "Updated just now";
  if (diff < HOUR) return `Updated ${Math.floor(diff / MINUTE)} min ago`;
  if (diff < DAY) {
    const h = Math.floor(diff / HOUR);
    return `Updated ${h} hour${h === 1 ? "" : "s"} ago`;
  }
  if (diff < 2 * DAY) return "Updated yesterday";
  if (diff < 7 * DAY) return `Updated ${Math.floor(diff / DAY)} days ago`;
  // A date-only value ("2026-05-14", the shape of place.updated_at) parses
  // as UTC midnight, which is the previous evening in Frederick, so the day is
  // read in the zone that keeps it the recorded day.
  return `Updated on ${new Date(t).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: recordedDayTimeZone(iso),
  })}`;
}

/** Brand token per level, resolved by the chip component. */
export const TRUST_COLOR: Record<TrustLevel, string> = {
  verified: "var(--app-positive)",
  // Calm provenance, not caution: "Live" (feed) and "Likely open" rows are
  // normal states, so they ride the muted ink tone instead of warning-amber.
  // Amber is reserved for genuinely stale/unconfirmed signals. (TRUST_COLOR is
  // consumed only by TrustChip; the label carries likely-vs-unconfirmed.)
  likely: "var(--app-ink-3)",
  unconfirmed: "var(--app-ink-3)",
};
