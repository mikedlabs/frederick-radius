// @vitest-environment jsdom

import { act, createElement, StrictMode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  localSaved: [] as Array<{ type: "place"; id: string; saved_at: string }>,
  hasCompletedSync: true,
}));

vi.mock("@/hooks/useSaved", () => ({
  useSavedList: () => mocks.localSaved,
  useToggleSave: () => vi.fn(),
  useIsSaved: () => false,
}));
vi.mock("@/lib/track", () => ({ track: vi.fn() }));
vi.mock("@/lib/push-topics", () => ({
  businessTopic: (slug: string) => `biz:${slug}`,
}));
vi.mock("@/lib/return-bridge", () => ({
  cancelPendingReturnBridgeValue: vi.fn(),
  signalReturnBridgeValue: vi.fn(),
}));
vi.mock("@/lib/follows-sync", () => ({
  clearFollowsSync: vi.fn(),
  hasCompletedFollowsSync: () => mocks.hasCompletedSync,
  markFollowsSyncComplete: vi.fn(),
}));

import {
  resetFollowsSyncFlag,
  useFollowedSlugs,
  type FollowedSlugsBootstrap,
} from "./useFollows";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

function Snapshot({ bootstrap }: { bootstrap?: FollowedSlugsBootstrap }) {
  const state = useFollowedSlugs(bootstrap);
  return createElement(
    "output",
    {
      "data-authed": String(state.authed),
      "data-loading": String(state.loading),
      "data-truncated": String(state.truncated),
    },
    [...state.slugs].join(","),
  );
}

function response(status: number, body?: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as Response;
}

