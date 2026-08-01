import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  archiveScannerIncidents: vi.fn(),
}));

vi.mock("@/lib/scanner/incidentArchive", () => ({
  archiveScannerIncidents: mocks.archiveScannerIncidents,
}));

import { GET } from "./route";

function request() {
  return new Request(
    "https://frederickradius.app/api/cron/scanner-archive",
    { headers: { authorization: "Bearer test-secret" } },
  );
}

describe("GET /api/cron/scanner-archive", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.CRON_SECRET = "test-secret";
  });

  afterEach(() => {
    delete process.env.CRON_SECRET;
  });

  it("returns a failing status for an incomplete archive", async () => {
    mocks.archiveScannerIncidents.mockResolvedValue({
      seen: 4,
      inserted: 1,
      complete: false,
      reason: "storage_write_failed",
    });

    const response = await GET(request());
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(body).toMatchObject({
      ok: false,
      complete: false,
      reason: "storage_write_failed",
    });
  });

  it("returns success only for a complete archive operation", async () => {
    mocks.archiveScannerIncidents.mockResolvedValue({
      seen: 4,
      inserted: 2,
      complete: true,
    });

    const response = await GET(request());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({ ok: true, complete: true });
  });

  it("returns 503 when neither scanner source could be read", async () => {
    mocks.archiveScannerIncidents.mockResolvedValue({
      seen: 0,
      inserted: 0,
      complete: false,
      reason: "source_unavailable",
      sources: { page: false, live: false },
    });

    const response = await GET(request());
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(body).toMatchObject({
      ok: false,
      complete: false,
      reason: "source_unavailable",
      sources: { page: false, live: false },
    });
  });

  it("turns an unexpected archive failure into an observable 503", async () => {
    mocks.archiveScannerIncidents.mockRejectedValue(new Error("boom"));

    const response = await GET(request());
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(body).toMatchObject({
      ok: false,
      complete: false,
      reason: "archive_operation_failed",
    });
  });
});
