import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getDb: vi.fn(),
  fetchPageRecordsResult: vi.fn(),
  getScannerIncidentsResult: vi.fn(),
}));

vi.mock("@/lib/db/client", () => ({ getDb: mocks.getDb }));
vi.mock("@/lib/scanner/scannerPatterns", () => ({
  fetchPageRecordsResult: mocks.fetchPageRecordsResult,
}));
vi.mock("@/lib/integrations/scannerIncidents", () => ({
  getScannerIncidentsResult: mocks.getScannerIncidentsResult,
}));

import {
  archiveScannerIncidents,
  chunkArchiveRows,
  dedupeArchiveRows,
} from "./incidentArchive";

describe("scanner archive batching", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.fetchPageRecordsResult.mockResolvedValue({
      data: [],
      available: true,
    });
    mocks.getScannerIncidentsResult.mockResolvedValue({
      data: [],
      available: true,
    });
  });

  it("reports an unavailable database as an incomplete archive", async () => {
    mocks.getDb.mockReturnValue(null);

    await expect(archiveScannerIncidents()).resolves.toEqual({
      seen: 0,
      inserted: 0,
      complete: false,
      reason: "database_unavailable",
    });
  });

  it("reports failed source reads instead of calling an outage a quiet board", async () => {
    mocks.getDb.mockReturnValue({});
    mocks.fetchPageRecordsResult.mockResolvedValue({
      data: [],
      available: false,
    });
    mocks.getScannerIncidentsResult.mockResolvedValue({
      data: [],
      available: false,
    });

    await expect(archiveScannerIncidents()).resolves.toEqual({
      seen: 0,
      inserted: 0,
      complete: false,
      reason: "source_unavailable",
      sources: { page: false, live: false },
    });
  });

  it("accepts an explicitly available empty source as a quiet complete run", async () => {
    mocks.getDb.mockReturnValue({});
    mocks.getScannerIncidentsResult.mockResolvedValue({
      data: [],
      available: false,
    });

    await expect(archiveScannerIncidents()).resolves.toEqual({
      seen: 0,
      inserted: 0,
      complete: true,
      sources: { page: true, live: false },
    });
  });

  it("keeps only the first row for each incident key", () => {
    const rows = [
      { dedupe_key: "fire|Market St|1", value: "page" },
      { dedupe_key: "fire|Market St|1", value: "live" },
      { dedupe_key: "crash|Patrick St|2", value: "live" },
    ];

    expect(dedupeArchiveRows(rows)).toEqual([rows[0], rows[2]]);
  });

  it("splits a large feed into bounded database writes", () => {
    const rows = Array.from({ length: 251 }, (_, index) => index);

    expect(chunkArchiveRows(rows, 100).map((batch) => batch.length)).toEqual([
      100, 100, 51,
    ]);
  });

  it("uses a safe default for an invalid batch size", () => {
    const rows = Array.from({ length: 101 }, (_, index) => index);

    expect(chunkArchiveRows(rows, 0).map((batch) => batch.length)).toEqual([100, 1]);
  });
});
