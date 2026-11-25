import { expect, it, vi } from "vitest";
import { MUNICIPALITY_BY_SLUG } from "@/data/municipalities";
import type { EventWithMeta } from "./events";
import type { EventArchiveSnapshot } from "./todayEventSnapshot";
import { loadEventArchiveSnapshot } from "./todayEventSnapshot";
import { getTownEventPreview } from "./townEventPreview";

vi.mock("./todayEventSnapshot", () => ({ loadEventArchiveSnapshot: vi.fn(), logEventArchiveFailure: vi.fn() }));

const town = MUNICIPALITY_BY_SLUG.brunswick;
const now = new Date("2026-11-24T14:00:00Z");
function event(slug: string, fields: Partial<EventWithMeta> = {}): EventWithMeta {
  return { slug, title: slug, municipality: "brunswick", municipality_name: "Brunswick",
    starts_at: "2026-11-25T16:00:00Z", geo_confidence: "venue_match", geom: town.centroid, ...fields } as EventWithMeta;
}
function snapshot(events: EventWithMeta[], degraded: boolean) {
  vi.mocked(loadEventArchiveSnapshot).mockResolvedValue({
    publicEvents: events, sourceHealth: { degraded, issues: [] },
  } as unknown as EventArchiveSnapshot);
}

it("reads the shared archive and shows the next three public in-person listings scoped to the town", async () => {
  snapshot([event("thursday", { starts_at: "2026-11-26T16:00:00Z" }), event("library", { municipality: "Town of Brunswick, MD" }),
    event("downtown", { starts_at: "2026-11-24T20:00:00Z" }), event("next-week", { starts_at: "2026-11-29T16:00:00Z" }),
    event("cancelled", { status: "cancelled" }), event("postponed", { status: "postponed" }),
    event("past", { starts_at: "2025-01-01T16:00:00Z" }), event("online", { attendance_mode: "online" }),
    event("mismatched", { municipality: "frederick" })], false);
  const result = await getTownEventPreview(town, now);
  expect(loadEventArchiveSnapshot).toHaveBeenCalledWith(now, { cache: true });
  expect(result.local.map((row) => row.slug)).toEqual(["downtown", "library", "thursday"]);
  expect(result.nearby).toBeUndefined();
  expect(result.degraded).toBe(false);
});

it("distinguishes a degraded calendar and links only a precise nearby event", async () => {
  const outside = { municipality: "rosemont", municipality_name: "Rosemont" };
  snapshot([event("centroid", { ...outside, geo_confidence: "area" }),
    event("nearby", { ...outside }), event("unknown town", { municipality: "", municipality_name: "" })], true);
  const result = await getTownEventPreview(town, now);
  expect(result.local).toEqual([]);
  expect(result.nearby?.slug).toBe("nearby");
  expect(result.degraded).toBe(true);
});


it("keeps the town usable when the archive read rejects", async () => {
  vi.mocked(loadEventArchiveSnapshot).mockRejectedValue(new Error("Unavailable"));
  expect(await getTownEventPreview(town, now)).toEqual({ local: [], nearby: undefined, degraded: true });
});
