import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getScope } from "@/lib/scope";
import { getWantAnswer, WANT_ANSWER_DEADLINE_MS } from "./want-cache";

vi.mock("@/hooks/useGeolocation", () => ({ readCachedPosition: () => null }));

const fetcher = vi.fn<typeof fetch>(async () => new Response("{}", { status: 200 }));
function browser(stored: string | null, cookie: string) {
  vi.stubGlobal("window", { localStorage: { getItem: () => stored } });
  vi.stubGlobal("document", { cookie });
}

beforeEach(() => {
  fetcher.mockReset().mockImplementation(async () => new Response("{}", { status: 200 }));
  vi.stubGlobal("fetch", fetcher);
});
afterEach(() => vi.unstubAllGlobals());

describe("shared scope and want request continuity", () => {
  it("recovers only the validated scope cookie when local storage has no lens", async () => {
    browser(null, "other=county; fr_scope=town%3Afrederick; unrelated=value");
    expect(getScope()).toBe("town:frederick");
    await getWantAnswer("cat:cookie-recovery", null);
    expect(fetcher).toHaveBeenCalledWith("/api/want?c=cat%3Acookie-recovery&scope=frederick", { priority: "high", signal: expect.any(AbortSignal) });
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

describe("want-answer recovery", () => {
  beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(0); browser("county", ""); });
  afterEach(() => vi.useRealTimers());

  it("ends a stalled header read and permits one explicit retry", async () => {
    fetcher.mockImplementationOnce(() => new Promise(() => {}));
    const pending = getWantAnswer("cat:hung-headers", null);
    const result = expect(pending).rejects.toMatchObject({ name: "AbortError" });
    await vi.advanceTimersByTimeAsync(WANT_ANSWER_DEADLINE_MS);
    await result;
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(fetcher.mock.calls[0][1]?.signal?.aborted).toBe(true);
    await expect(getWantAnswer("cat:hung-headers", null)).resolves.toEqual({});
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("ends a stalled response body without caching a late answer", async () => {
    let finishBody!: (value: unknown) => void;
    const body = new Promise((resolve) => { finishBody = resolve; });
    fetcher.mockResolvedValueOnce({ ok: true, json: () => body } as unknown as Response);
    const result = expect(getWantAnswer("cat:hung-body", null)).rejects.toMatchObject({ name: "AbortError" });
    await vi.advanceTimersByTimeAsync(WANT_ANSWER_DEADLINE_MS);
    await result;
    const fresh = getWantAnswer("cat:hung-body", null);
    await expect(fresh).resolves.toEqual({});
    finishBody({ stale: true });
    await vi.advanceTimersByTimeAsync(0);
    expect(getWantAnswer("cat:hung-body", null)).toBe(fresh);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("shares one in-flight request and reuses a successful answer", async () => {
    let finish!: (value: Response) => void;
    fetcher.mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }));
    const first = getWantAnswer("cat:single-flight", null);
    expect(getWantAnswer("cat:single-flight", null)).toBe(first);
    finish(new Response('{"hero":null}', { status: 200 }));
    await expect(first).resolves.toEqual({ hero: null });
    expect(getWantAnswer("cat:single-flight", null)).toBe(first);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("evicts a rejected response so the next deliberate request can recover", async () => {
    fetcher.mockResolvedValueOnce(new Response("down", { status: 503 }));
    await expect(getWantAnswer("cat:rejected-flight", null)).rejects.toThrow("503");
    await expect(getWantAnswer("cat:rejected-flight", null)).resolves.toEqual({});
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("does not let an old failure evict a replacement after a clock/TTL jump", async () => {
    let failOld!: (error: Error) => void;
    fetcher.mockImplementationOnce(() => new Promise((_, reject) => { failOld = reject; }));
    const old = getWantAnswer("cat:replaced-flight", null);
    const rejection = expect(old).rejects.toThrow("old failure");
    vi.setSystemTime(46_000);
    const replacement = getWantAnswer("cat:replaced-flight", null);
    await expect(replacement).resolves.toEqual({});
    failOld(new Error("old failure"));
    await rejection;
    expect(getWantAnswer("cat:replaced-flight", null)).toBe(replacement);
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(vi.getTimerCount()).toBe(0);
  });
});
