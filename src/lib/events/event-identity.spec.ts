import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { EventWithMeta } from "@/lib/loaders/events";

const mocks = vi.hoisted(() => ({
  getSql: vi.fn(),
}));

vi.mock("@/lib/db/client", () => ({
  getSql: mocks.getSql,
}));

import {
  EVENT_IDENTITY_BATCH_LIMIT,
  EventIdentityStoreUnavailableError,
  archivedEventFromSnapshot,
  archivedEventsBySlugs,
  persistEventIdentity,
  upcomingArchivedEventRoutes,
} from "./event-identity";

function snapshot(): EventWithMeta {
  return {
    slug: "current-event-2026-07-30",
    title: "Current event",
    description: "",
    starts_at: "2026-07-30T22:00:00.000Z",
    ends_at: "2026-07-31T00:00:00.000Z",
    timezone: "America/New_York",
    venue_name: "Test venue",
    address: "Frederick, MD",
    geom: { lng: -77.4105, lat: 39.4143 },
    municipality: "frederick",
    category: "community",
    audience: [],
    is_free: true,
    source: "celebrate",
    is_verified: false,
    source_id: "stable-publisher-uid",
    source_url: "https://example.com/event",
    license: "test",
    first_seen_at: "2026-07-29T12:00:00.000Z",
    last_verified_at: "2026-07-29T12:00:00.000Z",
    confidence: "partner",
    geo_confidence: "exact_address",
    category_name: "Community",
    municipality_name: "Frederick",
  };
}

