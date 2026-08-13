import { afterEach, describe, expect, it, vi } from "vitest";
import {
  fixItCountLabel,
  getFixItIssues,
  getFixItIssuesResult,
} from "@/lib/integrations/seeclickfix";

function rawIssue(
  id: number,
  status: string,
  overrides: Record<string, unknown> = {},
) {
  return {
    id,
    summary: `Request ${id}`,
    description: "Resident report",
    address: "Frederick County",
    lng: -77.4105,
    lat: 39.4143,
    status,
    request_type: { title: "Road issue" },
    created_at: "2026-08-13T12:00:00.000Z",
    url: `https://seeclickfix.com/api/v2/issues/${id}`,
    html_url: `https://seeclickfix.com/issues/${id}`,
    ...overrides,
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("getFixItIssuesResult", () => {
  it("keeps open and acknowledged requests distinct and excludes closed records", async () => {
    const fetchMock = vi.fn().mockImplementation(async (input: string) => {
      const status = new URL(input).searchParams.get("status");
      return new Response(JSON.stringify({
        issues: [
          rawIssue(1, "Open"),
          rawIssue(2, "Acknowledged"),
          rawIssue(3, "Closed"),
          rawIssue(4, "Open", { lat: 36.17, lng: -115.14 }),
        ],
        metadata: {
          pagination: { entries: status === "open" ? 23 : 376 },
        },
      }), { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await getFixItIssuesResult(20);

    expect(result.available).toBe(true);
    expect(result.data.map((issue) => issue.id)).toEqual([1, 2]);
    expect(result.open.map((issue) => issue.id)).toEqual([1]);
    expect(result.acknowledged.map((issue) => issue.id)).toEqual([2]);
    expect(result.openCount).toBe(23);
    expect(result.acknowledgedCount).toBe(376);
    expect(result.status).toBe("current");
    expect(fixItCountLabel(result)).toBe("23 open · 376 acknowledged");
    expect(await getFixItIssues(20)).toEqual(result.data);
    expect(fetchMock).toHaveBeenCalledTimes(4);
    expect(fetchMock.mock.calls.map((call) => call[0])).toEqual(
      expect.arrayContaining([
        expect.stringContaining("status=open"),
        expect.stringContaining("status=acknowledged"),
      ]),
    );
  });

  it("marks an upstream failure unavailable instead of reporting a quiet zero", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("upstream error", {
      status: 503,
    })));

    await expect(getFixItIssuesResult()).resolves.toEqual({
      data: [],
      open: [],
      acknowledged: [],
      openCount: 0,
      acknowledgedCount: 0,
      openAvailable: false,
      acknowledgedAvailable: false,
      status: "unavailable",
      available: false,
    });
    expect(fixItCountLabel({
      status: "unavailable",
      openCount: 0,
      acknowledgedCount: 0,
      openAvailable: false,
      acknowledgedAvailable: false,
    })).toBe("Reports unavailable");
  });

  it("treats a successful response containing only closed records as available but inactive", async () => {
    vi.stubGlobal("fetch", vi.fn().mockImplementation(async () =>
      new Response(JSON.stringify({ issues: [rawIssue(5, "Closed")] }), {
        status: 200,
      }),
    ));

    const result = await getFixItIssuesResult();
    expect(result.available).toBe(true);
    expect(result.data).toEqual([]);
    expect(result.status).toBe("current");
    expect(fixItCountLabel(result)).toBe("No active reports");
  });

  it("returns partial data when one active-status read fails", async () => {
    vi.stubGlobal("fetch", vi.fn().mockImplementation(async (input: string) => {
      const status = new URL(input).searchParams.get("status");
      if (status === "acknowledged") {
        return new Response("upstream error", { status: 503 });
      }
      return new Response(JSON.stringify({
        issues: [rawIssue(8, "Open")],
        metadata: { pagination: { entries: 4 } },
      }), { status: 200 });
    }));

    const result = await getFixItIssuesResult();
    expect(result).toMatchObject({
      status: "partial",
      available: false,
      openAvailable: true,
      acknowledgedAvailable: false,
      openCount: 4,
      acknowledgedCount: 0,
    });
    expect(result.data.map((issue) => issue.id)).toEqual([8]);
    expect(fixItCountLabel(result)).toBe(
      "4 open · Acknowledged count unavailable",
    );
  });
});
