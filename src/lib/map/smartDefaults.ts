/**
 * Smart map defaults — what /map chooses to show when the visitor arrives
 * with no instructions (map program phase 1, owner mandate 2026-08-05:
 * the map should answer before it asks).
 *
 * Pure: the Eastern clock and the live signals come in, a default layer
 * state comes out. The caller applies it ONLY when the URL carries no
 * explicit layer/filter state — a deep link or a returning pane state
 * always wins — and the existing Reset control clears it in one tap.
 *
 * Honesty rules baked in:
 *  - A layer is suggested only when its underlying signal is actually
 *    live (radar needs an active weather alert, music needs tonight's
 *    shows, parking needs garages in the data).
 *  - Quiet hours get a quiet map: no suggestion is a valid answer.
 *  - Every suggestion names its reason in one plain sentence so the map
 *    can say why it chose, not just choose.
 */

export type SmartMapSignals = {
  /** Shared NWS/AirNow safety hold used by Today and Ask. */
  outdoorSafetyHold?: {
    kind: "weather" | "air-quality";
    reason: string;
  } | null;
  /** An active, non-routine NWS warning/advisory for the county. */
  activeWeatherAlert: boolean;
  /** Count of live-music shows still ahead tonight. */
  musicTonightCount: number;
  /** Downtown garages present in the data set. */
  parkingCount: number;
  /** Farmers markets open today (schedule-checked, not just weekday). */
  marketsOpenTodayCount: number;
  /** Corridors currently trending longer on MDOT's own readings. */
  roadsTrendingLongerCount: number;
};

export type SmartMapDefault = {
  /** Layer keys that AppMap can actually switch on. */
  layers: ReadonlyArray<"radar" | "parking" | "roads-now">;
  /** One plain sentence the map may show, with a dismiss. */
  reason: string;
  /** A shareable map view when the suggestion is a lens, not a layer. */
  action?:
    | {
        href: string;
        label: string;
      }
    | {
        layer: "radar";
        label: string;
      };
} | null;

/** Eastern wall-clock pieces the selector keys on. */
export type EasternMoment = {
  /** 0-23 */
  hour: number;
  /** 0=Sunday … 6=Saturday */
  weekday: number;
};

export function easternMoment(now: Date): EasternMoment {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    hour: "numeric",
    hourCycle: "h23",
    weekday: "short",
  }).formatToParts(now);
  const get = (type: string) =>
    parts.find((part) => part.type === type)?.value ?? "";
  const weekdays: Record<string, number> = {
    Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6,
  };
  return {
    hour: Number(get("hour")) % 24,
    weekday: weekdays[get("weekday")] ?? 0,
  };
}

/**
 * The selection, in priority order. First match wins — the map leads with
 * ONE story, never a pile of toggled layers.
 */
export function smartMapDefault(
  moment: EasternMoment,
  signals: SmartMapSignals,
): SmartMapDefault {
  const { hour, weekday } = moment;
  const weekend = weekday === 0 || weekday === 6;

  // 1. A shared outdoor safety hold leads everything. This includes unhealthy
  //    measured air even when no NWS alert product has arrived yet.
  if (signals.outdoorSafetyHold) {
    return {
      layers: [],
      reason: signals.outdoorSafetyHold.reason,
      action: signals.outdoorSafetyHold.kind === "weather"
        ? {
            layer: "radar",
            label: "See radar",
          }
        : {
            href: "/pulse",
            label: "See conditions",
          },
    };
  }

  // 2. Other significant weather alerts lead the ordinary discovery defaults.
  //    Keep the map legible, name the alert, and
  //    make radar one deliberate tap away instead of covering the county
  //    before the person has asked to inspect precipitation.
  if (signals.activeWeatherAlert) {
    return {
      layers: [],
      reason: "A weather alert is active.",
      action: {
        layer: "radar",
        label: "See radar",
      },
    };
  }

  // 3. Friday and Saturday evening: the going-out window. Music venues
  //    and the parking answer belong together.
  if ((weekday === 5 || weekday === 6) && hour >= 16 && hour <= 23) {
    if (signals.musicTonightCount > 0) {
      return {
        layers: signals.parkingCount > 0 ? ["parking"] : [],
        reason: "Live music is on tonight.",
        action: {
          href: "/map?music=tonight",
          label: "See tonight's shows",
        },
      };
    }
  }

  // 4. Weekend morning: markets and the outdoors window.
  if (weekend && hour >= 7 && hour <= 12 && signals.marketsOpenTodayCount > 0) {
    return {
      layers: [],
      reason: "A farmers market is open today.",
      action: {
        href: "/map?intent=shop&sub=markets",
        label: "Show markets",
      },
    };
  }

  // 5. Weekday commute windows, only when the roads are actually worse:
  //    a quiet commute gets a quiet map.
  const commute = !weekend && ((hour >= 7 && hour <= 9) || (hour >= 16 && hour <= 18));
  if (commute && signals.roadsTrendingLongerCount > 0) {
    return {
      layers: ["roads-now"],
      reason: "A drive time is running longer than its last reading, so road conditions lead the map.",
    };
  }

  // A quiet hour gets the clean county. No suggestion is a real answer.
  return null;
}
