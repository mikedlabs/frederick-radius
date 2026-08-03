// @vitest-environment jsdom

import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  localSaved: [] as Array<{ type: "place"; id: string; saved_at: string }>,
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
  hasCompletedFollowsSync: () => true,
  markFollowsSyncComplete: vi.fn(),
}));

import {
  resetFollowsSyncFlag,
  useFollowedSlugs,
  type FollowedSlugsBootstrap,
} from "./useFollows";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

function Snapshot({ bootstrap }: { bootstrap: FollowedSlugsBootstrap }) {
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

  beforeEach(() => {
    resetFollowsSyncFlag();
    mocks.localSaved = [];
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
    vi.useFakeTimers();
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
    expect(fetchMock).toHaveBeenCalledWith("/api/auth/me", { cache: "no-store" });
    expect(container.querySelector("output")?.dataset.authed).toBe("false");
    expect(container.querySelector("output")?.dataset.loading).toBe("false");
  });
});
