import { readFileSync } from "node:fs";
import { basename } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Hours } from "@/data/places";
import { MERCHANT_HOURS_SOURCES } from "@/lib/merchant-hours";
import { parseMerchantOfficialHours } from "../../../scripts/lib/merchant-official-hours";

afterEach(() => {
  vi.useRealTimers();
  vi.doUnmock("node:fs");
  vi.doUnmock("@/data/places-merchant-hours.json");
  vi.doUnmock("@/data/places-client.json");
  vi.doUnmock("@/data/places-client-hours.json");
  vi.resetModules();
});

describe("qualified hours canonical projection", () => {
  it("ships a checked display table through server and both generated clients without making a visitability claim", async () => {
    const now = new Date("2026-10-20T14:00:00.000Z");
    const source = MERCHANT_HOURS_SOURCES.find((row) => row.slug === "gravel-and-grind-frederick")!;
    const row = parseMerchantOfficialHours(source, { url: source.url, html: readFileSync("tests/fixtures/merchant-hours/gravel-and-grind.html", "utf8"), observedAt: now.toISOString() }, now);
    // Deliberately synthetic long service hours exercise the claim/display
    // boundary. They are mocked test data, never an enrolled source fact.
    row.hours.mon = [{ open: "00:00", close: "23:00" }];
    row.qualification = { scope: "bar", label: "Service hours", note: "These service hours do not establish public access.", usage: "display_only" };
    const writes = new Map<string, string>();
    vi.useFakeTimers(); vi.setSystemTime(now);
    vi.resetModules();
    vi.doMock("@/data/places-merchant-hours.json", () => ({ default: { schema_version: 1, places: [row], review: [] } }));
    vi.doMock("node:fs", async () => ({ ...await vi.importActual<typeof import("node:fs")>("node:fs"), writeFileSync: vi.fn((path: string, data: string) => writes.set(basename(path), data)) }));
    const { getPlaceBySlug } = await import("./places");
    const server = getPlaceBySlug(source.slug, undefined, now)!;
    expect(server.hours_verified).toBe(true);
    expect(server.hours?._official?.qualification).toEqual(row.qualification);
    expect(server.hours?.mon).toEqual(row.hours.mon);
    expect(server.open_status.state).toBe("unknown");
    const { hasReliableHours } = await import("../hours-availability");
    expect(hasReliableHours(server, now)).toBe(false);

    // Execute the actual artifact transformation while intercepting every write.
    await import("../../../scripts/build-client-places");
    const full = JSON.parse(writes.get("places-client.json")!) as { slug: string; hours?: Hours; hours_verified?: boolean; open_status?: { state: string } }[];
    const compact = JSON.parse(writes.get("places-client-hours.json")!) as { slug: string; hours: Hours }[];
    expect(full.find((place) => place.slug === source.slug)).toMatchObject({ hours_verified: true, hours: server.hours });
    expect(compact.find((place) => place.slug === source.slug)?.hours).toEqual(server.hours);
    vi.doMock("@/data/places-client.json", () => ({ default: full }));
    vi.doMock("@/data/places-client-hours.json", () => ({ default: compact }));
    vi.resetModules();
    const { clientPlaceBySlug } = await import("./places-client");
    const { clientPlaceHours } = await import("./places-client-hours");
    expect(clientPlaceBySlug(source.slug)?.hours).toEqual(server.hours);
    expect(clientPlaceBySlug(source.slug)?.open_status.state).toBe("unknown");
    expect(clientPlaceHours(now).find((place) => place.slug === source.slug)?.hours).toEqual(server.hours);
    const expired = new Date(row.expires_at); vi.setSystemTime(expired);
    expect(clientPlaceBySlug(source.slug)?.hours).toBeUndefined();
    expect(clientPlaceHours(expired).some((place) => place.slug === source.slug)).toBe(false);
  });
});
