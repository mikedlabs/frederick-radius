import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import type { createServerClient } from "@supabase/ssr";

const { createServerClientMock, getClaimsMock } = vi.hoisted(() => ({
  createServerClientMock: vi.fn(),
  getClaimsMock: vi.fn(),
}));

vi.mock("@supabase/ssr", () => ({ createServerClient: createServerClientMock }));

import { SESSION_VERIFICATION_TIMEOUT_MS, updateSession } from "./proxy";
import { proxy } from "@/proxy";

type ClientOptions = Parameters<typeof createServerClient>[2];
let clientOptions: ClientOptions;

function request(path = "/today", signedIn = true) {
  return new NextRequest(`https://frederickradius.app${path}`, {
    headers: signedIn ? { cookie: "sb-radius-auth-token=existing-session" } : {},
  });
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://radius.supabase.co");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "test-publishable-key");
  createServerClientMock.mockImplementation((_url, _key, options) => {
    clientOptions = options;
    return { auth: { getClaims: getClaimsMock } };
  });
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.resetAllMocks();
  vi.restoreAllMocks();
});

describe("bounded Supabase session verification", () => {
  it("keeps anonymous requests independent of Auth", async () => {
    const result = await updateSession(request("/today", false));
    expect(result.authState).toBe("anonymous");
    expect(createServerClientMock).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("preserves refreshed request cookies, response cookies, and private headers", async () => {
    const req = request();
    getClaimsMock.mockImplementation(async () => {
      await clientOptions.cookies.setAll?.([
        { name: "sb-radius-auth-token", value: "refreshed-session", options: { httpOnly: true } },
      ], { "Cache-Control": "private, no-cache, no-store", Pragma: "no-cache" });
      return { data: { claims: { sub: "verified-member" } }, error: null };
    });

    const result = await updateSession(req);

    expect(result.authState).toBe("authenticated");
    expect(req.cookies.get("sb-radius-auth-token")?.value).toBe("refreshed-session");
    expect(result.response.cookies.get("sb-radius-auth-token")?.value).toBe("refreshed-session");
    expect(result.response.headers.get("cache-control")).toContain("no-store");
    expect(result.response.headers.get("pragma")).toBe("no-cache");
    expect(vi.getTimerCount()).toBe(0);
  });

  it("does not authenticate rejected claims", async () => {
    getClaimsMock.mockResolvedValue({ data: null, error: new Error("invalid claims") });
    expect((await updateSession(request())).authState).toBe("anonymous");
  });

  it("handles client initialization failure without leaking the protected session", async () => {
    createServerClientMock.mockImplementation(() => { throw new Error("unavailable"); });
    const result = await updateSession(request());
    expect(result.authState).toBe("unavailable");
    expect(result.response.headers.get("cache-control")).toContain("no-store");
    expect(vi.getTimerCount()).toBe(0);
  });

  it("aborts upstream work and ignores cookies from a late SDK completion", async () => {
    const req = request();
    let rejectClaims!: (reason: Error) => void;
    let upstreamSignal: AbortSignal | null | undefined;
    const fetchMock = vi.fn((_input, init: RequestInit) => {
      upstreamSignal = init.signal;
      return new Promise<Response>(() => {});
    });
    vi.stubGlobal("fetch", fetchMock);
    getClaimsMock.mockImplementation(() => {
      void clientOptions.global?.fetch?.("https://radius.supabase.co/auth/v1/token", {});
      return new Promise((_resolve, reject) => { rejectClaims = reject; });
    });

    const pending = updateSession(req);
    await vi.advanceTimersByTimeAsync(SESSION_VERIFICATION_TIMEOUT_MS);
    const result = await pending;

    expect(result.authState).toBe("unavailable");
    expect(upstreamSignal?.aborted).toBe(true);
    expect(console.warn).toHaveBeenCalledWith("[auth] Session verification deadline exceeded.");
    await clientOptions.cookies.setAll?.([
      { name: "sb-radius-auth-token", value: "late-session", options: {} },
    ], { "Cache-Control": "public" });
    rejectClaims(new Error("late provider failure"));
    await Promise.resolve();
    expect(req.cookies.get("sb-radius-auth-token")?.value).toBe("existing-session");
    expect(result.response.cookies.getAll()).toEqual([]);
    expect(result.response.headers.get("cache-control")).toBe("private, no-store");
    expect(vi.getTimerCount()).toBe(0);
  });

  it.each([
    { path: "/today", status: 200 },
    { path: "/settings/sync?tab=privacy", status: 307 },
  ])("bounds $path without bypassing route protection", async ({ path, status }) => {
    getClaimsMock.mockReturnValue(new Promise(() => {}));
    const pending = proxy(request(path));
    await vi.advanceTimersByTimeAsync(SESSION_VERIFICATION_TIMEOUT_MS);
    const response = await pending;

    expect(response.status).toBe(status);
    expect(response.headers.get("cache-control")).toContain("no-store");
    if (status === 307) {
      const location = new URL(response.headers.get("location")!);
      expect(location.pathname).toBe("/auth/login");
      expect(location.searchParams.get("reason")).toBe("verification_unavailable");
      expect(location.searchParams.get("next")).toBe(path);
    } else {
      expect(response.headers.get("location")).toBeNull();
    }
  });
});
