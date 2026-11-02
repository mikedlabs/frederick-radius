import { describe, expect, it } from "vitest";
import type { EventArchivePublicReasonCode, EventArchiveSnapshot } from "@/lib/loaders/todayEventSnapshot";
import { searchEventsFromSnapshot, searchEventCoverageMessage, searchEventRecoveryHref } from "./event-coverage";

const events = [{ slug: "verified-event" }] as EventArchiveSnapshot["publicEvents"];
function snapshot(code?: EventArchivePublicReasonCode) {
  return { publicEvents: events, sourceHealth: { degraded: Boolean(code), unavailable: [], issues: code ? [{ code, message: "Public source issue" }] : [] } };
}

describe("Search event coverage", () => {
  it("keeps successful complete and empty calendars distinct from unavailable reads", () => {
    expect(searchEventsFromSnapshot(snapshot())).toEqual({ publicEvents: events, coverage: "complete" });
    expect(searchEventsFromSnapshot({ ...snapshot(), publicEvents: [] })).toEqual({ publicEvents: [], coverage: "complete" });
    expect(searchEventCoverageMessage("complete")).toBeNull();
  });

  it("keeps valid rows from a validation-only partial read with an explicit caveat", () => {
    expect(searchEventsFromSnapshot(snapshot("event_archive_validation"))).toEqual({ publicEvents: events, coverage: "partial" });
    expect(searchEventCoverageMessage("partial")).toContain("Some events could not be verified");
    expect(searchEventsFromSnapshot({ ...snapshot("event_archive_validation"), publicEvents: [] }).coverage).toBe("partial");
  });

  it.each<EventArchivePublicReasonCode>([
    "event_archive_timeout", "event_archive_unavailable", "event_archive_stale",
    "event_archive_status_unavailable", "event_archive_refresh_failed",
  ])("withholds fallback or unconfirmed-freshness rows for %s", code => {
    expect(searchEventsFromSnapshot(snapshot(code))).toEqual({ publicEvents: [], coverage: "unavailable" });
  });

  it("does not let record validation hide a stale archive or unknown degradation", () => {
    const stale = snapshot("event_archive_stale");
    stale.sourceHealth.issues.push({ code: "event_archive_validation", message: "Private diagnostic must not render" });
    expect(searchEventsFromSnapshot(stale).coverage).toBe("unavailable");
    expect(searchEventsFromSnapshot({ ...snapshot(), sourceHealth: { degraded: true, unavailable: [], issues: [] } }).coverage).toBe("unavailable");
  });

  it("preserves the town and supported date/free filters on the recovery destination", () => {
    expect(searchEventRecoveryHref()).toBe("/events?in=county");
    expect(searchEventRecoveryHref("brunswick", { label: "Tonight", date: "2026-11-02", freeOnly: true })).toBe("/events?in=brunswick&d=2026-11-02&tod=evening&free=1");
    expect(searchEventRecoveryHref("brunswick", { label: "This weekend", date: null, freeOnly: false })).toBe("/events?in=brunswick&when=weekend");
    expect(searchEventRecoveryHref(null, { label: "This afternoon", date: "2026-11-02", freeOnly: false })).toBe("/events?in=county&d=2026-11-02&tod=midday");
  });
});
