import { describe, expect, it } from "vitest";
import {
  eventEndTrust,
  eventFreeStatus,
  eventHiddenFromToday,
  eventInstant,
  eventPlaceId,
  eventPublicScope,
  eventSeriesKey,
  toIsoInstant,
} from "./event-fields";

describe("optional #1740 event fields", () => {
  it("treats a missing place_id as absent", () => {
    expect(eventPlaceId({ slug: "a" })).toBeNull();
    expect(eventPlaceId({ place_id: "  " })).toBeNull();
    expect(eventPlaceId({ place_id: "weinberg-center" })).toBe("weinberg-center");
  });

  it("hides campus and notice from Today, and leaves a missing scope visible", () => {
    expect(eventPublicScope({})).toBe("public");
    expect(eventHiddenFromToday({})).toBe(false);
    expect(eventHiddenFromToday({ event_scope: "public" })).toBe(false);
    expect(eventHiddenFromToday({ event_scope: "campus" })).toBe(true);
    expect(eventHiddenFromToday({ event_scope: "notice" })).toBe(true);
  });

  it("treats FCPL programs as proven free unless a named fee is present", () => {
    expect(eventFreeStatus({ is_free: true })).toBe("proven");
    expect(eventFreeStatus({ is_free: false })).toBe("unknown");
    expect(eventFreeStatus({ is_free: false, price_text: "$8" })).toBe("paid");
    expect(
      eventFreeStatus({ is_free: false, info: { admission: "$5 at the door" } }),
    ).toBe("paid");
    expect(eventFreeStatus({ is_free: false, source: "fcpl", title: "Story time" })).toBe(
      "proven",
    );
    expect(
      eventFreeStatus({
        is_free: false,
        source: "dfp",
        title: "Alive @ Five",
      }),
    ).toBe("unknown");
    expect(
      eventFreeStatus({
        is_free: false,
        source: "fcpl",
        title: "Maker workshop",
        description: "Registration fee required",
      }),
    ).toBe("unknown");
  });

  it("only trusts end_trust ok (or the boolean true used on the rework branch)", () => {
    expect(eventEndTrust({})).toBe("absent");
    expect(eventEndTrust({ end_trust: "ok" })).toBe("ok");
    expect(eventEndTrust({ end_trust: true })).toBe("ok");
    expect(eventEndTrust({ end_trust: "unknown" })).toBe("untrusted");
    expect(eventEndTrust({ end_trust: false })).toBe("untrusted");
  });

  it("parses FCPL space-separated timestamps that Safari rejects", () => {
    expect(toIsoInstant("2026-10-11 18:00:00+00")).toBe("2026-10-11T18:00:00.000Z");
    expect(eventInstant("2026-10-11 18:00:00+00")?.toISOString()).toBe(
      "2026-10-11T18:00:00.000Z",
    );
    expect(toIsoInstant("2026-10-11T18:00:00.000Z")).toBe("2026-10-11T18:00:00.000Z");
    expect(toIsoInstant("not-a-date")).toBeNull();
  });

  it("prefers series_key when present", () => {
    expect(eventSeriesKey({ series_key: "alive-at-five" }, "heuristic")).toBe(
      "alive-at-five",
    );
    expect(eventSeriesKey({}, "heuristic")).toBe("heuristic");
  });
});
