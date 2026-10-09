// @vitest-environment jsdom

import { installSavedLocks } from "../../tests/helpers/saved-locks";
import { act, useEffect } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  FOLLOW_WRITE_TIMEOUT_MS,
  resetFollowsSyncFlag,
  useFollowedSlugs,
  useFollowMutationState,
  useToggleFollow,
  type FollowedSlugsBootstrap,
} from "./useFollows";

const mocks = vi.hoisted(() => ({ failure: vi.fn(), synced: vi.fn(() => true), track: vi.fn(), signalBridge: vi.fn(), cancelBridge: vi.fn() }));
vi.mock("@/lib/track", () => ({ track: mocks.track }));
vi.mock("@/lib/persistence", () => ({ ensurePersistentStorage: vi.fn() }));
vi.mock("@/lib/follows-sync", () => ({ clearFollowsSync: vi.fn(), hasCompletedFollowsSync: mocks.synced, markFollowsSyncComplete: vi.fn() }));
vi.mock("@/lib/return-bridge", () => ({ signalReturnBridgeValue: mocks.signalBridge, cancelPendingReturnBridgeValue: mocks.cancelBridge }));
(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise<T>((done, fail) => { resolve = done; reject = fail; });
  return { promise, resolve, reject };
}
function response(body: unknown = {}, status = 200): Response {
  return { ok: status >= 200 && status < 300, status, json: async () => body } as Response;
}
let mutate: Array<ReturnType<typeof useToggleFollow>>;
function Probe({ index, slug }: { index: number; slug: string }) {
  useFollowedSlugs();
  const change = useToggleFollow(slug, "test", mocks.failure);
  useEffect(() => { mutate[index] = change; }, [index, change]);
  return <span data-mutation={useFollowMutationState(slug)} />;
}
function Snapshot({ bootstrap }: { bootstrap?: FollowedSlugsBootstrap }) {
  const { slugs } = useFollowedSlugs(bootstrap);
  return <output>{[...slugs].sort().join(",")}</output>;
}

