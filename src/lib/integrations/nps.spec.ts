import { afterEach, describe, expect, it, vi } from "vitest";
import { getNpsAlerts } from "./nps";

const originalNpsKey = process.env.NPS_API_KEY;

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  if (originalNpsKey === undefined) delete process.env.NPS_API_KEY;
  else process.env.NPS_API_KEY = originalNpsKey;
});

describe("NPS request deadline", () => {
  it("aborts a stalled visitor-facing park-alert request after 1.5 seconds and fails soft", async () => {
    vi.useFakeTimers();
    process.env.NPS_API_KEY = "test-key";
    let signal: AbortSignal | undefined;
    vi.stubGlobal("fetch", vi.fn((_url: string | URL | Request, init?: RequestInit) => {
      signal = init?.signal ?? undefined;
      return new Promise<Response>((_resolve, reject) => {
        signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")));
      });
    }));

    const pending = getNpsAlerts();
    let settled = false;
    void pending.then(() => { settled = true; });

    await vi.advanceTimersByTimeAsync(1_499);
    expect(signal?.aborted).toBe(false);
    expect(settled).toBe(false);

    await vi.advanceTimersByTimeAsync(1);

    await expect(pending).resolves.toEqual([]);
    expect(signal?.aborted).toBe(true);
  });

  it("keeps a valid park alert that arrives inside the visitor deadline", async () => {
    process.env.NPS_API_KEY = "test-key";
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({
      data: [{
        id: "alert-1",
        parkCode: "cato",
        title: "Trail closure",
        description: "The west trail is temporarily closed.",
        category: "Park Closure",
        url: "https://www.nps.gov/cato/planyourvisit/conditions.htm",
      }],
    }), {
      status: 200,
      headers: { "content-type": "application/json" },
    })));

    await expect(getNpsAlerts()).resolves.toEqual([{
      id: "alert-1",
      parkCode: "cato",
      parkName: "Catoctin Mountain Park",
      title: "Trail closure",
      description: "The west trail is temporarily closed.",
      category: "Park Closure",
      url: "https://www.nps.gov/cato/planyourvisit/conditions.htm",
    }]);
  });
});
