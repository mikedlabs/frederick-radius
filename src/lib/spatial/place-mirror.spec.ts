import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getSql: vi.fn(),
}));

vi.mock("@/lib/db/client", () => ({
  getSql: mocks.getSql,
}));

import {
  auditSpatialPlaceMirror,
  syncSpatialPlaceMirror,
} from "./place-mirror";
import { spatialCatalogSnapshot } from "./place-catalog";

function queryText(strings: TemplateStringsArray): string {
  return Array.from(strings).join(" ");
}

describe("PostGIS place mirror", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("writes all batches, retires stale rows, and stamps state last", async () => {
    const catalog = spatialCatalogSnapshot();
    const auditRows = catalog.places.map((place) => ({
      slug: place.slug,
      lng: place.lng,
      lat: place.lat,
      has_location: true,
    }));
    const transactionQueries: string[] = [];
    const tx = vi.fn(
      (strings: TemplateStringsArray) => {
        const text = queryText(strings);
        transactionQueries.push(text);
        return Promise.resolve([]);
      },
    );
    const root = Object.assign(
      vi.fn((strings: TemplateStringsArray) => {
        const text = queryText(strings);
        if (text.includes("select slug, lng, lat")) {
          return Promise.resolve(auditRows);
        }
        if (text.includes("select catalog_hash")) {
          return Promise.resolve([
            {
              catalog_hash: catalog.hash,
              place_count: catalog.count,
              synced_at: "2026-07-29T12:00:00.000Z",
            },
          ]);
        }
        return Promise.resolve([]);
      }),
      {
        begin: vi.fn(
          async (callback: (transaction: typeof tx) => Promise<unknown>) =>
            callback(tx),
        ),
      },
    );
    mocks.getSql.mockReturnValue(root);

    const result = await syncSpatialPlaceMirror();

    expect(result.audit.current).toBe(true);
    expect(result.checked).toBe(catalog.count);
    expect(result.upserted).toBe(0);
    expect(
      transactionQueries.some((query) => query.includes("is distinct from")),
    ).toBe(true);
    expect(
      transactionQueries.filter((query) =>
        query.includes("jsonb_to_recordset"),
      ).length,
    ).toBe(Math.ceil(catalog.count / 250));
    const retireIndex = transactionQueries.findIndex((query) =>
      query.includes("update public.places"),
    );
    const stateIndex = transactionQueries.findIndex((query) =>
      query.includes("insert into public.place_spatial_sync_state"),
    );
    expect(retireIndex).toBeGreaterThan(-1);
    expect(stateIndex).toBeGreaterThan(retireIndex);
  });

  it("cancels an in-flight batch and never retires or stamps partial work", async () => {
    const controller = new AbortController();
    let rejectBatch: ((error: Error) => void) | undefined;
    const cancel = vi.fn(() => {
      rejectBatch?.(new Error("query cancelled"));
    });
    const hungBatch = Object.assign(
      new Promise<never>((_resolve, reject) => {
        rejectBatch = reject;
      }),
      { cancel },
    );
    const transactionQueries: string[] = [];
    const tx = vi.fn((strings: TemplateStringsArray) => {
      const text = queryText(strings);
      transactionQueries.push(text);
      if (text.includes("jsonb_to_recordset")) return hungBatch;
      return Promise.resolve([]);
    });
    const root = Object.assign(vi.fn(), {
      begin: vi.fn(
        async (callback: (transaction: typeof tx) => Promise<unknown>) =>
          callback(tx),
      ),
    });
    mocks.getSql.mockReturnValue(root);

    const sync = syncSpatialPlaceMirror({ signal: controller.signal });
    await vi.waitFor(() => {
      expect(
        transactionQueries.some((query) =>
          query.includes("jsonb_to_recordset"),
        ),
      ).toBe(true);
    });
    controller.abort();

    await expect(sync).rejects.toThrow();
    expect(cancel).toHaveBeenCalledOnce();
    expect(
      transactionQueries.some((query) => query.includes("update public.places")),
    ).toBe(false);
    expect(
      transactionQueries.some((query) =>
        query.includes("insert into public.place_spatial_sync_state"),
      ),
    ).toBe(false);
  });

  it("reports a missing migration without exposing a database error", async () => {
    const root = vi.fn().mockRejectedValue(
      new Error("postgres://secret@example.test"),
    );
    mocks.getSql.mockReturnValue(root);

    await expect(auditSpatialPlaceMirror()).rejects.toThrow(
      "Apply drizzle/0037_places_postgis.sql first",
    );
    await expect(auditSpatialPlaceMirror()).rejects.not.toThrow(
      "postgres://secret",
    );
  });

  it("uses the declared coordinate tolerance while retaining exact-hash diagnostics", async () => {
    const catalog = spatialCatalogSnapshot();
    const auditRows = catalog.places.map((place, index) => ({
      slug: place.slug,
      lng: index === 0 ? place.lng + 5e-10 : place.lng,
      lat: place.lat,
      has_location: true,
    }));
    const root = vi.fn((strings: TemplateStringsArray) => {
      const text = queryText(strings);
      if (text.includes("select slug, lng, lat")) {
        return Promise.resolve(auditRows);
      }
      if (text.includes("select catalog_hash")) {
        return Promise.resolve([{
          catalog_hash: catalog.hash,
          place_count: catalog.count,
          synced_at: "2026-08-03T12:00:00.000Z",
        }]);
      }
      return Promise.resolve([]);
    });
    mocks.getSql.mockReturnValue(root);

    const audit = await auditSpatialPlaceMirror();

    expect(audit.coordinateMismatches).toEqual([]);
    expect(audit.actualHashMatchesExpected).toBe(false);
    expect(audit.stateHashMatchesExpected).toBe(true);
    expect(audit.stateCountMatchesExpected).toBe(true);
    expect(audit.current).toBe(true);
  });
});