describe("event identity archive", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("rebinds a valid snapshot to its canonical slug", () => {
    expect(
      archivedEventFromSnapshot(
        snapshot(),
        "renamed-event-2026-07-30",
      )?.slug,
    ).toBe("renamed-event-2026-07-30");
  });

  it("rejects malformed snapshots before an event page can render them", () => {
    expect(
      archivedEventFromSnapshot({
        ...snapshot(),
        geom: { lng: 900, lat: 39.4 },
      }),
    ).toBeNull();
  });

  it("keeps identity, aliases, tombstones, and saved snapshots server-only", () => {
    const sql = readFileSync(
      new URL(
        "../../../drizzle/0038_event_identity_archive.sql",
        import.meta.url,
      ),
      "utf8",
    );
    expect(sql).toContain("event_source_identities");
    expect(sql).toContain("event_slug_aliases");
    expect(sql).toContain("event_tombstones");
    expect(sql).toContain("ADD COLUMN IF NOT EXISTS event_snapshot jsonb");
    expect(sql).toContain("ENABLE ROW LEVEL SECURITY");
    expect(sql).toContain("FROM anon, authenticated");
  });

  it("opens only the minimal exact-slug event snapshot RPC", () => {
    const sql = readFileSync(
      new URL(
        "../../../drizzle/0040_public_event_archive_by_slug.sql",
        import.meta.url,
      ),
      "utf8",
    );
    expect(sql).toContain("RETURNS TABLE (\n  canonical_slug text,\n  snapshot jsonb");
    expect(sql).toContain("STABLE\nSTRICT\nSECURITY DEFINER");
    expect(sql).toContain("SET search_path = ''");
    expect(sql).toContain("ROWS 1");
    expect(sql).toContain("coalesce(tombstone.last_snapshot, canonical.snapshot)");
    expect(sql).toContain("OPERATOR(pg_catalog.~) '^[a-z0-9][a-z0-9-]{0,199}$'");
    expect(sql).toContain("requested_slug NOT IN ('constructor', 'prototype')");
    expect(sql).toContain("FROM PUBLIC, anon, authenticated, service_role");
    expect(sql).toContain("TO anon, authenticated, service_role");
    expect(sql).not.toContain("RETURNS TABLE (\n  id uuid");
  });

  it("resolves canonical and historical slugs in one bounded archive query", async () => {
    const current = snapshot();
    const sql = vi.fn(() =>
      Promise.resolve([
        {
          requested_slug: "old-event-title-2026-07-30",
          id: "11111111-1111-4111-8111-111111111111",
          canonical_slug: current.slug,
          snapshot: { ...current, slug: "old-event-title-2026-07-30" },
          tombstoned: false,
          last_seen_at: "2026-08-03T12:00:00.000Z",
        },
      ]),
    );
    mocks.getSql.mockReturnValue(sql);

    const result = await archivedEventsBySlugs([
      "old-event-title-2026-07-30",
      "missing-event-2026-07-30",
    ]);

    expect(sql).toHaveBeenCalledTimes(1);
    expect(result.matches).toHaveLength(1);
    expect(result.matches[0]).toMatchObject({
      requestedSlug: "old-event-title-2026-07-30",
      canonicalSlug: current.slug,
      event: { slug: current.slug },
    });
    expect(result.unresolvedSlugs).toEqual([]);
    expect(sql.mock.calls[0]).toContainEqual([
      "old-event-title-2026-07-30",
      "missing-event-2026-07-30",
    ]);
  });

  it("caps archive batch input before the single database operation", async () => {
    const boundValues: unknown[] = [];
    const sql = vi.fn(
      (_strings: TemplateStringsArray, ...values: unknown[]) => {
        boundValues.push(...values);
        return Promise.resolve([]);
      },
    );
    mocks.getSql.mockReturnValue(sql);
    const requested = Array.from(
      { length: EVENT_IDENTITY_BATCH_LIMIT + 25 },
      (_, index) => `event-${index}`,
    );

    await archivedEventsBySlugs(requested);

    expect(sql).toHaveBeenCalledTimes(1);
    const boundSlugs = boundValues[0] as string[];
    expect(boundSlugs).toHaveLength(EVENT_IDENTITY_BATCH_LIMIT);
  });

  it("reports an unavailable archive instead of treating every slug as missing", async () => {
    mocks.getSql.mockReturnValue(null);

    await expect(
      archivedEventsBySlugs(["saved-event-2026-07-30"]),
    ).rejects.toBeInstanceOf(EventIdentityStoreUnavailableError);
  });

  it("returns only valid canonical routes for the bounded sitemap read", async () => {
    const sql = vi.fn(() =>
      Promise.resolve([
        {
          canonical_slug: "alive-at-five-2026-08-06",
          starts_at: new Date("2026-08-06T21:00:00.000Z"),
          snapshot_at: new Date("2026-08-03T12:00:00.000Z"),
        },
        {
          canonical_slug: "Not a route",
          starts_at: "2026-08-07T21:00:00.000Z",
          snapshot_at: "2026-08-03T12:00:00.000Z",
        },
      ]),
    );
    mocks.getSql.mockReturnValue(sql);

    await expect(
      upcomingArchivedEventRoutes({
        now: new Date("2026-08-03T12:00:00.000Z"),
      }),
    ).resolves.toEqual([
      {
        slug: "alive-at-five-2026-08-06",
        startsAt: "2026-08-06T21:00:00.000Z",
        lastModifiedAt: "2026-08-03T12:00:00.000Z",
      },
    ]);
  });

  it("fails soft when the event archive cannot answer before its deadline", async () => {
    mocks.getSql.mockReturnValue(
      vi.fn(() => Object.assign(new Promise(() => {}), { cancel: vi.fn() })),
    );

    await expect(
      upcomingArchivedEventRoutes({ timeoutMs: 5 }),
    ).resolves.toEqual([]);
  });

  it.each(["cancelled", "postponed"] as const)(
    "does not create a canonical page for a brand-new %s-only event",
    async (status) => {
      const transactionQueries: string[] = [];
      const tx = Object.assign(
        vi.fn((strings: TemplateStringsArray) => {
          const text = Array.from(strings).join(" ");
          transactionQueries.push(text);
          return Promise.resolve([]);
        }),
        { json: vi.fn((value: unknown) => value) },
      );
      const sql = {
        begin: vi.fn(
          async (callback: (transaction: typeof tx) => Promise<unknown>) =>
            callback(tx),
        ),
      };
      mocks.getSql.mockReturnValue(sql);

      await expect(
        persistEventIdentity({ ...snapshot(), status }),
      ).resolves.toBeNull();

      expect(
        transactionQueries.some((query) =>
          query.includes("insert into public.event_canonical_records"),
        ),
      ).toBe(false);
    },
  );

  it.each(["cancelled", "postponed"] as const)(
    "updates a previously scheduled canonical event to %s",
    async (status) => {
      const transactionCalls: unknown[][] = [];
      const tx = Object.assign(
        vi.fn((strings: TemplateStringsArray, ...values: unknown[]) => {
          const text = Array.from(strings).join(" ");
          transactionCalls.push([text, ...values]);
          if (
            text.includes("from public.event_source_identities as identity")
          ) {
            return Promise.resolve([
              {
                id: "11111111-1111-4111-8111-111111111111",
                canonical_slug: snapshot().slug,
              },
            ]);
          }
          return Promise.resolve([]);
        }),
        { json: vi.fn((value: unknown) => value) },
      );
      const sql = {
        begin: vi.fn(
          async (callback: (transaction: typeof tx) => Promise<unknown>) =>
            callback(tx),
        ),
      };
      mocks.getSql.mockReturnValue(sql);

      const changed = { ...snapshot(), status };
      await expect(persistEventIdentity(changed)).resolves.toMatchObject({
        canonicalSlug: snapshot().slug,
        snapshot: expect.objectContaining({ status }),
      });

      const snapshotUpdate = transactionCalls.find(([query]) =>
        String(query).includes("set snapshot ="),
      );
      expect(snapshotUpdate).toContain(status);
      expect(
        transactionCalls.some(([query]) =>
          String(query).includes(
            "insert into public.event_canonical_records",
          ),
        ),
      ).toBe(false);
    },
  );
});
