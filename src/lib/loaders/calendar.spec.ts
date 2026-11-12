import { beforeEach, describe, expect, it, vi } from "vitest";
import type { EventWithMeta } from "./events";
const mocks = vi.hoisted(() => ({ snapshot: vi.fn() }));
vi.mock("./todayEventSnapshot", () => ({ loadEventArchiveSnapshot: mocks.snapshot }));
import { getMonthEvents, nyDayKey } from "./calendar";
const NOW = new Date("2026-11-02T15:00:00Z");
const health = { degraded: false, unavailable: [], issues: [] };
function event(slug: string, starts_at: string, patch = {}): EventWithMeta {
  return { slug, title: "Declared calendar fixture", starts_at, municipality: "frederick",
    category: "community", venue_name: "Declared fixture hall", municipality_name: "Frederick", category_name: "Community", ...patch } as EventWithMeta;
}
beforeEach(() => { vi.clearAllMocks(); mocks.snapshot.mockResolvedValue({ unified: [], sourceHealth: health }); });
describe("canonical calendar loader", () => {
  it("uses one bounded archive read, preserving real freshness time for a selected month across DST", async () => {
    await getMonthEvents(new Date("2026-11-01T12:00:00Z"), NOW);
    expect(mocks.snapshot).toHaveBeenCalledExactlyOnceWith(NOW, {
      windowStart: new Date("2026-10-25T04:00:00Z"), horizonDays: 44, cache: true,
    });
  });
  it("groups canonical records by Eastern day and retains all-day flags and canonical links", async () => {
    mocks.snapshot.mockResolvedValue({ unified: [
      event("later", "2026-11-03T02:00:00Z"), event("earlier", "2026-11-02T05:00:00Z", { is_all_day: true }),
      event("outside", "2026-12-08T05:00:00Z"),
    ], sourceHealth: health });
    const result = await getMonthEvents(new Date("2026-11-01T12:00:00Z"), NOW);
    expect(result.total).toBe(2);
    expect(result.byDay["2026-11-02"].map(e => e.id)).toEqual(["earlier", "later"]);
    expect(result.byDay["2026-11-02"][0]).toMatchObject({ allDay: true, href: "/events/earlier", source: "archive" });
  });
  it.each(["cancelled", "postponed"])("withholds %s records without discarding scheduled siblings", async status => {
    mocks.snapshot.mockResolvedValue({ unified: [
      event("scheduled", "2026-11-02T15:00:00Z"), event("changed", "2026-11-02T16:00:00Z", { status }),
    ], sourceHealth: health });
    const result = await getMonthEvents(new Date("2026-11-01T12:00:00Z"), NOW);
    expect(result.total).toBe(1); expect(result.byDay["2026-11-02"][0].id).toBe("scheduled");
  });
  it("retains partial rows and source issues without representing unavailable coverage as healthy", async () => {
    const sourceHealth = { degraded: true, unavailable: ["The event schedule has not been refreshed recently."],
      issues: [{ code: "event_archive_stale", message: "The event schedule has not been refreshed recently." }] };
    mocks.snapshot.mockResolvedValue({ unified: [event("last-good", "2026-11-02T15:00:00Z")], sourceHealth });
    const result = await getMonthEvents(new Date("2026-11-01T12:00:00Z"), NOW);
    expect(result.sourceHealth).toBe(sourceHealth); expect(result.total).toBe(1);
  });
  it("keeps archived civic meetings and town reminders without reintroducing private bookings", async () => {
    mocks.snapshot.mockResolvedValue({ unified: [
      event("meeting", "2026-11-02T15:00:00Z", { title: "City council meeting", category: "civic" }),
      event("reminder", "2026-11-02T16:00:00Z", { title: "Leaf collection" }),
      event("private", "2026-11-02T17:00:00Z", { title: "Private party booking" }),
    ], sourceHealth: health });
    const result = await getMonthEvents(new Date("2026-11-01T12:00:00Z"), NOW);
    expect(result.byDay["2026-11-02"].map(e => e.id)).toEqual(["meeting", "reminder"]);
  });
  it("keeps day boundaries in Eastern time through the daylight-saving transition", () => {
    expect(nyDayKey("2026-11-02T02:00:00Z")).toBe("2026-11-01");
    expect(nyDayKey("2026-11-02T05:00:00Z")).toBe("2026-11-02");
  });
});
