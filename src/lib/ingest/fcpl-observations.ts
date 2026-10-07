import type { Sql } from "postgres";
import { createAbortDeadline } from "@/lib/promise-deadline";
import type { FcplMapped } from "./fcpl";
import { parseLocation } from "./location";
import { FCPL_FEED_URL, FCPL_OBSERVATION_DOMAIN, fcplTimestamp, fcplPublisherPayload, fcplStoredCheckedAt, fcplFactsHash, fcplObservationEnvelope, type FcplObservationFacts, type FcplObservationRow, } from "./fcpl-observation-envelope";
const FEED_DEADLINE_MS = 45000;
const MAX_FEED_BYTES = 8 * 1024 * 1024;
const MAX_FEED_READS = 4096;
const BATCH_DEADLINE_MS = 2000;
const trustedReads = new WeakMap<object, {
    checkedAt: string;
    payloads: Set<string>;
}>();
export type FcplPublisherRead = {
    feed: unknown[];
    receipt: object;
};
function stopped(): Error { return new Error("FCPL observation deadline or caller cancellation"); }
function cancelBody(body: ReadableStream<Uint8Array> | null): void {
    if (body && !body.locked)
        void body.cancel().catch(() => { });
}
function withAbort<T>(promise: PromiseLike<T>, signal: AbortSignal, late?: (value: T) => void): Promise<T> {
    return new Promise<T>((resolve, reject) => {
        let settled = false;
        const abort = () => { settled = true; signal.removeEventListener("abort", abort); reject(stopped()); };
        if (signal.aborted)
            abort();
        else
            signal.addEventListener("abort", abort, { once: true });
        Promise.resolve(promise).then((value) => {
            if (settled || signal.aborted)
                late?.(value);
            else {
                settled = true;
                resolve(value);
            }
            signal.removeEventListener("abort", abort);
        }, (error) => {
            if (!settled) {
                settled = true;
                reject(error);
            }
            signal.removeEventListener("abort", abort);
        });
    });
}
/** A receipt exists only after a complete, bounded, uncached official response. */
export async function readFcplPublisher(signal?: AbortSignal): Promise<FcplPublisherRead | null> {
    const deadline = createAbortDeadline(FEED_DEADLINE_MS, signal);
    let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
    let response: Response | undefined;
    try {
        if (deadline.signal.aborted)
            return null;
        // Conservative pre-body time; completion/assembly never makes this newer.
        const checkedAtMs = Date.now();
        const checkedAt = new Date(checkedAtMs).toISOString();
        const expired = () => deadline.signal.aborted || Date.now() >= checkedAtMs + FEED_DEADLINE_MS;
        response = await withAbort(fetch(FCPL_FEED_URL, {
            cache: "no-store", redirect: "follow", signal: deadline.signal,
            headers: { "User-Agent": "FrederickRadius/1.0 (+https://frederickradius.app; library event index)" },
        }), deadline.signal, (late) => cancelBody(late.body));
        if (!response.ok || response.url !== FCPL_FEED_URL || !response.body)
            return null;
        const declared = Number(response.headers.get("content-length"));
        if (declared > MAX_FEED_BYTES)
            return null;
        reader = response.body.getReader();
        const decoder = new TextDecoder("utf-8", { fatal: true });
        let bytes = 0;
        let body = "";
        let complete = false;
        for (let reads = 0; reads < MAX_FEED_READS; reads++) {
            const part = await withAbort(reader.read(), deadline.signal);
            if (expired())
                throw stopped();
            if (part.done) {
                complete = true;
                body += decoder.decode();
                break;
            }
            bytes += part.value.byteLength;
            if (bytes > MAX_FEED_BYTES)
                return null;
            body += decoder.decode(part.value, { stream: true });
        }
        if (!complete || expired())
            return null;
        const feed: unknown = JSON.parse(body);
        if (!Array.isArray(feed))
            return null;
        const receipt = {};
        // Retain exact serialized payloads, not a much larger per-row digest array.
        // The decoded feed cap also bounds the sum of these serialized bytes.
        const payloads = new Set<string>();
        for (const row of feed) {
            if (expired())
                return null;
            payloads.add(JSON.stringify(row));
        }
        if (expired())
            return null;
        trustedReads.set(receipt, { checkedAt, payloads });
        return { feed, receipt };
    }
    catch {
        return null;
    }
    finally {
        if (reader) {
            void reader.cancel().catch(() => { });
            try {
                reader.releaseLock();
            }
            catch { /* A pending native read owns its lock until cancellation. */ }
        }
        else
            cancelBody(response?.body ?? null);
        deadline.dispose();
    }
}
function mappedFacts(mapped: FcplMapped): FcplObservationFacts {
    const { event, municipality, category } = mapped;
    const loc = parseLocation(event.rawLocation);
    return {
        source_uid: event.uid, source_domain: FCPL_OBSERVATION_DOMAIN,
        source_url: event.sourceUrl ?? null, title: event.summary,
        description: event.description ?? null, starts_at_utc: event.startsAtUtc,
        ends_at_utc: event.endsAtUtc ?? null, tzid: event.tzid, all_day: event.allDay,
        venue_name: loc.venueName ?? null, address: loc.address ?? null,
        municipality, category, hero_image: event.heroImage ?? null, hero_image_alt: event.heroImageAlt ?? null,
    };
}
export type FcplObservationResult = {
    attempted: number;
    observed: number;
    held: number;
    status: "ok" | "unconfirmed";
};
/**
 * At most eight rows per transaction, with locks on BOTH stored rows. BEGIN and
 * hidden COMMIT are ordinary driver Promises: the route wait is bounded, not
 * proof they were cancelled. Query.cancel is best effort and only invoked for
 * the still-owned active statement. Server statement/lock/idle limits and phase
 * fences prevent a late acquired transaction from starting observation writes.
 */
