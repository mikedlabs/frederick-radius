import type { Anomaly } from "@/lib/integrations/feed-snapshot";

/**
 * The paid Google writer lands in Supabase before the reviewed artifact reaches
 * the deployed bundle. One normal handoff can span the 08:00 UTC writer, the
 * 09:17 UTC steward, and required PR checks, so do not alarm on a same-day
 * difference. A second missed handoff is no longer normal: the committed
 * schedules have started losing rows to the seven-day freshness policy.
 */
export const HOURS_PROMOTION_MAX_LAG_HOURS = 30;
const MAX_FUTURE_SKEW_MS = 5 * 60_000;

export type HoursPromotionState =
  | "current"
  | "within_window"
  | "stalled"
  | "unknown";

export type HoursPromotionHealth = {
  green: boolean;
  state: HoursPromotionState;
  sourceLatestAt: string | null;
  artifactLatestAt: string | null;
  lagHours: number | null;
  maxLagHours: number;
  anomaly: Anomaly | null;
};

function validTimestamp(
  value: string | null | undefined,
  nowMs: number,
): number | null {
  if (!value) return null;
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed) || parsed > nowMs + MAX_FUTURE_SKEW_MS) {
    return null;
  }
  return parsed;
}

/**
 * Compare collection truth with publication truth.
 *
 * A fresh row in Supabase is not public evidence. It becomes public only after
 * the generated artifact survives the review PR and is bundled into the app.
 * This evaluator never promotes a row; it only makes a stalled handoff visible.
 */
export function evaluateHoursPromotionHealth(
  input: {
    sourceLatestAt: string | null | undefined;
    artifactLatestAt: string | null | undefined;
    now?: Date;
    maxLagHours?: number;
  },
): HoursPromotionHealth {
  const now = input.now ?? new Date();
  const nowMs = now.getTime();
  const maxLagHours = input.maxLagHours ?? HOURS_PROMOTION_MAX_LAG_HOURS;
  const sourceMs = validTimestamp(input.sourceLatestAt, nowMs);
  const artifactMs = validTimestamp(input.artifactLatestAt, nowMs);
  const sourceLatestAt = sourceMs === null ? null : new Date(sourceMs).toISOString();
  const artifactLatestAt = artifactMs === null ? null : new Date(artifactMs).toISOString();

  if (
    !Number.isFinite(nowMs)
    || !Number.isFinite(maxLagHours)
    || maxLagHours <= 0
    || sourceMs === null
    || artifactMs === null
  ) {
    return {
      green: false,
      state: "unknown",
      sourceLatestAt,
      artifactLatestAt,
      lagHours: null,
      maxLagHours,
      anomaly: {
        source: "places-hours-refresh-publication",
        kind: "infrastructure_unavailable",
        detail:
          "The Google/Supabase hours collection watermark could not be compared with the bundled hours artifact. Treat publication freshness as unknown until both timestamps are available.",
      },
    };
  }

  // The source table is the upstream side of this handoff. If it is materially
  // older than the deployed artifact, the lineage cannot be reconciled (for
  // example after a restore or an unexpected table reset). Do not call that
  // current merely because its signed lag would be negative.
  if (artifactMs - sourceMs > MAX_FUTURE_SKEW_MS) {
    return {
      green: false,
      state: "unknown",
      sourceLatestAt,
      artifactLatestAt,
      lagHours: null,
      maxLagHours,
      anomaly: {
        source: "places-hours-refresh-publication",
        kind: "infrastructure_unavailable",
        detail:
          "The bundled hours artifact is newer than the Supabase collection watermark. Reconcile the hours table and deployment lineage before trusting the handoff.",
      },
    };
  }

  const lagHours = Math.max(0, (sourceMs - artifactMs) / 3_600_000);
  if (lagHours === 0) {
    return {
      green: true,
      state: "current",
      sourceLatestAt,
      artifactLatestAt,
      lagHours,
      maxLagHours,
      anomaly: null,
    };
  }
  if (lagHours <= maxLagHours) {
    return {
      green: true,
      state: "within_window",
      sourceLatestAt,
      artifactLatestAt,
      lagHours,
      maxLagHours,
      anomaly: null,
    };
  }

  return {
    green: false,
    state: "stalled",
    sourceLatestAt,
    artifactLatestAt,
    lagHours,
    maxLagHours,
    anomaly: {
      source: "places-hours-refresh-publication",
      kind: "ingest_stale",
      detail:
        `Supabase contains Google hours ${Math.round(lagHours)} hours newer than the bundled artifact. ` +
        "Collection is working, but publication is stalled; inspect the data-steward review PR, required checks, and auto-merge queue.",
    },
  };
}
