import { afterEach, describe, expect, it, vi } from "vitest";
import { getNwsAlertsResult } from "@/lib/integrations/nws-alerts";

describe("NWS alert response freshness", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("carries the upstream response time instead of inventing a request time", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(new Response(
      JSON.stringify({ features: [] }),
      {
        status: 200,
        headers: {
          "Content-Type": "application/geo+json",
          Date: "Thu, 13 Aug 2026 21:58:00 GMT",
        },
      },
    ));
    vi.stubGlobal("fetch", fetchMock);

    await expect(getNwsAlertsResult()).resolves.toEqual({
      alerts: [],
      available: true,
      checkedAt: "2026-08-13T21:58:00.000Z",
    });
  });

  it("passes a caller abort through to the provider request", async () => {
    const parent = new AbortController();
    parent.abort();
    const fetchMock = vi.fn<typeof fetch>(async (_input, init) => {
      if (init?.signal?.aborted) {
        throw new DOMException("Aborted", "AbortError");
      }
      return new Response(JSON.stringify({ features: [] }), { status: 200 });
    });
    vi.stubGlobal(
      "fetch",
      fetchMock,
    );

    await expect(getNwsAlertsResult(parent.signal)).resolves.toEqual({
      alerts: [],
      available: false,
    });
    const requestSignal = fetchMock.mock.calls[0]?.[1]?.signal;
    expect(requestSignal).toBeInstanceOf(AbortSignal);
    expect(requestSignal?.aborted).toBe(true);
  });
});
