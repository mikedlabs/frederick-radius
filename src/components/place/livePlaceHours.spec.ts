import { afterEach, describe, expect, it, vi } from "vitest";
import {
  loadLivePlaceHours,
  rememberLivePlaceHours,
} from "@/components/place/livePlaceHours";

afterEach(() => {
  vi.unstubAllGlobals();
});
const live = {
  hours: ["Monday: 9:00 AM to 5:00 PM"],
  structured_hours: { mon: [{ open: "09:00", close: "17:00" }] },
  open_status: { state: "closed" as const },
  hours_checked_at: "2026-08-23T12:00:00.000Z",
};

describe("live place hours request coalescing", () => {
  it("shares one request between the hero and hours disclosure", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => live,
    });
    vi.stubGlobal("fetch", fetchMock);

    const first = loadLivePlaceHours("coalesced-hours-place");
    const second = loadLivePlaceHours("coalesced-hours-place");

    await expect(first).resolves.toEqual(live);
    await expect(second).resolves.toEqual(live);
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/place/coalesced-hours-place/enrich?mode=hours",
      { cache: "no-store" },
    );
  });

  it("does not cache an exhausted or unavailable allowance", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ photos: [], hours: [] }),
    });
    vi.stubGlobal("fetch", fetchMock);

    await loadLivePlaceHours("empty-hours-place");
    await loadLivePlaceHours("empty-hours-place");

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("reuses current hours already returned by an explicit details request", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    rememberLivePlaceHours("primed-hours-place", live);

    await expect(loadLivePlaceHours("primed-hours-place")).resolves.toEqual(live);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
