import { afterEach, describe, expect, it, vi } from "vitest";
import {
  fetchTicketmasterMusic,
  fetchTicketmasterMusicResult,
} from "@/lib/integrations/ticketmaster";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("event adapter health", () => {
  it("treats an intentionally unconfigured adapter as disabled, not failed", async () => {
    vi.stubEnv("TICKETMASTER_API_KEY", "");

    await expect(fetchTicketmasterMusicResult()).resolves.toEqual({
      items: [],
      state: "disabled",
    });
  });

  it("distinguishes an HTTP outage from a valid empty response", async () => {
    vi.stubEnv("TICKETMASTER_API_KEY", "test-key");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("", { status: 503 })),
    );

    await expect(fetchTicketmasterMusicResult()).resolves.toEqual({
      items: [],
      state: "failed",
    });
    // Existing data-only callers remain fail-soft.
    await expect(fetchTicketmasterMusic()).resolves.toEqual([]);
  });

  it("keeps a successful zero-event response healthy", async () => {
    vi.stubEnv("TICKETMASTER_API_KEY", "test-key");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(JSON.stringify({ _embedded: { events: [] } }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
      ),
    );

    await expect(fetchTicketmasterMusicResult()).resolves.toEqual({
      items: [],
      state: "ok",
    });
  });
});
