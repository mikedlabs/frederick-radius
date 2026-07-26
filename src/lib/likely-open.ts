import type { OpenStatus } from "@/lib/hours";

/**
 * Curated posted-hours windows are a fallback only. They may fill an unknown
 * status, but they must never override a fresh confirmed open or closed state.
 */
export function mayUseLikelyOpenFallback(status: OpenStatus): boolean {
  return status.state === "unknown" || status.state === "unverified";
}
