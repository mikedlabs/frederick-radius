import type { EventArchiveSnapshot } from "@/lib/loaders/todayEventSnapshot";
import type { QualifiedSearchMeta } from "@/lib/search";

export type SearchEventCoverage = "complete" | "partial" | "unavailable";

/** A successful partial archive can still supply verified records. Failed
 * reads return curated fallback rows, and an unconfirmed archive clock cannot
 * establish current event facts. Neither belongs in current Search matches. */
export function searchEventsFromSnapshot(
  snapshot: Pick<EventArchiveSnapshot, "publicEvents" | "sourceHealth">,
) {
  if (snapshot.sourceHealth.degraded === false) {
    return { publicEvents: snapshot.publicEvents, coverage: "complete" as const };
  }
  const issues = snapshot.sourceHealth.issues;
  const verifiedPartial = snapshot.sourceHealth.degraded === true &&
    Array.isArray(issues) && issues.length > 0 &&
    issues.every((issue) => issue.code === "event_archive_validation");
  return verifiedPartial
    ? { publicEvents: snapshot.publicEvents, coverage: "partial" as const }
    : { publicEvents: [], coverage: "unavailable" as const };
}

export function searchEventCoverageMessage(coverage: SearchEventCoverage): string | null {
  if (coverage === "partial") {
    return "Some events could not be verified, so these matches may be incomplete.";
  }
  if (coverage === "unavailable") {
    return "The current event schedule could not be checked, so events may be missing from these matches.";
  }
  return null;
}

export function searchEventRecoveryHref(
  town?: string | null,
  window?: QualifiedSearchMeta["eventWindow"],
): string {
  // An explicit county Search must not inherit an unrelated saved town when
  // it hands off to Events. Every recovery keeps the scope Search resolved.
  const params = new URLSearchParams({ in: town ?? "county" });
  // Events has no next-weekend range. Offer its date chooser instead of
  // silently substituting this weekend or treating one date as that range.
  if (window?.date && window.label !== "Next weekend") params.set("d", window.date);
  if (window?.label === "This weekend") params.set("when", "weekend");
  if (window?.label === "Tonight") params.set("tod", "evening");
  if (window?.label === "This morning") params.set("tod", "morning");
  if (window?.label === "This afternoon") params.set("tod", "midday");
  if (window?.freeOnly) params.set("free", "1");
  return `/events?${params}`;
}

export function searchEventRecoveryLabel(window?: QualifiedSearchMeta["eventWindow"]): string {
  return window?.label === "Next weekend" ? "Choose dates in Events" : "See all events";
}
