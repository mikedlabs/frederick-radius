import { describe, it, expect } from "vitest";
import { cancellationPush, effectiveEventStatus } from "./saved-cancellations";

// A fixed Eastern reference: Thursday 2026-07-16 18:00 ET (22:00 UTC, EDT).
const NOW = new Date("2026-07-16T22:00:00Z");

const ev = (over: Partial<{ title: string; startsAt: string; status?: string }> = {}) => ({
  title: "Alive @ Five",
  startsAt: "2026-07-16T23:00:00Z", // 7 PM ET same day
  status: "scheduled",
  ...over,
});

describe("effectiveEventStatus", () => {
  it("lets the owner notice override the feed", () => {
    expect(effectiveEventStatus("scheduled", "cancelled")).toBe("cancelled");
    expect(effectiveEventStatus("cancelled", undefined)).toBe("cancelled");
  });
  it("ignores advisory notices (event still on)", () => {
    expect(effectiveEventStatus("scheduled", "advisory")).toBe("scheduled");
  });
});

describe("cancellationPush", () => {
  it("stays silent for an event that is still on", () => {
    expect(cancellationPush(ev(), undefined, NOW)).toBeNull();
  });

  it("alerts a same-day cancellation with 'today' copy", () => {
    const p = cancellationPush(ev({ status: "cancelled" }), undefined, NOW);
    expect(p).toEqual({
      status: "cancelled",
      title: "Plans changed",
      body: "Alive @ Five is cancelled today.",
    });
  });

  it("alerts a later-week postponement with the weekday", () => {
    // Saturday 7 PM ET
    const p = cancellationPush(
      ev({ startsAt: "2026-07-18T23:00:00Z", status: "postponed" }),
      undefined,
      NOW,
    );
    expect(p?.body).toBe("Saturday's Alive @ Five is postponed.");
  });

  it("owner notice cancels an event the feed still lists as scheduled", () => {
    const p = cancellationPush(ev(), "cancelled", NOW);
    expect(p?.status).toBe("cancelled");
  });

  it("never alerts for an event that already started", () => {
    const p = cancellationPush(
      ev({ startsAt: "2026-07-16T21:00:00Z", status: "cancelled" }),
      undefined,
      NOW,
    );
    expect(p).toBeNull();
  });

  it("never alerts beyond the 6-day window", () => {
    const p = cancellationPush(
      ev({ startsAt: "2026-07-24T23:00:00Z", status: "cancelled" }),
      undefined,
      NOW,
    );
    expect(p).toBeNull();
  });

  it("drops rows with unparseable starts", () => {
    expect(
      cancellationPush(ev({ startsAt: "soon", status: "cancelled" }), undefined, NOW),
    ).toBeNull();
  });
});
