import { describe, expect, it } from "vitest";
import { isExpiredVenueEvent, reviewVenueCollection } from "../scripts/lib/venue-collection-review";
const now = new Date("2026-10-20T12:00:00Z");
const event = { venue_slug: "banyan", title: "Published show", starts_at: "2026-11-20T20:00-05:00", ticket_url: "https://www.thebanyanmd.com/livemusic/show", source: { url: "https://www.thebanyanmd.com/livemusic", fetchedAt: "2026-10-18T12:00:00Z" } };
describe("venue semantic review", () => {
  it("allows only an observation renewal or ordering change without review", () => {
    const renewed = { ...event, source: { ...event.source, fetchedAt: now.toISOString() } };
    expect(reviewVenueCollection([event], [renewed], now)).toMatchObject({ reviewRequired: false, futureAdditions: 0, futureRemovals: 0 });
    const other = { ...event, venue_slug: "new-spire" };
    expect(reviewVenueCollection([event, other], [other, renewed], now).reviewRequired).toBe(false);
  });
  it.each([
    { ...event, title: "Changed performer" },
    { ...event, starts_at: "2026-11-20T21:00-05:00" },
    { ...event, ticket_url: "https://www.thebanyanmd.com/livemusic/other" },
    { ...event, source: { ...event.source, url: "https://www.thebanyanmd.com/another-source" } },
  ])("requires review for a changed future fact and cannot accept it by repeating collection", (changed) => {
    expect(reviewVenueCollection([event], [changed], now).reviewRequired).toBe(true);
    expect(reviewVenueCollection([event], [changed], now).reviewRequired).toBe(true);
  });
  it("requires review for future addition/removal, including a verified empty source", () => {
    expect(reviewVenueCollection([], [event], now)).toMatchObject({ reviewRequired: true, futureAdditions: 1 });
    expect(reviewVenueCollection([event], [], now)).toMatchObject({ reviewRequired: true, futureRemovals: 1 });
  });
  it("permits expired cleanup but retains a still-running multi-day event", () => {
    const expired = { ...event, starts_at: "2026-10-18T20:00-04:00", ends_at: "2026-10-18T22:00-04:00" };
    const ongoing = { ...event, starts_at: "2026-10-18T20:00-04:00", ends_at: "2026-10-21T22:00-04:00" };
    expect(reviewVenueCollection([event, expired], [event], now)).toMatchObject({ reviewRequired: false, expiredRemovals: 1 });
    expect(isExpiredVenueEvent(ongoing, now)).toBe(false);
    expect(reviewVenueCollection([ongoing], [], now).reviewRequired).toBe(true);
  });
  it("does not silently clear ambiguous dates, invalid ends or duplicate future rows", () => {
    for (const starts_at of ["tomorrow", "2026-10-01T10:00", ""]) expect(reviewVenueCollection([{ ...event, starts_at }], [], now).reviewRequired).toBe(true);
    expect(isExpiredVenueEvent({ ...event, starts_at: "2026-10-18T20:00-04:00", ends_at: "invalid" }, now)).toBe(false);
    expect(reviewVenueCollection([event, event], [event], now).reviewRequired).toBe(true);
  });
});
