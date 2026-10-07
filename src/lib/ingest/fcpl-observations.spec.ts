import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Sql } from "postgres";
import { fcplMapFeed, fcplStoredLifecycle } from "./fcpl";
import { parseLocation } from "./location";
import { observeFcplBatch, readFcplPublisher } from "./fcpl-observations";
import { FCPL_FEED_URL, FCPL_OBSERVATION_KEY, fcplObservedAt, fcplObservationEnvelope, type FcplObservationRow, } from "./fcpl-observation-envelope";
const NOW = new Date("2026-10-07T09:15:00.000Z");
const OLD = "2026-08-22T09:16:16.047Z";
const publisher = {
    id: "source-observation-1", title: "Community Watercolor Evening", public: true, published: true,
    start_date: "2026-10-08 18:00:00", end_date: "2026-10-08 19:00:00",
    changed: "2026-08-22 05:16:16", branch: "C. Burr Artz Public Library", program_type: "Arts & Crafts",
    url: "https://frederick.librarycalendar.com/event/community-watercolor-1",
};
function official(body: BodyInit = JSON.stringify([publisher]), init?: ResponseInit): Response {
    return Object.defineProperty(new Response(body, init), "url", { value: FCPL_FEED_URL });
}
function deferred<T>() {
    let resolve!: (value: T) => void;
    let reject!: (error: unknown) => void;
    const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
    return { promise, resolve, reject };
}
function store(raw = publisher) {
    const mapped = fcplMapFeed([raw], NOW)[0];
    const loc = parseLocation(mapped.event.rawLocation);
    const row: FcplObservationRow = {
        id: "normalized-1", raw_event_id: "raw-1", raw_id: "raw-1",
        raw_dtstamp: mapped.event.dtstamp, raw_fetched_at: OLD, raw_vevent: mapped.event.rawVevent,
        raw_source_domain: "frederick.librarycalendar.com", raw_source_uid: mapped.event.uid,
        raw_source_url: mapped.event.sourceUrl ?? null,
        source_uid: mapped.event.uid, source_domain: "frederick.librarycalendar.com",
        source_url: mapped.event.sourceUrl ?? null, title: mapped.event.summary,
        description: mapped.event.description ?? null, starts_at_utc: mapped.event.startsAtUtc,
        ends_at_utc: mapped.event.endsAtUtc ?? null, tzid: mapped.event.tzid, all_day: mapped.event.allDay,
        venue_name: loc.venueName ?? null, address: loc.address ?? null,
        municipality: mapped.municipality, category: mapped.category, hero_image: null, hero_image_alt: null,
    };
    const cancel = vi.fn();
    const sql = vi.fn((strings: TemplateStringsArray, ...values: unknown[]) => {
        const text = strings.join(" ").replace(/\s+/g, " ");
        let rows: unknown[] = [];
        if (text.includes("for update of raw, e"))
            rows = [{ ...row }];
        if (text.includes("update raw_events")) {
            const updates = JSON.parse(values[1] as string) as {
                id: string;
                previous: string;
                envelope: string;
                dtstamp: string;
            }[];
            const update = updates.find((item) => item.id === row.raw_id && item.previous === row.raw_vevent && item.dtstamp === row.raw_dtstamp);
            if (update) {
                row.raw_vevent = update.envelope;
                row.raw_fetched_at = String(row.raw_fetched_at) > String(values[0]) ? row.raw_fetched_at : values[0] as string;
                rows = [{ id: row.raw_id }];
            }
        }
        return Object.assign(Promise.resolve(rows), { cancel });
    });
    const begin = vi.fn(async (callback: (tx: unknown) => unknown) => callback(sql));
    return { mapped, row, query: sql, cancel, begin, sql: Object.assign(sql, { begin }) as unknown as Sql };
}
async function read(raw = publisher) {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(official(JSON.stringify([raw]))));
    const value = await readFcplPublisher();
    expect(value).not.toBeNull();
    return value!;
}
async function observe(s: ReturnType<typeof store>, receipt: object) {
    return observeFcplBatch(s.sql, [s.mapped], receipt, { deadlineAt: NOW.getTime() + 10000 });
}
describe("FCPL complete publisher producer", () => {
    beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(NOW); });
    afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });
    it("uses no-store, validates final URL and stamps before body completion", async () => {
        const chunk = deferred<Uint8Array>();
        let sent = false;
        const body = new ReadableStream<Uint8Array>({ async pull(controller) {
                if (sent) {
                    controller.close();
                    return;
                }
                sent = true;
                controller.enqueue(await chunk.promise);
            } });
        vi.stubGlobal("fetch", vi.fn().mockResolvedValue(official(body)));
        const pending = readFcplPublisher();
        await vi.advanceTimersByTimeAsync(10000);
        chunk.resolve(new TextEncoder().encode(JSON.stringify([publisher])));
        const value = await pending;
        const s = store();
        expect(fetch).toHaveBeenCalledWith(FCPL_FEED_URL, expect.objectContaining({ cache: "no-store", redirect: "follow" }));
        expect(await observeFcplBatch(s.sql, [s.mapped], value!.receipt, { deadlineAt: Date.now() + 10000 })).toMatchObject({ observed: 1 });
        expect(fcplObservedAt(s.row)).toBe(NOW.toISOString());
    });
    it.each(["https://other.example/events/feed/json", "https://frederick.librarycalendar.com/other", "http://frederick.librarycalendar.com/events/feed/json", ""])("rejects final response URL %s", async (url) => {
        const response = Object.defineProperty(new Response(JSON.stringify([publisher])), "url", { value: url });
        vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response));
        expect(await readFcplPublisher()).toBeNull();
    });
    it("bounds stalled headers and disposes a late response body", async () => {
        const headers = deferred<Response>();
        const cancel = vi.fn();
        vi.stubGlobal("fetch", vi.fn().mockReturnValue(headers.promise));
        const pending = readFcplPublisher();
        await vi.advanceTimersByTimeAsync(45000);
        expect(await pending).toBeNull();
        expect((vi.mocked(fetch).mock.calls[0][1]?.signal as AbortSignal).aborted).toBe(true);
        headers.resolve(official(new ReadableStream({ cancel })));
        await vi.advanceTimersByTimeAsync(0);
        expect(cancel).toHaveBeenCalledOnce();
        expect(vi.getTimerCount()).toBe(0);
    });
    it("bounds stalled body and creates no receipt after cancellation", async () => {
        const cancel = vi.fn();
        vi.stubGlobal("fetch", vi.fn().mockResolvedValue(official(new ReadableStream({ cancel }))));
        const pending = readFcplPublisher();
        await vi.advanceTimersByTimeAsync(45000);
        expect(await pending).toBeNull();
        expect(cancel).toHaveBeenCalledOnce();
        expect(vi.getTimerCount()).toBe(0);
    });
    it("settles on caller abort without waiting for transport", async () => {
        const controller = new AbortController();
        vi.stubGlobal("fetch", vi.fn().mockReturnValue(new Promise(() => { })));
        const pending = readFcplPublisher(controller.signal);
        controller.abort();
        expect(await pending).toBeNull();
        expect(vi.getTimerCount()).toBe(0);
    });
    it.each(["{", "{}", "[] trailing"])("rejects incomplete or invalid feed %s", async (body) => {
        vi.stubGlobal("fetch", vi.fn().mockResolvedValue(official(body)));
        expect(await readFcplPublisher()).toBeNull();
    });
    it("bounds decoded bytes even without Content-Length", async () => {
        vi.stubGlobal("fetch", vi.fn().mockResolvedValue(official(new Uint8Array(8 * 1024 * 1024 + 1))));
        expect(await readFcplPublisher()).toBeNull();
    });
    it("bounds declared oversized and pathological empty chunks", async () => {
        vi.stubGlobal("fetch", vi.fn().mockResolvedValue(official("[]", { headers: { "content-length": String(8 * 1024 * 1024 + 1) } })));
        expect(await readFcplPublisher()).toBeNull();
        const cancel = vi.fn();
        vi.mocked(fetch).mockResolvedValue(official(new ReadableStream({ pull: (controller) => controller.enqueue(new Uint8Array()), cancel })));
        expect(await readFcplPublisher()).toBeNull();
        expect(cancel).toHaveBeenCalledOnce();
    });
});
describe("FCPL exact atomic observations", () => {
    beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(NOW); });
    afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });
    it("locks both rows, renews only source check and preserves publisher dtstamp", async () => {
        const s = store();
        const value = await read();
        const stamp = s.row.raw_dtstamp;
        expect(await observe(s, value.receipt)).toEqual({ attempted: 1, observed: 1, held: 0, status: "ok" });
        expect(fcplObservedAt(s.row)).toBe(NOW.toISOString());
        expect(s.row.raw_dtstamp).toBe(stamp);
        const statements = s.query.mock.calls.map((call) => call[0].join(" "));
        expect(statements.some((text) => text.includes("for update of raw, e"))).toBe(true);
        expect(statements[0]).toContain("statement_timeout");
        expect(statements[0]).toContain("lock_timeout");
        expect(statements[0]).toContain("idle_in_transaction_session_timeout");
        expect(statements.some((text) => text.includes("update ingested_events"))).toBe(false);
        expect(vi.getTimerCount()).toBe(0);
    });
    it.each([
        ["title", "Changed title"], ["starts_at_utc", "2026-10-08T23:00:00Z"],
        ["ends_at_utc", null], ["source_url", "https://different.example/event"],
        ["address", "1 Other Street"], ["category", "other"], ["all_day", true],
        ["raw_event_id", "other-raw"], ["raw_source_uid", "other"],
        ["raw_dtstamp", "2026-08-23T09:16:16Z"],
        ["raw_vevent", JSON.stringify({ ...publisher, moderation_state: "cancelled" })],
    ])("holds a concurrent or same-stamp mismatch in %s", async (field, value) => {
        const s = store();
        const publisherRead = await read();
        Object.assign(s.row, { [field as string]: value });
        const original = s.row.raw_vevent;
        expect(await observe(s, publisherRead.receipt)).toMatchObject({ observed: 0, held: 1 });
        expect(s.row.raw_vevent).toBe(original);
        expect(s.query.mock.calls.some((call) => call[0].join(" ").includes("update raw_events"))).toBe(false);
    });
    it("rejects forged/cached receipts and mismapped raw payloads before DB work", async () => {
        const s = store();
        expect(await observe(s, {})).toMatchObject({ attempted: 0, held: 1, status: "unconfirmed" });
        const value = await read();
        s.mapped.event.rawVevent = JSON.stringify({ ...publisher, title: "other" });
        expect(await observe(s, value.receipt)).toMatchObject({ attempted: 0, held: 1 });
        expect(s.begin).not.toHaveBeenCalled();
    });
    it("qualifies eight locked rows with one bulk mutation and excludes a mismatched sibling", async () => {
        const rawRows = Array.from({ length: 8 }, (_, i) => ({ ...publisher, id: `source-${i}` }));
        vi.stubGlobal("fetch", vi.fn().mockResolvedValue(official(JSON.stringify(rawRows))));
        const value = (await readFcplPublisher())!;
        const stores = rawRows.map((raw, i) => {
            const s = store(raw);
            s.row.raw_id = `raw-${i}`;
            s.row.raw_event_id = `raw-${i}`;
            s.row.id = `normalized-${i}`;
            return s;
        });
        stores[3].row.title = "A concurrent healer changed this row";
        const s = stores[0];
        s.query.mockImplementation((strings, ...values) => {
            const text = strings.join(" ");
            let result: unknown[] = [];
            if (text.includes("for update of raw, e"))
                result = stores.map((item) => ({ ...item.row }));
            if (text.includes("update raw_events")) {
                const updates = JSON.parse(values[1] as string) as {
                    id: string;
                    envelope: string;
                }[];
                result = updates.map((update) => ({ id: update.id }));
                for (const update of updates) {
                    const target = stores.find((item) => item.row.raw_id === update.id)!;
                    target.row.raw_vevent = update.envelope;
                    target.row.raw_fetched_at = NOW.toISOString();
                }
            }
            return Object.assign(Promise.resolve(result), { cancel: s.cancel });
        });
        expect(await observeFcplBatch(s.sql, stores.map((item) => item.mapped), value.receipt, { deadlineAt: NOW.getTime() + 10000 })).toEqual({ attempted: 8, observed: 7, held: 1, status: "ok" });
        const statements = s.query.mock.calls.map((call) => call[0].join(" "));
        expect(statements.filter((text) => text.includes("for update of raw, e"))).toHaveLength(1);
        expect(statements.filter((text) => text.includes("update raw_events"))).toHaveLength(1);
        expect(stores.map((item) => fcplObservedAt(item.row))).toEqual([NOW.toISOString(), NOW.toISOString(), NOW.toISOString(), null, NOW.toISOString(), NOW.toISOString(), NOW.toISOString(), NOW.toISOString()]);
    });
    it.each(["id", "raw_event_id", "raw_source_domain", "raw_source_url", "title", "description", "tzid", "raw_dtstamp", "raw_fetched_at"])("reader refuses a receipt after %s changes", async (field) => {
        const s = store();
        const value = await read();
        expect(await observe(s, value.receipt)).toMatchObject({ observed: 1 });
        Object.assign(s.row, { [field]: field === "raw_fetched_at" ? OLD : "changed" });
        expect(fcplObservedAt(s.row)).toBeNull();
    });
    it("reader rejects altered publisher bytes and malformed/private receipt dates", async () => {
        const s = store();
        const value = await read();
        await observe(s, value.receipt);
        const original = s.row.raw_vevent;
        const payload = JSON.parse(original);
        payload.publisher = JSON.stringify({ ...publisher, title: "Unobserved" });
        s.row.raw_vevent = JSON.stringify(payload);
        expect(fcplObservedAt(s.row)).toBeNull();
        payload.publisher = publisher;
        expect(fcplObservedAt({ ...s.row, raw_vevent: JSON.stringify(payload) })).toBeNull();
        const receipt = JSON.parse(original);
        receipt[FCPL_OBSERVATION_KEY].checkedAt = "not a date";
        expect(fcplObservedAt({ ...s.row, raw_vevent: JSON.stringify(receipt) })).toBeNull();
    });
    it("uses pre-body check time while raw storage time stays monotonic", async () => {
        const s = store();
        const value = await read();
        s.row.raw_fetched_at = "2026-10-07T09:15:20.000Z";
        expect(await observe(s, value.receipt)).toMatchObject({ observed: 1 });
        expect(s.row.raw_fetched_at).toBe("2026-10-07T09:15:20.000Z");
        expect(fcplObservedAt(s.row)).toBe(NOW.toISOString());
    });
    it("cannot overwrite a newer check with an older read", async () => {
        const s = store();
        const value = await read();
        s.row.raw_vevent = fcplObservationEnvelope(s.row, s.row.raw_vevent, "2026-10-07T09:16:00.000Z");
        s.row.raw_fetched_at = "2026-10-07T09:16:00.000Z";
        const saved = s.row.raw_vevent;
        expect(await observe(s, value.receipt)).toMatchObject({ observed: 0, held: 1 });
        expect(s.row.raw_vevent).toBe(saved);
    });
    it("does not start a late acquired transaction after its deadline", async () => {
        const s = store();
        const value = await read();
        let callback!: (tx: unknown) => Promise<unknown>;
        const acquisition = deferred<unknown>();
        s.begin.mockImplementation((fn) => { callback = fn as typeof callback; return acquisition.promise; });
        const pending = observe(s, value.receipt);
        await vi.advanceTimersByTimeAsync(2000);
        expect(await pending).toMatchObject({ status: "unconfirmed", observed: 0 });
        await expect(callback(s.query)).rejects.toThrow("deadline");
        acquisition.reject(new Error("late acquisition"));
        await vi.advanceTimersByTimeAsync(0);
        expect(s.query).not.toHaveBeenCalled();
        expect(s.cancel).not.toHaveBeenCalled();
    });
    it("bounds a stalled owned query, requests best-effort cancel and fences all later writes", async () => {
        const s = store();
        const value = await read();
        const stalled = deferred<unknown[]>();
        s.query.mockImplementationOnce(() => Object.assign(stalled.promise, { cancel: s.cancel }));
        const pending = observe(s, value.receipt);
        await vi.advanceTimersByTimeAsync(2000);
        expect(await pending).toMatchObject({ status: "unconfirmed", observed: 0 });
        expect(s.cancel).toHaveBeenCalledOnce();
        stalled.resolve([]);
        await vi.advanceTimersByTimeAsync(0);
        expect(s.query).toHaveBeenCalledOnce();
        expect(vi.getTimerCount()).toBe(0);
    });
    it("reports uncertain hidden commit without late acknowledgement", async () => {
        const s = store();
        const value = await read();
        const commit = deferred<unknown>();
        s.begin.mockImplementation(async (callback) => { await callback(s.query); return commit.promise; });
        const pending = observe(s, value.receipt);
        await vi.advanceTimersByTimeAsync(2000);
        expect(await pending).toMatchObject({ status: "unconfirmed", observed: 0 });
        commit.resolve(1);
        await vi.advanceTimersByTimeAsync(0);
        expect(s.cancel).not.toHaveBeenCalled();
    });
    it("keeps cancelled lifecycle available inside valid and invalid check envelopes", async () => {
        const raw = { ...publisher, moderation_state: "cancelled" };
        const s = store(raw);
        const value = await read(raw);
        expect(await observe(s, value.receipt)).toMatchObject({ observed: 1 });
        expect(fcplStoredLifecycle(s.row.raw_vevent, publisher.title)).toMatchObject({ status: "cancelled" });
        s.row.title = "concurrently changed";
        expect(fcplObservedAt(s.row)).toBeNull();
        expect(fcplStoredLifecycle(s.row.raw_vevent, s.row.title)).toMatchObject({ status: "cancelled" });
    });
    it("rejects publisher-supplied private metadata while preserving privacy and horizon filters", () => {
        const rows = [publisher, { ...publisher, id: "private", public: false },
            { ...publisher, id: "unpublished", published: false },
            { ...publisher, id: "past", start_date: "2026-09-01 18:00:00" },
            { ...publisher, id: "far", start_date: "2027-01-01 18:00:00" },
            { ...publisher, id: "forged", [FCPL_OBSERVATION_KEY]: { checkedAt: NOW.toISOString() } },
            null, [], { [FCPL_OBSERVATION_KEY]: {}, publisher: JSON.stringify(publisher) }];
        expect(fcplMapFeed(rows, NOW).map((row) => row.event.uid)).toEqual([publisher.id]);
    });
});
