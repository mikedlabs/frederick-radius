import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getScope } from "@/lib/scope";
import { getWantAnswer } from "./want-cache";

vi.mock("@/hooks/useGeolocation", () => ({ readCachedPosition: () => null }));

const fetcher = vi.fn<typeof fetch>(async () => new Response("{}", { status: 200 }));
function browser(stored: string | null, cookie: string) {
  vi.stubGlobal("window", { localStorage: { getItem: () => stored } });
  vi.stubGlobal("document", { cookie });
}

beforeEach(() => {
  fetcher.mockClear();
  vi.stubGlobal("fetch", fetcher);
});
afterEach(() => vi.unstubAllGlobals());

describe("shared scope and want request continuity", () => {
  it("recovers only the validated scope cookie when local storage has no lens", async () => {
    browser(null, "other=county; fr_scope=town%3Afrederick; unrelated=value");
    expect(getScope()).toBe("town:frederick");
    await getWantAnswer("cat:cookie-recovery", null);
    expect(fetcher).toHaveBeenCalledWith("/api/want?c=cat%3Acookie-recovery&scope=frederick", { priority: "high" });
  });

  it("keeps a deliberate county or town storage choice above a stale cookie", () => {
    browser("county", "fr_scope=town%3Afrederick");
    expect(getScope()).toBe("county");
    browser("town:brunswick", "fr_scope=county");
    expect(getScope()).toBe("town:brunswick");
  });

  it("does not invent a saved lens from missing, invalid, or malformed mirrors", () => {
    for (const cookie of ["", "not_fr_scope=county", "fr_scope=not-a-town", "fr_scope=%invalid"]) {
      browser(null, cookie);
      expect(getScope()).toBeNull();
    }
  });

  it("stays safe without browser globals or with blocked storage", () => {
    vi.stubGlobal("window", undefined);
    vi.stubGlobal("document", undefined);
    expect(getScope()).toBeNull();
    vi.stubGlobal("window", { get localStorage() { throw new Error("blocked"); } });
    expect(getScope()).toBeNull();
    vi.stubGlobal("document", { cookie: "fr_scope=town%3Abrunswick" });
    expect(getScope()).toBe("town:brunswick");
  });

  it("sends and caches an explicit Today default separately from a saved city", async () => {
    browser(null, "fr_scope=town%3Afrederick");
    await getWantAnswer("cat:scope-cache", null, "county");
    await getWantAnswer("cat:scope-cache", null);
    await getWantAnswer("cat:scope-cache", null, "county");
    expect(fetcher.mock.calls).toHaveLength(2);
    expect(fetcher.mock.calls.map(([url]) => url)).toEqual([
      "/api/want?c=cat%3Ascope-cache&scope=county",
      "/api/want?c=cat%3Ascope-cache&scope=frederick",
    ]);
  });
});
