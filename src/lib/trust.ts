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

import type { OpenStatus } from "@/lib/hours";

export type TrustLevel = "verified" | "official" | "likely" | "unconfirmed";

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
  source: "dfp" | "celebrate" | "county" | "manual" | "seed";
  is_verified: boolean;
};

const SOURCE_BASIS: Record<EventTrustInput["source"], string> = {
  dfp: "From the Downtown Frederick Partnership calendar",
  celebrate: "From Celebrate Frederick",
  county: "From the Frederick County calendar",
  manual: "Aggregated from a live feed",
  seed: "Curated by Frederick Radius",
};

/** Trust for an event, from its provenance and verification flag. */
export function eventTrust(e: EventTrustInput): TrustSignal {
  if (e.is_verified) {
    return { level: "verified", label: "Verified", basis: "Verified by Frederick Radius" };
  }
  if (e.source === "seed") {
    return { level: "verified", label: "Curated", basis: SOURCE_BASIS.seed };
  }
  if (e.source === "dfp" || e.source === "celebrate" || e.source === "county") {
    return { level: "official", label: "Official", basis: SOURCE_BASIS[e.source] };
  }
  return { level: "likely", label: "Live", basis: SOURCE_BASIS.manual };
}

/**
 * Trust for a place's hours. "Verified" only when hours are confirmed
 * against a live source; curated-but-unconfirmed hours are honestly
 * "Likely"; no hours at all is "Unconfirmed". Mirrors getOpenStatus.
 */
export function placeHoursTrust(status: OpenStatus): TrustSignal {
  switch (status.state) {
    case "open":
    case "closing-soon":
    case "closed":
      return {
        level: "verified",
        label: "Verified",
        basis: "Confirmed against verified hours",
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

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/**
 * Relative freshness for a real timestamp. Pure: nowMs is injectable so
 * the output is deterministic in tests. Returns null for a missing or
 * unparseable input rather than guessing.
 */
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
  return `Updated on ${new Date(t).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  })}`;
}

/** Brand token per level, resolved by the chip component. */
export const TRUST_COLOR: Record<TrustLevel, string> = {
  verified: "var(--app-positive)",
  official: "var(--app-cool)",
  likely: "var(--app-warning)",
  unconfirmed: "var(--app-ink-3)",
};
