import type { PublicHoursProductHealth } from "@/lib/public-data-snapshot";
import type { PublicHealthSnapshot } from "@/lib/public-health";

export type OperationsHealthLevel =
  | "operational"
  | "policy-hold"
  | "degraded"
  | "blocked"
  | "unknown";

/**
 * Reduce the same health evidence published by /api/health into one operator
 * level. Hours are folded in separately because the public route applies that
 * product gate after building the base health snapshot.
 */
export function operationsHealthLevel(
  health: PublicHealthSnapshot | null,
  hours: PublicHoursProductHealth | null,
): OperationsHealthLevel {
  if (!health || !hours) return "unknown";
  if (
    health.database.status !== "reachable" ||
    health.readiness.status === "hold"
  ) {
    return "blocked";
  }
  if (
    health.status === "operational" &&
    health.data.status === "current" &&
    health.readiness.status === "ready" &&
    hours.status === "policy_hold"
  ) {
    return "policy-hold";
  }
  if (
    health.status !== "operational" ||
    health.data.status !== "current" ||
    health.readiness.status !== "ready" ||
    hours.status !== "current"
  ) {
    return "degraded";
  }
  return "operational";
}

export type OwnerPushReadiness =
  | "ready"
  | "no-device"
  | "unconfigured"
  | "unknown";

export function ownerPushReadiness(
  vapidConfigured: boolean,
  ownerDevices: number | null,
): OwnerPushReadiness {
  if (!vapidConfigured) return "unconfigured";
  if (ownerDevices === null) return "unknown";
  return ownerDevices > 0 ? "ready" : "no-device";
}

export type SentryReadiness = "ready" | "server-only" | "browser-only" | "unconfigured";

export function sentryReadiness(
  serverConfigured: boolean,
  browserConfigured: boolean,
): SentryReadiness {
  if (serverConfigured && browserConfigured) return "ready";
  if (serverConfigured) return "server-only";
  if (browserConfigured) return "browser-only";
  return "unconfigured";
}
