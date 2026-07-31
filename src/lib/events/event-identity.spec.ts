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
  archivedEventFromSnapshot,
  persistEventIdentity,
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
