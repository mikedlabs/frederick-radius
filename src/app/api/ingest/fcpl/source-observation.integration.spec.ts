import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { fcplMapFeed } from "@/lib/ingest/fcpl";
import { parseLocation } from "@/lib/ingest/location";
import { getIngestedSeries } from "@/lib/loaders/ingested";
import { ingestedSeriesToCards } from "@/lib/loaders/ingestedEvents";
import { eventPlanEligibility } from "@/lib/plan/event-plan-eligibility";
import { archivedEventFromSnapshot } from "@/lib/events/event-identity";
import { prepareEventArchiveRows } from "@/lib/events/event-archive-batch";
const boundary = vi.hoisted(() => ({ getSql: vi.fn(), finish: vi.fn(), tags: vi.fn() }));
vi.mock("next/cache", () => ({ unstable_cache: (fn: unknown) => fn, revalidateTag: boundary.tags }));
vi.mock("@/lib/db/client", () => ({ getSql: boundary.getSql }));
vi.mock("@/lib/ingest/run-log", () => ({ startIngestRun: async () => "test-run", finishIngestRun: boundary.finish }));
vi.mock("@/lib/ingest/event-schema-readiness", () => ({ checkEventSchemaReadiness: async () => ({ ready: true, missing: [] }) }));
vi.mock("../_auth", () => ({ verifyCronAuth: () => null }));
vi.mock("@/lib/ingest/geocode", () => ({
    geocodeLimitForRemaining: () => 0,
    geocodePending: vi.fn(),
}));
import { GET } from "./route";
const NOW = new Date("2026-10-07T09:15:00.000Z");
const OLD = "2026-08-22T09:16:16.047Z";
const publisher = {
    id: "source-observation-1", title: "Community Watercolor Evening",
    public: true, published: true, start_date: "2026-10-08 18:00:00",
    end_date: "2026-10-08 19:00:00", changed: "2026-08-22 05:16:16",
    branch: "C. Burr Artz Public Library", program_type: "Arts & Crafts",
    url: "https://frederick.librarycalendar.com/event/community-watercolor-1",
};
function realPathStore(rawPublisher = publisher) {
    const mapped = fcplMapFeed([rawPublisher], NOW)[0];
    const loc = parseLocation(mapped.event.rawLocation);
    const raw = { id: "raw-1", dtstamp: mapped.event.dtstamp, source_url: mapped.event.sourceUrl,
        raw_vevent: mapped.event.rawVevent, fetched_at: OLD };
    const row = { id: "normalized-1", raw_event_id: raw.id,
        source_uid: mapped.event.uid, source_domain: "frederick.librarycalendar.com",
        source_url: mapped.event.sourceUrl, title: mapped.event.summary,
        description: mapped.event.description ?? null, starts_at_utc: mapped.event.startsAtUtc,
        ends_at_utc: mapped.event.endsAtUtc ?? null, tzid: mapped.event.tzid,
        all_day: mapped.event.allDay, venue_name: loc.venueName ?? null,
        address: loc.address ?? null, lat: "39.4141", lng: "-77.4089",
        municipality: mapped.municipality, category: mapped.category,
        hero_image: null, hero_image_alt: null, updated_at: OLD };
    const calls: string[] = [];
    const sql = vi.fn((strings: TemplateStringsArray, ...values: unknown[]) => {
        const text = strings.join(" ").replace(/\s+/g, " ");
        calls.push(text);
        let rows: unknown[] = [];
        if (text.includes("for update of raw, e")) {
            rows = [{ ...row, raw_vevent: raw.raw_vevent, raw_fetched_at: raw.fetched_at,
                    raw_id: raw.id, raw_dtstamp: raw.dtstamp, raw_source_domain: row.source_domain,
                    raw_source_uid: row.source_uid, raw_source_url: raw.source_url }];
        }
        else if (text.includes("update raw_events")) {
            const updates = JSON.parse(values[1] as string) as {
                id: string;
                previous: string;
                envelope: string;
                dtstamp: string;
            }[];
            const update = updates.find((item) => item.id === raw.id && item.previous === raw.raw_vevent && item.dtstamp === raw.dtstamp);
            if (update) {
                raw.raw_vevent = update.envelope;
                raw.fetched_at = raw.fetched_at > String(values[0]) ? raw.fetched_at : String(values[0]);
                rows = [{ id: raw.id }];
            }
        }
        else if (text.includes("from raw_events") && text.includes("left join ingested_events")) {
            rows = [{ id: raw.id, dtstamp: raw.dtstamp, normalized_id: row.id,
                    category: row.category, raw_source_url: raw.source_url,
                    normalized_source_url: row.source_url, normalized_hero_image: null,
                    normalized_hero_image_alt: null, normalized_venue_name: row.venue_name,
                    normalized_address: row.address, normalized_municipality: row.municipality }];
        }
        else if (text.includes("from ingested_events e") && !text.includes("observation")) {
            rows = [{ ...row, raw_vevent: raw.raw_vevent, raw_fetched_at: raw.fetched_at,
                    raw_id: raw.id, raw_dtstamp: raw.dtstamp, raw_source_domain: row.source_domain,
                    raw_source_uid: row.source_uid, raw_source_url: raw.source_url }];
        }
        return Object.assign(Promise.resolve(rows), { cancel: vi.fn() });
    });
    const begin = vi.fn(async (fn: (tx: unknown) => unknown) => fn(sql));
    return { sql: Object.assign(sql, { begin }), raw, row, mapped, calls };
}
describe("FCPL publisher observation whole path", () => {
    beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(NOW); vi.clearAllMocks(); });
    afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });
    it("renews an unchanged exact publisher check through the real mapper, upsert, loader, planner and archive", async () => {
        const store = realPathStore();
        boundary.getSql.mockReturnValue(store.sql);
        vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Object.defineProperty(new Response(JSON.stringify([publisher])), "url", { value: "https://frederick.librarycalendar.com/events/feed/json" })));
        const response = await GET(new NextRequest("https://frederickradius.app/api/ingest/fcpl"));
        const result = await response.json();
        expect(result.stats).toMatchObject({ rawUnchanged: 1, normUpserted: 0 });
        expect(store.raw.dtstamp).toBe(store.mapped.event.dtstamp);
        expect(store.row.updated_at).toBe(OLD);
        expect(result.observations).toMatchObject({ observed: 1, held: 0 });
        const cards = ingestedSeriesToCards(await getIngestedSeries(), NOW);
        expect(cards).toHaveLength(1);
        expect(cards[0].last_verified_at).toBe(NOW.toISOString());
        expect(eventPlanEligibility(cards[0], { nowMs: NOW.getTime() })).toEqual({ eligible: false, reason: "location_unknown" });
        expect(eventPlanEligibility(cards[0], { nowMs: NOW.getTime(), hasResolvedVenue: true })).toEqual({ eligible: true, durationMinutes: 60 });
        expect(prepareEventArchiveRows(cards).rows[0]).toMatchObject({ verified_at: NOW.toISOString() });
        expect(boundary.tags).toHaveBeenCalledWith("ingested-events", "max");
    });
    it("does not renew same-stamp changed timing that the generic unchanged path did not store", async () => {
        const store = realPathStore();
        boundary.getSql.mockReturnValue(store.sql);
        const changed = { ...publisher, start_date: "2026-10-08 17:00:00" };
        vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Object.defineProperty(new Response(JSON.stringify([changed])), "url", { value: "https://frederick.librarycalendar.com/events/feed/json" })));
        const result = await (await GET(new NextRequest("https://frederickradius.app/api/ingest/fcpl"))).json();
        expect(result).toMatchObject({ status: "partial", stats: { rawUnchanged: 1 }, observations: { observed: 0, held: 1 } });
        const cards = ingestedSeriesToCards(await getIngestedSeries(), NOW);
        expect(cards[0].last_verified_at).toBe(OLD);
        expect(cards[0].starts_at).toBe(store.mapped.event.startsAtUtc);
        expect(eventPlanEligibility(cards[0], { nowMs: NOW.getTime() }).eligible).toBe(false);
    });
    it("preserves legacy cancellation archive authority and demonstrates why strict-null rollout is excluded", async () => {
        const store = realPathStore({ ...publisher, moderation_state: "cancelled" } as typeof publisher);
        boundary.getSql.mockReturnValue(store.sql);
        const cards = ingestedSeriesToCards(await getIngestedSeries(), NOW);
        expect(cards).toHaveLength(1);
        expect(cards[0]).toMatchObject({ status: "cancelled", last_verified_at: OLD });
        expect(prepareEventArchiveRows(cards).rows[0]).toMatchObject({ event_status: "cancelled", verified_at: OLD });
        // No runtime archive change: null admission would skip this correction,
        // while a previously stored scheduled snapshot remains independently readable.
        expect(prepareEventArchiveRows([{ ...cards[0], last_verified_at: null }]).rows).toHaveLength(0);
        expect(archivedEventFromSnapshot({ ...cards[0], status: "scheduled" })).toMatchObject({ status: "scheduled", last_verified_at: OLD });
        expect(eventPlanEligibility(cards[0], { nowMs: NOW.getTime() }).eligible).toBe(false);
        expect(store.calls.some((text) => /\b(?:update|insert|delete)\b/.test(text))).toBe(false);
    });
});
