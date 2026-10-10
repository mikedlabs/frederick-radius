/** FCPL-only checked-source metadata. This is trusted code provenance, not a signature. */
import { createHash } from "node:crypto";
export const FCPL_OBSERVATION_KEY = "__radius_fcpl_observation_v1";
export const FCPL_FEED_URL = "https://frederick.librarycalendar.com/events/feed/json";
export const FCPL_OBSERVATION_DOMAIN = "frederick.librarycalendar.com";
export type FcplObservationFacts = {
    source_uid: string;
    source_domain: string;
    source_url: string | null;
    title: string;
    description: string | null;
    starts_at_utc: string | Date;
    ends_at_utc: string | Date | null;
    tzid: string;
    all_day: boolean;
    venue_name: string | null;
    address: string | null;
    municipality: string;
    category: string | null;
    hero_image: string | null;
    hero_image_alt: string | null;
};
export type FcplObservationRow = FcplObservationFacts & {
    id: string;
    raw_event_id: string;
    raw_id: string;
    raw_dtstamp: string | Date;
    raw_source_uid: string;
    raw_source_domain: string;
    raw_source_url: string | null;
    raw_fetched_at: string | Date;
    raw_vevent: string;
};
type StoredObservation = {
    checkedAt: string;
    feedUrl: string;
    rawId: string;
    normalizedId: string;
    publisherHash: string;
    factsHash: string;
    dtstamp: string;
};
export function fcplTimestamp(value: unknown): string | null {
    if (!(typeof value === "string" || value instanceof Date))
        return null;
    const date = value instanceof Date ? value : new Date(value);
    return Number.isFinite(date.getTime()) ? date.toISOString() : null;
}
export function fcplPayloadHash(value: string): string {
    return createHash("sha256").update(value).digest("hex");
}
export function fcplFactsHash(row: FcplObservationFacts): string {
    // Geocoding has its own provenance/gates and may run after this source read.
    // Bind the publisher-derived destination, rather than invalidating the check
    // when that independent pipeline resolves its coordinates.
    return fcplPayloadHash(JSON.stringify([
        row.source_uid, row.source_domain, row.source_url, row.title, row.description,
        fcplTimestamp(row.starts_at_utc), fcplTimestamp(row.ends_at_utc), row.tzid,
        row.all_day, row.venue_name, row.address, row.municipality, row.category,
        row.hero_image, row.hero_image_alt,
    ]));
}
export function hasFcplReservedKeys(raw: unknown): boolean {
    return Boolean(raw && typeof raw === "object" &&
        Object.keys(raw).some((key) => key.startsWith("__radius_fcpl_")));
}
function decoded(rawVevent: string): Record<string, unknown> | null {
    try {
        const value: unknown = JSON.parse(rawVevent);
        return value && typeof value === "object" && !Array.isArray(value)
            ? value as Record<string, unknown> : null;
    }
    catch {
        return null;
    }
}
/** Keep lifecycle authority even if a stored check receipt no longer matches. */
export function fcplPublisherPayload(rawVevent: string): string | null {
    const value = decoded(rawVevent);
    if (!value)
        return null;
    if (Object.keys(value).length === 2 && FCPL_OBSERVATION_KEY in value &&
        typeof value.publisher === "string") {
        const publisher = decoded(value.publisher);
        return publisher && !hasFcplReservedKeys(publisher) ? value.publisher : null;
    }
    return hasFcplReservedKeys(value) ? null : rawVevent;
}
export function fcplStoredCheckedAt(rawVevent: string): string | null {
    const value = decoded(rawVevent);
    const receipt = value?.[FCPL_OBSERVATION_KEY];
    return receipt && typeof receipt === "object"
        ? fcplTimestamp((receipt as Partial<StoredObservation>).checkedAt) : null;
}
export function fcplObservationEnvelope(row: FcplObservationRow, publisher: string, checkedAt: string): string {
    const observation: StoredObservation = {
        checkedAt, feedUrl: FCPL_FEED_URL, rawId: row.raw_id, normalizedId: row.id,
        publisherHash: fcplPayloadHash(publisher), factsHash: fcplFactsHash(row),
        dtstamp: fcplTimestamp(row.raw_dtstamp)!,
    };
    return JSON.stringify({ [FCPL_OBSERVATION_KEY]: observation, publisher });
}
/** Prefer a matching exact publisher check; callers retain legacy write-date fallback. */
export function fcplObservedAt(row: FcplObservationRow): string | null {
    if (row.source_domain !== FCPL_OBSERVATION_DOMAIN ||
        row.raw_source_domain !== row.source_domain ||
        row.raw_source_uid !== row.source_uid || row.raw_source_url !== row.source_url ||
        row.raw_id !== row.raw_event_id)
        return null;
    const value = decoded(row.raw_vevent);
    const publisher = fcplPublisherPayload(row.raw_vevent);
    if (!value || !publisher || typeof value[FCPL_OBSERVATION_KEY] !== "object" ||
        value[FCPL_OBSERVATION_KEY] === null)
        return null;
    const check = value[FCPL_OBSERVATION_KEY] as Partial<StoredObservation>;
    const checkedAt = fcplTimestamp(check.checkedAt);
    if (!checkedAt || check.checkedAt !== checkedAt || check.feedUrl !== FCPL_FEED_URL ||
        check.rawId !== row.raw_id || check.normalizedId !== row.id ||
        check.publisherHash !== fcplPayloadHash(publisher) ||
        check.factsHash !== fcplFactsHash(row) ||
        check.dtstamp !== fcplTimestamp(row.raw_dtstamp) ||
        (fcplTimestamp(row.raw_fetched_at) ?? "") < checkedAt)
        return null;
    return checkedAt;
}