describe("useFollowedSlugs browser account store", () => {
  let root: Root;
  let container: HTMLDivElement;
  let frames: Map<number, FrameRequestCallback>;
  let nextFrame = 0;
  const flushFrames = async () => {
    const callbacks = [...frames.values()]; frames.clear();
    await act(async () => { for (const callback of callbacks) callback(performance.now()); });
  };

  beforeEach(() => {
    resetFollowsSyncFlag();
    Object.defineProperty(document, "visibilityState", { configurable: true, value: "visible" });
    window.dispatchEvent(new Event("pageshow"));
    frames = new Map(); nextFrame = 0;
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => { const id = ++nextFrame; frames.set(id, callback); return id; });
    vi.stubGlobal("cancelAnimationFrame", (id: number) => { frames.delete(id); });
    mocks.localSaved = [];
    mocks.hasCompletedSync = true;
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    vi.useRealTimers();
    vi.unstubAllGlobals();
    resetFollowsSyncFlag();
  });

  it("makes every defined same-account server snapshot authoritative", async () => {
    const user = { id: "account-a", email: "a@example.com" };

    await act(async () => {
      root.render(
        createElement(Snapshot, {
          bootstrap: { user, slugs: ["old-save"], truncated: true },
        }),
      );
      await Promise.resolve();
    });
    expect(container.textContent).toBe("old-save");
    expect(container.querySelector("output")?.dataset.truncated).toBe("true");

    await act(async () => {
      root.render(
        createElement(Snapshot, {
          bootstrap: { user, slugs: [], truncated: false },
        }),
      );
      await Promise.resolve();
    });

    expect(container.textContent).toBe("");
    expect(container.querySelector("output")?.dataset.loading).toBe("false");
    expect(container.querySelector("output")?.dataset.truncated).toBe("false");
  });

  it("never exposes one account's store while switching to another", async () => {
    await act(async () => {
      root.render(
        createElement(Snapshot, {
          bootstrap: {
            user: { id: "account-a", email: null },
            slugs: ["only-account-a"],
          },
        }),
      );
      await Promise.resolve();
    });

    await act(async () => {
      root.render(
        createElement(Snapshot, {
          bootstrap: {
            user: { id: "account-b", email: null },
            slugs: ["only-account-b"],
          },
        }),
      );
      await Promise.resolve();
    });

    expect(container.textContent).toBe("only-account-b");
    expect(container.textContent).not.toContain("only-account-a");
  });

  it("keeps transient failures as unknown and retries without a reload", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date"] });
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(response(503, { error: "unavailable" }))
      .mockResolvedValueOnce(
        response(200, { slugs: ["recovered-save"], truncated: false }),
      );
    vi.stubGlobal("fetch", fetchMock);

    await act(async () => {
      root.render(
        createElement(Snapshot, {
          bootstrap: {
            user: { id: "account-a", email: null },
            slugs: undefined,
          },
        }),
      );
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(container.querySelector("output")?.dataset.loading).toBe("true");
    expect(container.textContent).toBe("");

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1_000);
      await Promise.resolve();
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(container.textContent).toBe("recovered-save");
    expect(container.querySelector("output")?.dataset.loading).toBe("false");
  });

  it("invalidates stale bootstrap auth after a 401 and re-detects identity", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockImplementation(async (input) => {
        const url = String(input);
        if (url === "/api/follows") return response(401, { error: "unauthenticated" });
        if (url === "/api/auth/me") return response(200, { user: null });
        throw new Error(`unexpected request: ${url}`);
      });
    vi.stubGlobal("fetch", fetchMock);

    await act(async () => {
      root.render(
        createElement(Snapshot, {
          bootstrap: {
            user: { id: "expired-account", email: null },
            slugs: undefined,
          },
        }),
      );
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(fetchMock).toHaveBeenCalledWith("/api/follows", { cache: "no-store" });
    await flushFrames();
    expect(fetchMock).toHaveBeenCalledWith("/api/auth/me", expect.objectContaining({ cache: "no-store", signal: expect.any(AbortSignal) }));
    expect(container.querySelector("output")?.dataset.authed).toBe("false");
    expect(container.querySelector("output")?.dataset.loading).toBe("false");
  });

  it.each([null, { id: "resumed-account", email: null }])("does not cache hidden startup as anonymous before verified resume %j", async (user) => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date"] });
    Object.defineProperty(document, "visibilityState", { configurable: true, value: "hidden" });
    const fetchMock = vi.fn<typeof fetch>(async (input) => String(input) === "/api/auth/me"
      ? response(200, { user }) : response(200, { slugs: [] }));
    vi.stubGlobal("fetch", fetchMock);
    await act(async () => root.render(createElement(Snapshot)));
    await act(async () => vi.advanceTimersByTimeAsync(60_000));
    expect(fetchMock).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
    expect(container.querySelector("output")?.dataset.loading).toBe("true");
    Object.defineProperty(document, "visibilityState", { configurable: true, value: "visible" });
    await act(async () => { document.dispatchEvent(new Event("visibilitychange")); window.dispatchEvent(new Event("pageshow")); });
    await flushFrames();
    expect(fetchMock.mock.calls.filter(([url]) => url === "/api/auth/me")).toHaveLength(1);
    expect(container.querySelector("output")?.dataset.authed).toBe(String(Boolean(user)));
    expect(container.querySelector("output")?.dataset.loading).toBe("false");
  });

  it("skips a passive mount after pagehide even while visibility still says visible", async () => {
    const fetchMock = vi.fn(); vi.stubGlobal("fetch", fetchMock);
    window.dispatchEvent(new Event("pagehide"));
    await act(async () => root.render(createElement(Snapshot)));
    await flushFrames();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(container.querySelector("output")?.dataset.loading).toBe("true");
  });

  it("cancels admission before its frame and retries a fresh lookup after pageshow", async () => {
    const fetchMock = vi.fn<typeof fetch>(async (input) => String(input) === "/api/auth/me"
      ? response(200, { user: { id: "restored", email: null } }) : response(200, { slugs: [] }));
    vi.stubGlobal("fetch", fetchMock);
    await act(async () => root.render(createElement(Snapshot)));
    await act(async () => window.dispatchEvent(new Event("pagehide")));
    await flushFrames();
    expect(fetchMock).not.toHaveBeenCalled();
    await act(async () => window.dispatchEvent(new PageTransitionEvent("pageshow", { persisted: true })));
    await flushFrames();
    expect(fetchMock.mock.calls.filter(([url]) => url === "/api/auth/me")).toHaveLength(1);
    expect(container.querySelector("output")?.dataset.authed).toBe("true");
  });

  it("keeps one shared admitted lookup when one consumer unmounts", async () => {
    let finish!: (response: Response) => void;
    const pending = new Promise<Response>((resolve) => { finish = resolve; });
    const fetchMock = vi.fn().mockReturnValue(pending); vi.stubGlobal("fetch", fetchMock);
    await act(async () => root.render([createElement(Snapshot, { key: "a" }), createElement(Snapshot, { key: "b" })]));
    await flushFrames();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const signal = fetchMock.mock.calls[0][1].signal as AbortSignal;
    await act(async () => root.render([createElement(Snapshot, { key: "b" })]));
    expect(signal.aborted).toBe(false);
    await act(async () => finish(response(200, { user: null })));
    expect(container.querySelector("output")?.dataset.loading).toBe("false");
  });

  it("aborts an already-started lookup on pagehide without caching a false anonymous identity", async () => {
    let finishOld!: (response: Response) => void;
    const old = new Promise<Response>((resolve) => { finishOld = resolve; });
    const fetchMock = vi.fn<typeof fetch>().mockReturnValueOnce(old).mockImplementation(async (input) => String(input) === "/api/auth/me"
      ? response(200, { user: { id: "restored", email: null } }) : response(200, { slugs: ["new-save"] }));
    vi.stubGlobal("fetch", fetchMock);
    await act(async () => root.render(createElement(Snapshot)));
    await flushFrames();
    const signal = fetchMock.mock.calls[0][1]?.signal as AbortSignal;
    await act(async () => window.dispatchEvent(new Event("pagehide")));
    expect(signal.aborted).toBe(true);
    await act(async () => { window.dispatchEvent(new PageTransitionEvent("pageshow", { persisted: true })); document.dispatchEvent(new Event("visibilitychange")); });
    await flushFrames();
    expect(fetchMock.mock.calls.filter(([url]) => url === "/api/auth/me")).toHaveLength(2);
    expect(container.textContent).toBe("new-save");
    await act(async () => finishOld(response(200, { user: null })));
    expect(container.querySelector("output")?.dataset.authed).toBe("true");
    expect(container.textContent).toBe("new-save");
  });

  it("lets a newer server bootstrap cancel queued identity discovery before its frame", async () => {
    const fetchMock = vi.fn(); vi.stubGlobal("fetch", fetchMock);
    await act(async () => root.render(createElement(Snapshot)));
    await act(async () => root.render(createElement(Snapshot, { bootstrap: { user: { id: "server-account", email: null }, slugs: ["verified-save"] } })));
    await flushFrames();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(container.textContent).toBe("verified-save");
    expect(container.querySelector("output")?.dataset.authed).toBe("true");
  });

  it("does not revive expired bootstrap auth on resume, including Strict Mode effect replay", async () => {
    const bootstrap = { user: { id: "expired-account", email: null }, slugs: undefined };
    const fetchMock = vi.fn<typeof fetch>(async (input) => String(input) === "/api/follows"
      ? response(401) : response(200, { user: null }));
    vi.stubGlobal("fetch", fetchMock);
    await act(async () => root.render(createElement(StrictMode, null, createElement(Snapshot, { bootstrap }))));
    await flushFrames();
    expect(container.querySelector("output")?.dataset.authed).toBe("false");
    expect(container.querySelector("output")?.dataset.loading).toBe("false");
    const reads = fetchMock.mock.calls.length;
    await act(async () => {
      window.dispatchEvent(new Event("pagehide"));
      Object.defineProperty(document, "visibilityState", { configurable: true, value: "hidden" });
      document.dispatchEvent(new Event("visibilitychange"));
    });
    await act(async () => {
      Object.defineProperty(document, "visibilityState", { configurable: true, value: "visible" });
      window.dispatchEvent(new PageTransitionEvent("pageshow", { persisted: true }));
      document.dispatchEvent(new Event("visibilitychange"));
    });
    await flushFrames();
    expect(container.querySelector("output")?.dataset.authed).toBe("false");
    expect(container.querySelector("output")?.dataset.loading).toBe("false");
    expect(fetchMock).toHaveBeenCalledTimes(reads);
  });

  it("preserves newer shared memberships instead of replaying an older consumer's bootstrap on resume", async () => {
    const user = { id: "account-a", email: null };
    const oldBootstrap = { user, slugs: ["old-save"] };
    const newBootstrap = { user, slugs: ["new-save"] };
    const fetchMock = vi.fn(); vi.stubGlobal("fetch", fetchMock);
    await act(async () => root.render(createElement(Snapshot, { key: "old", bootstrap: oldBootstrap })));
    await act(async () => root.render([
      createElement(Snapshot, { key: "old", bootstrap: oldBootstrap }),
      createElement(Snapshot, { key: "new", bootstrap: newBootstrap }),
    ]));
    expect([...container.querySelectorAll("output")].map((node) => node.textContent)).toEqual(["new-save", "new-save"]);
    await act(async () => window.dispatchEvent(new Event("pagehide")));
    await act(async () => {
      window.dispatchEvent(new PageTransitionEvent("pageshow", { persisted: true }));
      document.dispatchEvent(new Event("visibilitychange"));
    });
    await flushFrames();
    expect([...container.querySelectorAll("output")].map((node) => node.textContent)).toEqual(["new-save", "new-save"]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("keeps defined server memberships read-only with unsynced local saves, including resume", async () => {
    mocks.localSaved = [{ type: "place", id: "local-only", saved_at: "2026-01-01" }];
    mocks.hasCompletedSync = false;
    const bootstrap = { user: { id: "account-a", email: null }, slugs: [] };
    const fetchMock = vi.fn(); vi.stubGlobal("fetch", fetchMock);
    await act(async () => root.render(createElement(Snapshot, { bootstrap })));
    expect(container.textContent).toBe("");
    expect(container.querySelector("output")?.dataset.loading).toBe("false");
    await act(async () => window.dispatchEvent(new Event("pagehide")));
    await act(async () => {
      window.dispatchEvent(new PageTransitionEvent("pageshow", { persisted: true }));
      document.dispatchEvent(new Event("visibilitychange"));
    });
    await flushFrames();
    expect(container.textContent).toBe("");
    expect(fetchMock).not.toHaveBeenCalled();
  });

});
