import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import officialRows from "../../../tests/fixtures/fcpl-cancellation-oct2026.json";
import { fcplMapOne, type FcplRaw } from "@/lib/ingest/fcpl";
import { parseLocation } from "@/lib/ingest/location";
import { getIngestedSeries } from "./ingested";
import { getIngestedCardBySlug, ingestedSeriesToCards } from "./ingestedEvents";
import { hydrateUnifiedEvents } from "./unifiedEvents";
import { prepareEventArchiveRows, syncEventArchiveBatchWithWriter, type EventArchiveBatchWriter } from "@/lib/events/event-archive-batch";

const mocks = vi.hoisted(() => ({ getSql: vi.fn() }));
vi.mock("next/cache", () => ({ unstable_cache: (fn: unknown) => fn }));
vi.mock("@/lib/db/client", () => ({ getSql: mocks.getSql }));
vi.mock("@/lib/integrations/mapboxGeocode", () => ({
  upgradeEventGeom: async (event: unknown) => event,
  upgradeEventGeoms: async (events: unknown) => events,
}));

const NOW = new Date("2026-10-03T01:20:00Z");
function source(id: string) {
  return officialRows.find((row) => row.id === id)!;
}
function stored(raw: FcplRaw, overrides: Record<string, unknown> = {}) {
  const mapped = fcplMapOne(raw, NOW)!;
  const event = mapped.event;
  const location = parseLocation(event.rawLocation);
  return {
    source_uid: event.uid,
    source_domain: "frederick.librarycalendar.com",
    source_url: event.sourceUrl,
    title: event.summary,
    description: event.description ?? null,
    starts_at_utc: event.startsAtUtc,
    ends_at_utc: event.endsAtUtc,
    all_day: event.allDay,
    venue_name: location.venueName,
    address: location.address,
    lat: "39.486525",
    lng: "-77.34737",
    municipality: mapped.municipality,
    category: mapped.category,
    hero_image: null,
    hero_image_alt: null,
    updated_at: "2026-10-03T01:00:00Z",
    raw_vevent: event.rawVevent,
    ...overrides,
  };
}
function respond(rows: ReturnType<typeof stored>[]) {
  const sql = vi.fn(async (strings: TemplateStringsArray, ...values: unknown[]) => {
    void strings; void values; return rows;
  });
  mocks.getSql.mockReturnValue(sql);
  return sql;
}

beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(NOW); });
afterEach(() => { vi.useRealTimers(); vi.clearAllMocks(); });

