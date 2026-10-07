/**
 * Trust as a designed system, not a scattered disclaimer.
 *
 * The app already refuses to lie ("Likely open", "Hours not confirmed",
 * curated vs live feeds). This turns those honest-but-ad-hoc strings
 * into one typed signal every surface can render the same way, so a
 * resident can answer "can I trust this, and where did it come from?"
 * at a glance.
 *
 * Three levels, each grounded in data the app actually has. We do not
 * invent a "last checked 2 minutes ago" when there is no timestamp:
 * freshness is optional and only set when a real one exists. Honest
 * beats impressive. Every label and date comes from the trust-language
 * table, so a chip, a sheet and a page say one fact the same way.
 */

import type { OpenStatus } from "@/lib/hours";
import {
  CHECKED_AT_SOURCE,
  FROM_PUBLIC_CALENDAR,
  GOVERNMENT_LISTING,
  HOURS_NOT_CONFIRMED,
  HOURS_NOT_POSTED,
  PUBLISHER_LISTING,
  RADIUS_REVIEWED,
  updatedLabel,
  type FreshnessBasis,
} from "@/lib/trust-language";

export type TrustLevel = "verified" | "likely" | "unconfirmed";

export type TrustSignal = {
  level: TrustLevel;
  /** Short chip text, taken from the trust-language table. */
  label: string;
  /** Plain-language basis, shown on detail surfaces and as the tooltip. */
  basis: string;
  /** Relative freshness, only when a real timestamp exists. */
  checked?: string;
};

/** Structural subset of an event — EventWithMeta satisfies it. */
export type EventTrustInput = {
  /** Any adapter source. The label branches below name the sources they
   *  know; everything else reads as a public-calendar feed row. */
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
 *  editorial. Every other automated row says plainly that it came from a
 *  public calendar: "Live" is kept for something happening right now. */
export function eventTrust(e: EventTrustInput): TrustSignal {
  if (e.source === "seed") {
    return {
      level: "verified",
      label: RADIUS_REVIEWED,
      basis: "Selected and reviewed by Frederick Radius",
    };
  }
  const governmentBasis = sourceBasis(GOVERNMENT_SOURCE_BASIS, e.source);
  if (governmentBasis) {
    return {
      level: "verified",
      label: GOVERNMENT_LISTING,
      basis: governmentBasis,
    };
  }
  const publisherBasis = sourceBasis(PUBLISHER_SOURCE_BASIS, e.source);
  if (publisherBasis) {
    return {
      level: "verified",
      label: PUBLISHER_LISTING,
      basis: publisherBasis,
    };
  }
  // manual / automated feed
  return e.is_verified
    ? {
        level: "verified",
        label: CHECKED_AT_SOURCE,
        basis: "Checked by Frederick Radius against the source",
      }
    : {
        level: "likely",
        label: FROM_PUBLIC_CALENDAR,
        basis: "Read automatically from a public event calendar",
      };
}

/**
 * What an event's freshness timestamp records. An editor's check (a verified
 * or Radius-reviewed row) is a check at the source; every other row's stamp
 * is the time Radius last read the publisher's calendar.
 */
export function eventFreshnessBasis(e: EventTrustInput): FreshnessBasis {
  return e.is_verified || e.source === "seed" ? "checked" : "feed";
}

/**
 * Trust for a place's hours. "Verified" only when hours are confirmed
 * against a live source; curated-but-unconfirmed hours and a schedule
 * withheld as stale both read "Hours not confirmed", and no schedule at all
 * reads "Hours not posted", the same words the status line uses. Mirrors
 * getOpenStatus and the loader's withheld-hours status.
 */
export function placeHoursTrust(status: OpenStatus): TrustSignal {
  switch (status.state) {
    case "open":
    case "closing-soon":
    case "closed":
      return {
        level: "verified",
        label: CHECKED_AT_SOURCE,
        basis: "Checked against posted hours",
      };
    case "unverified":
      return {
        level: "likely",
        label: HOURS_NOT_CONFIRMED,
        basis: "Estimated from curated hours, not yet confirmed",
      };
    default:
      // A withheld schedule is not "no posted hours": Radius has a schedule,
      // it is just too old to repeat as current.
      if (status.reason === "stale") {
        return {
          level: "unconfirmed",
          label: HOURS_NOT_CONFIRMED,
          basis: "Radius has hours on file, but they have not been confirmed recently. Call ahead to confirm.",
        };
      }
      return {
        level: "unconfirmed",
        label: HOURS_NOT_POSTED,
        basis: "No posted hours. Call ahead to confirm.",
      };
  }
}

/**
 * Freshness for a real timestamp: "Updated 3 hours ago" inside a day, then
 * "Updated Jun 15" (or "Updated May 14, 2025" from another year), through
 * the trust-language date formatter. Pure: nowMs is injectable so the output
 * is deterministic in tests. Returns null for a missing or unparseable input
 * rather than guessing.
 */
export function formatChecked(iso: string | undefined, nowMs: number = Date.now()): string | null {
  return updatedLabel(iso, nowMs);
}

/** Brand token per level, resolved by the chip component. */
export const TRUST_COLOR: Record<TrustLevel, string> = {
  verified: "var(--app-positive)",
  // Calm provenance, not caution: public-calendar feed rows and unconfirmed
  // hours are normal states, so they ride the muted ink tone, not amber.
  // Amber is reserved for genuinely stale/unconfirmed signals. (TRUST_COLOR is
  // consumed only by TrustChip; the label carries likely-vs-unconfirmed.)
  likely: "var(--app-ink-3)",
  unconfirmed: "var(--app-ink-3)",
};
