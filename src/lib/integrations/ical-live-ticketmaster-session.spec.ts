import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  fetchTicketmasterMusicResult: vi.fn(),
}));

vi.mock("@/lib/integrations/ticketmaster", () => ({
  fetchTicketmasterMusicResult:
    mocks.fetchTicketmasterMusicResult,
}));

import {
  fetchLiveTicketmasterMusicResult,
  withLiveEventFetchSession,
} from "./ical-live";

describe("warm-event Ticketmaster session", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.fetchTicketmasterMusicResult.mockResolvedValue({
      items: [],
      state: "ok",
    });
  });

  it("shares Ticketmaster music across distinct event cache fills", async () => {
    const results = await withLiveEventFetchSession(async () => [
      await fetchLiveTicketmasterMusicResult(),
      await fetchLiveTicketmasterMusicResult(),
    ]);

    expect(mocks.fetchTicketmasterMusicResult).toHaveBeenCalledTimes(1);
    expect(results).toEqual([
      { items: [], state: "ok" },
      { items: [], state: "ok" },
    ]);
  });

  it("keeps simultaneous warm sessions isolated", async () => {
    await Promise.all([
      withLiveEventFetchSession(async () => {
        await Promise.all([
          fetchLiveTicketmasterMusicResult(),
          fetchLiveTicketmasterMusicResult(),
        ]);
      }),
      withLiveEventFetchSession(async () => {
        await Promise.all([
          fetchLiveTicketmasterMusicResult(),
          fetchLiveTicketmasterMusicResult(),
        ]);
      }),
    ]);

    expect(mocks.fetchTicketmasterMusicResult).toHaveBeenCalledTimes(2);
  });
});