let accountSequence = 0;
describe("confirmed follow membership and shared mutation state", () => {
  let locks: ReturnType<typeof installSavedLocks>;
  let root: Root;
  let container: HTMLDivElement;
  let bootstrap: FollowedSlugsBootstrap | undefined;
  let requests: Array<{ method: string; slug: string; request: ReturnType<typeof deferred<Response>> }>;
  let imported: ReturnType<typeof deferred<Response>> | undefined;
  let identity: ReturnType<typeof deferred<Response>> | undefined;
  let observation: ReturnType<typeof deferred<Response>> | undefined;
  let serverSlugs: Set<string>;
  let reads: number;
  let authReads: number;

  beforeEach(() => {
    locks = installSavedLocks();
    vi.clearAllMocks();
    mocks.synced.mockReturnValue(true);
    resetFollowsSyncFlag();
    localStorage.clear();
    requests = [];
    mutate = [];
    imported = undefined;
    identity = undefined;
    observation = undefined;
    serverSlugs = new Set();
    reads = 0;
    authReads = 0;
    bootstrap = { user: { id: `mutation-account-${++accountSequence}`, email: null }, slugs: [] };
    vi.stubGlobal("fetch", vi.fn<typeof fetch>((input, init) => {
      if (String(input) === "/api/auth/me") {
        authReads++;
        return identity?.promise ?? Promise.resolve(response({ user: null }));
      }
      if (String(input) === "/api/follows/sync" && imported) return imported.promise;
      if (String(input) === "/api/follows" && !init?.method) {
        reads++;
        return observation?.promise ?? Promise.resolve(response({ slugs: [...serverSlugs] }));
      }
      if (String(input) === "/api/follows" && ["POST", "DELETE"].includes(init?.method ?? "")) {
        const request = deferred<Response>();
        requests.push({ method: init!.method!, slug: JSON.parse(String(init!.body)).slug, request });
        return request.promise;
      }
      throw new Error(`Unexpected request ${String(input)}`);
    }));
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
  });
  afterEach(async () => {
    locks.restore();
    await act(async () => root.unmount());
    container.remove();
    resetFollowsSyncFlag();
    localStorage.clear();
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });
  async function render(slugs: string[] = [], ids = ["test-stop", "test-stop", "other-stop"]) {
    if (bootstrap) bootstrap = { ...bootstrap, slugs };
    serverSlugs = new Set(slugs);
    await act(async () => root.render(<Snapshot bootstrap={bootstrap} />));
    await act(async () => root.render(<><Snapshot bootstrap={bootstrap} />{ids.map((slug, index) => <Probe key={index} index={index} slug={slug} />)}</>));
  }
  function saved() { return container.querySelector("output")!.textContent; }
  function states() { return [...container.querySelectorAll("[data-mutation]")].map((item) => item.getAttribute("data-mutation")); }
  async function begin(index: number, desired: boolean) {
    let result!: Promise<boolean>;
    await act(async () => { result = mutate[index](desired); });
    return { result };
  }
  async function settle(index: number, status = 200) {
    await act(async () => {
      if (status >= 200 && status < 300) {
        if (requests[index].method === "POST") serverSlugs.add(requests[index].slug);
        else serverSlugs.delete(requests[index].slug);
      }
      requests[index].request.resolve(response({}, status));
    });
  }

  it.each([false, true])("keeps confirmed membership %s and shares the requested direction until persistence", async (initial) => {
    await render(initial ? ["test-stop"] : []);
    const { result } = await begin(0, !initial);
    expect(saved()).toBe(initial ? "test-stop" : "");
    expect(states()).toEqual([initial ? "removing" : "saving", initial ? "removing" : "saving", "idle"]);
    expect(requests).toHaveLength(1);
    expect(requests[0].method).toBe(initial ? "DELETE" : "POST");
    await settle(0);
    expect(await result).toBe(!initial);
    expect(saved()).toBe(initial ? "" : "test-stop");
    expect(states()).toEqual(["idle", "idle", "idle"]);
  });

  it("reserves a same-place intent before auth discovery and refuses an opposite duplicate", async () => {
    const user = bootstrap!.user;
    bootstrap = undefined;
    identity = deferred<Response>();
    await render();
    const { result } = await begin(0, true);
    expect(states()).toEqual(["saving", "saving", "idle"]);
    await act(async () => { expect(await mutate[1](false)).toBe(false); });
    expect(mocks.failure).toHaveBeenCalledWith(expect.stringContaining("still pending"));
    expect(authReads).toBe(1);
    expect(requests).toHaveLength(0);
    await act(async () => identity!.resolve(response({ user })));
    expect(requests).toHaveLength(1);
    expect(requests[0].method).toBe("POST");
    expect(saved()).toBe("");
    await settle(0);
    expect(await result).toBe(true);
    expect(saved()).toBe("test-stop");
  });

  it("does not let an obsolete auth finalizer clear a newer account's reservation", async () => {
    bootstrap = undefined;
    identity = deferred<Response>();
    await render();
    const oldIntent = await begin(0, true);
    bootstrap = { user: { id: `replacement-${accountSequence}`, email: null }, slugs: ["only-new-account"] };
    await render(["only-new-account"]);
    const newIntent = await begin(1, true);
    expect(states()).toEqual(["saving", "saving", "idle"]);
    await act(async () => identity!.resolve(response({ user: null })));
    expect(await oldIntent.result).toBe(false);
    expect(states()).toEqual(["saving", "saving", "idle"]);
    expect(requests).toHaveLength(1);
    expect(saved()).toBe("only-new-account");
    await settle(0);
    expect(await newIntent.result).toBe(true);
    expect(saved()).toBe("only-new-account,test-stop");
    expect(states()).toEqual(["idle", "idle", "idle"]);
  });

  it("holds a timed-out place separately from its unchanged membership and permits another place", async () => {
    vi.useFakeTimers();
    await render();
    const { result } = await begin(0, true);
    await act(async () => { await vi.advanceTimersByTimeAsync(FOLLOW_WRITE_TIMEOUT_MS); });
    expect(await result).toBe(false);
    expect(saved()).toBe("");
    expect(states()).toEqual(["unconfirmed", "unconfirmed", "idle"]);
    await act(async () => { expect(await mutate[1](true)).toBe(false); });
    expect(requests).toHaveLength(1);
    const other = await begin(2, true);
    await settle(1);
    expect(await other.result).toBe(true);
    expect(saved()).toBe("other-stop");
    await settle(0);
    expect(reads).toBe(1);
    expect(saved()).toBe("other-stop,test-stop");
    expect(states()).toEqual(["idle", "idle", "idle"]);
    expect(mocks.track).toHaveBeenCalledTimes(1);
  });

  it("keeps HTTP uncertainty held until the existing one-shot observation confirms it", async () => {
    await render(["test-stop"]);
    observation = deferred<Response>();
    const { result } = await begin(0, false);
    await settle(0, 503);
    expect(await result).toBe(true);
    expect(states()).toEqual(["unconfirmed", "unconfirmed", "idle"]);
    expect(saved()).toBe("test-stop");
    await act(async () => { await mutate[1](false); });
    expect(requests).toHaveLength(1);
    expect(reads).toBe(1);
    await act(async () => observation!.resolve(response({ slugs: ["test-stop"] })));
    expect(states()).toEqual(["idle", "idle", "idle"]);
    const retry = await begin(1, false);
    await settle(1);
    expect(await retry.result).toBe(false);
    expect(saved()).toBe("");
  });

  it("retains a lost transport hold without issuing implicit reconciliation or writes", async () => {
    await render();
    const { result } = await begin(0, true);
    await act(async () => requests[0].request.reject(new Error("Lost connection")));
    expect(await result).toBe(false);
    expect(states()).toEqual(["unconfirmed", "unconfirmed", "idle"]);
    await act(async () => { await mutate[1](true); });
    expect(requests).toHaveLength(1);
    expect(reads).toBe(0);
    expect(saved()).toBe("");
  });

  it("publishes the completed import even while a queued explicit removal awaits its own response", async () => {
    mocks.synced.mockReturnValue(false);
    imported = deferred<Response>();
    localStorage.setItem("fr:saved:v1", JSON.stringify([{ type: "place", id: "test-stop", saved_at: "2026-10-07T00:00:00.000Z" }]));
    await render();
    expect(states()).toEqual(["saving", "saving", "idle"]);
    const { result } = await begin(0, false);
    expect(requests).toHaveLength(0);
    await act(async () => {
      serverSlugs.add("test-stop");
      imported!.resolve(response({ acceptedSlugs: ["test-stop"] }));
    });
    expect(saved()).toBe("test-stop");
    expect(states()).toEqual(["removing", "removing", "idle"]);
    expect(requests).toHaveLength(1);
    expect(requests[0].method).toBe("DELETE");
    await settle(0);
    expect(await result).toBe(false);
    expect(saved()).toBe("");
  });

  it("completes a queued Save's return bridge once when the existing import confirms that place", async () => {
    mocks.synced.mockReturnValue(false);
    imported = deferred<Response>();
    localStorage.setItem("fr:saved:v1", JSON.stringify([{ type: "place", id: "test-stop", saved_at: "2026-10-07T00:00:00.000Z" }]));
    await render();
    const { result } = await begin(0, true);
    expect(saved()).toBe("");
    expect(requests).toHaveLength(0);
    expect(mocks.track).not.toHaveBeenCalled();
    expect(mocks.signalBridge).not.toHaveBeenCalled();
    await act(async () => {
      serverSlugs.add("test-stop");
      imported!.resolve(response({ acceptedSlugs: ["test-stop"] }));
    });
    expect(await result).toBe(true);
    expect(saved()).toBe("test-stop");
    expect(requests).toHaveLength(0);
    expect(mocks.track).toHaveBeenCalledExactlyOnceWith("save_place", { on: true, source: "test", synced: true });
    expect(mocks.signalBridge).toHaveBeenCalledExactlyOnceWith("place");
    expect(mocks.cancelBridge).not.toHaveBeenCalled();
    await act(async () => { expect(await mutate[1](true)).toBe(true); });
    expect(mocks.track).toHaveBeenCalledTimes(1);
    expect(mocks.signalBridge).toHaveBeenCalledTimes(1);
    expect(states()).toEqual(["idle", "idle", "idle"]);
  });

  it("does not publish an old account's queued Save effects after its import settles", async () => {
    mocks.synced.mockReturnValue(false);
    imported = deferred<Response>();
    localStorage.setItem("fr:saved:v1", JSON.stringify([{ type: "place", id: "test-stop", saved_at: "2026-10-07T00:00:00.000Z" }]));
    await render();
    const { result } = await begin(0, true);
    mocks.synced.mockReturnValue(true);
    bootstrap = { user: { id: `replacement-${accountSequence}`, email: null }, slugs: ["only-new-account"] };
    await render(["only-new-account"]);
    await act(async () => imported!.resolve(response({ acceptedSlugs: ["test-stop"] })));
    expect(await result).toBe(false);
    expect(saved()).toBe("only-new-account");
    expect(requests).toHaveLength(0);
    expect(mocks.track).not.toHaveBeenCalled();
    expect(mocks.signalBridge).not.toHaveBeenCalled();
    expect(mocks.cancelBridge).not.toHaveBeenCalled();
    expect(states()).toEqual(["idle", "idle", "idle"]);
  });

  it("does not issue a write or success effects for an already-confirmed explicit intent", async () => {
    await render(["test-stop"]);
    await act(async () => { expect(await mutate[0](true)).toBe(true); });
    expect(requests).toHaveLength(0);
    expect(saved()).toBe("test-stop");
    expect(mocks.track).not.toHaveBeenCalled();
    expect(mocks.signalBridge).not.toHaveBeenCalled();
    expect(mocks.cancelBridge).not.toHaveBeenCalled();
    expect(mocks.failure).not.toHaveBeenCalled();
    expect(states()).toEqual(["idle", "idle", "idle"]);
  });

  it("reports a refused anonymous device save without publishing membership", async () => {
    bootstrap = { user: null, slugs: [] };
    await render();
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {});
    await act(async () => { expect(await mutate[0](true)).toBe(false); });
    expect(saved()).toBe("");
    expect(localStorage.getItem("fr:saved:v1")).toBeNull();
    expect(mocks.failure).toHaveBeenCalledWith("This device could not confirm the saved change. Please try again.");
    expect(mocks.track).not.toHaveBeenCalled();
    expect(states()).toEqual(["idle", "idle", "idle"]);
  });
  it("does not commit an anonymous intent after a new account arrives while waiting for the device lock", async () => {
    bootstrap = { user: null, slugs: [] };
    await render();
    const release = locks.hold();
    const operation = await begin(0, true);
    expect(states()).toEqual(["saving", "saving", "idle"]);
    expect(localStorage.getItem("fr:saved:v1")).toBeNull();
    const changed: FollowedSlugsBootstrap = { user: { id: "new-locked-account", email: null }, slugs: ["new-account-stop"] };
    await act(async () => root.render(<Snapshot bootstrap={changed} />));
    await act(async () => { release(); expect(await operation.result).toBe(false); });
    expect(localStorage.getItem("fr:saved:v1")).toBeNull();
    expect(requests).toHaveLength(0);
    expect(mocks.track).not.toHaveBeenCalled();
    expect(mocks.signalBridge).not.toHaveBeenCalled();
    expect(mocks.failure).toHaveBeenCalledOnce();
  });

});