describe("official FCPL occurrence cancellation", () => {
  it("retains the cancelled public occurrence for lifecycle reconciliation at ingest", () => {
    const raw = source("215322");
    const mapped = fcplMapOne(raw, NOW)!;
    expect(mapped.event.uid).toBe("215322");
    expect(JSON.parse(mapped.event.rawVevent)).toMatchObject({
      moderation_state: "cancelled", public: true, published: true,
    });
  });

  it("uses retained structured cancellation without requiring another ingest or a title marker", async () => {
    const raw = source("215322");
    const unmarked = "Introduction to Personal Color Analysis: Discover the Power of Color";
    const sql = respond([stored({ ...raw, title: unmarked }, { title: unmarked })]);
    const series = await getIngestedSeries();
    const query = sql.mock.calls[0]?.[0] as unknown as TemplateStringsArray;
    expect(query.join(" ")).toContain("raw_vevent");
    expect(series[0].occurrences[0]).toMatchObject({ sourceUid: "215322", status: "cancelled" });
    const cards = ingestedSeriesToCards(series, NOW);
    expect(cards).toHaveLength(1);
    expect(cards[0]).toMatchObject({ source: "fcpl", source_id: "215322", status: "cancelled", title: unmarked });
    const shared = hydrateUnifiedEvents({ unified: cards, sourceHealth: { degraded: false, unavailable: [] } });
    expect(shared.publicEvents).toEqual([]);
    expect(prepareEventArchiveRows(shared.unified).rows[0]).toMatchObject({ source_uid: "215322", event_status: "cancelled" });
    await expect(getIngestedCardBySlug(cards[0].slug)).resolves.toMatchObject({
      status: "cancelled", source_id: "215322", source_url: raw.url,
    });
  });

  it("keeps an individual cancellation and selects the next scheduled sibling for discovery", async () => {
    vi.setSystemTime(new Date("2026-10-07T12:00:00Z"));
    respond(["215491", "215492", "215493"].map((id) => stored(source(id))));
    const series = await getIngestedSeries();
    expect(series).toHaveLength(1);
    expect(series[0].occurrences.map((row) => [row.sourceUid, row.status])).toEqual([
      ["215491", "cancelled"], ["215492", "scheduled"], ["215493", "scheduled"],
    ]);
    const cards = ingestedSeriesToCards(series, new Date());
    const shared = hydrateUnifiedEvents({ unified: cards, sourceHealth: { degraded: false, unavailable: [] } });
    expect(shared.publicEvents.map((row) => row.source_id)).toEqual(["215492"]);
    expect(shared.publicEvents[0]).toMatchObject({ status: "scheduled", recurrence_text: "2 upcoming dates" });
    const lifecycle = cards.filter((row) => row.status === "cancelled");
    expect(lifecycle.map((row) => row.source_id)).toEqual(["215491"]);
    expect(lifecycle[0].title).toBe("Hood Health Hubs");
    expect(prepareEventArchiveRows(cards).rows.map((row) => [row.source_uid, row.event_status])).toEqual([
      ["215491", "cancelled"], ["215492", "scheduled"],
    ]);
    await expect(getIngestedCardBySlug("hood-health-hubs-fcpl-20261013")).resolves.toMatchObject({ status: "cancelled", source_id: "215491" });
    await expect(getIngestedCardBySlug("hood-health-hubs-fcpl-20261020")).resolves.toMatchObject({ status: "scheduled", source_id: "215492" });
  });

  it("does not lose a later cancellation behind the next scheduled series card", async () => {
    respond(["215490", "215491", "215492", "215493"].map((id) => stored(source(id))));
    const series = await getIngestedSeries();
    const cards = ingestedSeriesToCards(series, NOW);
    expect(cards.map((row) => [row.source_id, row.status])).toEqual([
      ["215490", "scheduled"], ["215491", "cancelled"],
    ]);
    expect(cards[0].recurrence_text).toBe("3 upcoming dates");
    expect(cards[1].is_recurring).toBe(false);
    expect(cards[1].recurrence_text).toBeUndefined();
  });

  it("uses the retained official published row when a previously cancelled date is reinstated", async () => {
    const cancelled = source("215322");
    const title = "Introduction to Personal Color Analysis: Discover the Power of Color";
    respond([stored({ ...cancelled, title, moderation_state: "published" }, { title: cancelled.title })]);
    const cards = ingestedSeriesToCards(await getIngestedSeries(), NOW);
    expect(cards[0]).toMatchObject({ source_id: "215322", status: "scheduled", title });
    expect(hydrateUnifiedEvents({ unified: cards, sourceHealth: { degraded: false, unavailable: [] } }).publicEvents).toHaveLength(1);
  });

  it("passes the same published identity to archive reconciliation when it becomes cancelled", async () => {
    const raw = source("215322");
    const title = "Introduction to Personal Color Analysis: Discover the Power of Color";
    const records = new Map<string, ReturnType<typeof prepareEventArchiveRows>["rows"][number]>();
    const upsert = vi.fn<EventArchiveBatchWriter["upsert"]>(async (rows) => {
      let updated = 0;
      for (const row of rows) {
        const key = `${row.source}:${row.source_uid}`;
        if (records.has(key) || row.event_status === "scheduled") {
          records.set(key, row); updated += 1;
        }
      }
      return { upserted: updated, ignoredLifecycleOnly: rows.length - updated };
    });
    respond([stored({ ...raw, title, moderation_state: "published" })]);
    const scheduled = ingestedSeriesToCards(await getIngestedSeries(), NOW);
    await syncEventArchiveBatchWithWriter(scheduled, {}, { upsert });
    respond([stored(raw)]);
    const cancelled = ingestedSeriesToCards(await getIngestedSeries(), NOW);
    const result = await syncEventArchiveBatchWithWriter(cancelled, {}, { upsert });
    expect(result).toMatchObject({ complete: true, upserted: 1, ignoredLifecycleOnly: 0 });
    expect(records.size).toBe(1);
    expect(records.get("fcpl:215322")).toMatchObject({
      slug: scheduled[0].slug, event_status: "cancelled", source_url: raw.url,
      snapshot: expect.objectContaining({ status: "cancelled", source_id: "215322" }),
    });
    expect(upsert.mock.calls[1][0]).toHaveLength(1);
  });

  it("keeps a cancellation from a noise-filtered routine series without surfacing its scheduled siblings", async () => {
    const title = "Weekly Yoga Class";
    respond([
      stored({ ...source("215490"), title }),
      stored({ ...source("215491"), title: `Cancelled - ${title}` }),
      stored({ ...source("215492"), title }),
    ]);
    const cards = ingestedSeriesToCards(await getIngestedSeries(), NOW);
    expect(cards.map((row) => [row.source_id, row.status])).toEqual([["215491", "cancelled"]]);
    expect(hydrateUnifiedEvents({ unified: cards, sourceHealth: { degraded: false, unavailable: [] } }).publicEvents).toEqual([]);
  });

  it("keeps a committee cancellation for its archive even though its series is not public discovery", async () => {
    respond([stored({ ...source("215322"), title: "Cancelled - Committee Meeting" })]);
    const cards = ingestedSeriesToCards(await getIngestedSeries(), NOW);
    expect(cards).toHaveLength(1);
    expect(cards[0]).toMatchObject({ source_id: "215322", status: "cancelled", title: "Committee Meeting" });
    expect(hydrateUnifiedEvents({ unified: cards, sourceHealth: { degraded: false, unavailable: [] } }).publicEvents).toEqual([]);
    expect(prepareEventArchiveRows(cards).rows[0].event_status).toBe("cancelled");
    await expect(getIngestedCardBySlug(cards[0].slug)).resolves.toMatchObject({ status: "cancelled" });
  });

  it("delivers a recently ended cancellation retained by the loader to archive reconciliation", async () => {
    vi.setSystemTime(new Date("2026-11-15T21:00:00Z"));
    const sql = respond([stored(source("215322"))]); // ended at19:30Z, inside the loader's six-hour window
    const cards = ingestedSeriesToCards(await getIngestedSeries(), new Date());
    const [query, ...parameters] = sql.mock.calls[0];
    expect(query.join(" ")).toMatch(/where starts_at_utc >=\s+or ends_at_utc >=/);
    expect(parameters.slice(1, 3)).toEqual([
      "2026-11-15T15:00:00.000Z",
      "2026-11-15T15:00:00.000Z",
    ]);
    expect(cards).toHaveLength(1);
    expect(cards[0]).toMatchObject({ source_id: "215322", status: "cancelled" });
    expect(prepareEventArchiveRows(cards).rows[0]).toMatchObject({ source_uid: "215322", event_status: "cancelled" });
    expect(hydrateUnifiedEvents({ unified: cards, sourceHealth: { degraded: false, unavailable: [] } }).publicEvents).toEqual([]);
  });

  it.each([null, "broken JSON", "[]", '{"moderation_state":{}}'])("retains explicit title cancellation when raw metadata is unavailable: %s", async (rawVevent) => {
    respond([stored(source("215322"), { raw_vevent: rawVevent })]);
    const cards = ingestedSeriesToCards(await getIngestedSeries(), NOW);
    expect(cards[0]).toMatchObject({ source_id: "215322", status: "cancelled" });
    expect(hydrateUnifiedEvents({ unified: cards, sourceHealth: { degraded: false, unavailable: [] } }).publicEvents).toEqual([]);
  });
});