export async function observeFcplBatch(sql: Sql, mapped: FcplMapped[], receipt: object, options: {
    deadlineAt: number;
    signal?: AbortSignal;
}): Promise<FcplObservationResult> {
    const trusted = trustedReads.get(receipt);
    if (!trusted || mapped.length > 8) {
        return { attempted: 0, observed: 0, held: mapped.length, status: "unconfirmed" };
    }
    const candidates = mapped.filter((item) => trusted.payloads.has(item.event.rawVevent));
    if (candidates.length !== mapped.length) {
        return { attempted: 0, observed: 0, held: mapped.length, status: "unconfirmed" };
    }
    if (!mapped.length)
        return { attempted: 0, observed: 0, held: 0, status: "ok" };
    const remaining = Math.min(BATCH_DEADLINE_MS, options.deadlineAt - Date.now());
    if (remaining <= 0 || options.signal?.aborted) {
        return { attempted: 0, observed: 0, held: mapped.length, status: "unconfirmed" };
    }
    const deadline = createAbortDeadline(remaining, options.signal);
    const deadlineAt = Date.now() + remaining;
    type OwnedQuery = PromiseLike<unknown> & {
        cancel: () => unknown;
    };
    let active: OwnedQuery | undefined;
    let closed = false;
    const fence = () => { if (closed || deadline.signal.aborted || Date.now() >= deadlineAt)
        throw stopped(); };
    const cancelOwned = () => {
        const query = active;
        if (query) {
            try {
                void Promise.resolve(query.cancel()).catch(() => { });
            }
            catch { /* Best effort. */ }
        }
    };
    deadline.signal.addEventListener("abort", cancelOwned, { once: true });
    const query = async <T>(pending: PromiseLike<T> & {
        cancel: () => unknown;
    }): Promise<T> => {
        fence();
        active = pending;
        try {
            const result = await withAbort(pending, deadline.signal);
            fence();
            return result;
        }
        finally {
            if (active === pending)
                active = undefined;
        }
    };
    try {
        const transaction = sql.begin(async (tx) => {
            fence(); // BEGIN may acquire a connection long after our caller stopped waiting.
            const serverMs = Math.max(1, Math.min(1500, deadlineAt - Date.now()));
            await query(tx `
        select set_config('statement_timeout', ${`${serverMs}ms`}, true),
               set_config('lock_timeout', ${`${serverMs}ms`}, true),
               set_config('idle_in_transaction_session_timeout', ${`${serverMs}ms`}, true)
      `);
            const rows = await query(tx<FcplObservationRow[]> `
        select e.id, e.raw_event_id, e.source_uid, e.source_domain, e.source_url,
               e.title, e.description, e.starts_at_utc, e.ends_at_utc, e.tzid,
               e.all_day, e.venue_name, e.address, e.municipality, e.category,
               e.hero_image, e.hero_image_alt,
               raw.id as raw_id, raw.source_uid as raw_source_uid,
               raw.source_domain as raw_source_domain, raw.source_url as raw_source_url,
               raw.dtstamp as raw_dtstamp, raw.fetched_at as raw_fetched_at, raw.raw_vevent
        from raw_events raw
        join ingested_events e on e.raw_event_id = raw.id
          and e.source_domain = raw.source_domain and e.source_uid = raw.source_uid
        where raw.source_domain = ${FCPL_OBSERVATION_DOMAIN}
          and raw.source_uid = any(${candidates.map((item) => item.event.uid)})
        order by raw.id
        for update of raw, e
      `);
            const updates = new Map<string, {
                id: string;
                previous: string;
                envelope: string;
                dtstamp: string;
            }>();
            for (const item of candidates) {
                fence();
                const row = rows.find((candidate) => candidate.source_uid === item.event.uid);
                if (!row || row.raw_id !== row.raw_event_id ||
                    row.raw_source_uid !== item.event.uid || row.raw_source_domain !== FCPL_OBSERVATION_DOMAIN ||
                    row.raw_source_url !== (item.event.sourceUrl ?? null) ||
                    fcplTimestamp(row.raw_dtstamp) !== fcplTimestamp(item.event.dtstamp) ||
                    fcplPublisherPayload(row.raw_vevent) !== item.event.rawVevent ||
                    fcplFactsHash(row) !== fcplFactsHash(mappedFacts(item)) ||
                    (fcplStoredCheckedAt(row.raw_vevent) ?? "") > trusted.checkedAt)
                    continue;
                const envelope = fcplObservationEnvelope(row, item.event.rawVevent, trusted.checkedAt);
                updates.set(row.raw_id, {
                    id: row.raw_id, previous: row.raw_vevent, envelope,
                    dtstamp: fcplTimestamp(row.raw_dtstamp)!,
                });
            }
            fence();
            // One mutation round trip; the <=8 exact rows stay locked throughout.
            const updated = updates.size ? await query(tx<{
                id: string;
            }[]> `
        update raw_events raw
        set raw_vevent = incoming.envelope,
            fetched_at = greatest(raw.fetched_at, ${trusted.checkedAt}::timestamptz)
        from jsonb_to_recordset(${JSON.stringify([...updates.values()])}::jsonb)
          as incoming(id uuid, previous text, envelope text, dtstamp timestamptz)
        where raw.id = incoming.id and raw.raw_vevent = incoming.previous
          and raw.dtstamp = incoming.dtstamp
        returning raw.id
      `) : [];
            fence(); // No post-deadline result authorizes hidden COMMIT.
            return updated.length;
        });
        const observed = await withAbort(transaction, deadline.signal);
        fence();
        return { attempted: candidates.length, observed, held: candidates.length - observed, status: "ok" };
    }
    catch {
        // A lost transport/hidden COMMIT acknowledgement leaves an uncertain outcome.
        return { attempted: candidates.length, observed: 0, held: candidates.length, status: "unconfirmed" };
    }
    finally {
        closed = true;
        deadline.signal.removeEventListener("abort", cancelOwned);
        deadline.dispose();
    }
}
