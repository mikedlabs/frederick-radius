// @vitest-environment jsdom

import { installSavedLocks } from "../../../tests/helpers/saved-locks";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import SaveButton from "./SaveButton";
import MyRadiusButton from "@/components/place/MyRadiusButton";
import { FOLLOW_WRITE_TIMEOUT_MS, resetFollowsSyncFlag, useFollowedSlugs, type FollowedSlugsBootstrap } from "@/hooks/useFollows";

const mocks = vi.hoisted(() => ({
  toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }),
  hasSynced: vi.fn(() => true),
  markSynced: vi.fn(),
}));
vi.mock("sonner", () => ({ toast: mocks.toast }));
vi.mock("@/lib/haptics", () => ({ haptic: vi.fn() }));
vi.mock("@/lib/track", () => ({ track: vi.fn() }));
vi.mock("@/lib/decision/telemetry", () => ({ decisionContextFromPath: () => ({ surface: "saved", position: "list" }), trackDecision: vi.fn() }));
vi.mock("@/lib/persistence", () => ({ ensurePersistentStorage: vi.fn() }));
vi.mock("@/lib/pwa-display", () => ({ isStandalone: () => false, isInstallPromptSuppressedPath: () => false }));
vi.mock("@/lib/return-bridge", () => ({ currentReturnBridgeState: () => ({ completed: true, valueKind: null }), openReturnBridge: vi.fn(), cancelPendingReturnBridgeValue: vi.fn(), signalReturnBridgeValue: vi.fn() }));
vi.mock("@/lib/follows-sync", () => ({ clearFollowsSync: vi.fn(), hasCompletedFollowsSync: mocks.hasSynced, markFollowsSyncComplete: mocks.markSynced }));

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise<T>((done, fail) => { resolve = done; reject = fail; });
  return { promise, resolve, reject };
}
function response(status = 200, body?: unknown): Response {
  return { ok: status >= 200 && status < 300, status, json: async () => body } as Response;
}
function Snapshot({ bootstrap }: { bootstrap: FollowedSlugsBootstrap }) {
  const { slugs } = useFollowedSlugs(bootstrap);
  return <output>{[...slugs].sort().join(",")}</output>;
}

let accountSequence = 0;

describe("SaveButton with the real follow persistence hook", () => {
  let locks: ReturnType<typeof installSavedLocks>;
  let root: Root;
  let container: HTMLDivElement;
  let bootstrap: FollowedSlugsBootstrap;
  let writes: Array<{ method: string; slug: string; signal?: AbortSignal; request: ReturnType<typeof deferred<Response>> }>;
  let serverSlugs: Set<string>;
  let identity: ReturnType<typeof deferred<Response>> | undefined;
  let blockedRead: ReturnType<typeof deferred<Response>> | undefined;
  let reads: Array<{ signal?: AbortSignal }>;
  let imports: Array<{ slugs: string[]; request: ReturnType<typeof deferred<Response>> }>;
  let topics: Array<{ add?: string[]; remove?: string[] }>;


  beforeEach(() => {
    locks = installSavedLocks();
    vi.clearAllMocks();
    mocks.hasSynced.mockReturnValue(true);
    mocks.markSynced.mockImplementation(() => mocks.hasSynced.mockReturnValue(true));
    resetFollowsSyncFlag();
    localStorage.clear();
    writes = [];
    reads = [];
    imports = [];
    topics = [];
    serverSlugs = new Set();
    identity = undefined;
    blockedRead = undefined;
    bootstrap = { user: { id: `account-${++accountSequence}`, email: null }, slugs: [] };
    vi.stubGlobal("fetch", vi.fn<typeof fetch>((input, init) => {
      if (String(input) === "/api/follows/sync") {
        const request = deferred<Response>();
        imports.push({ slugs: JSON.parse(String(init?.body)).slugs, request });
        return request.promise;
      }
      if (String(input) === "/api/push/topics") {
        topics.push(JSON.parse(String(init?.body)));
        return Promise.resolve(response());
      }
      if (String(input) === "/api/auth/me" && identity) return identity.promise;
      if (String(input) === "/api/follows" && !init?.method) {
        reads.push({ signal: init?.signal as AbortSignal | undefined });
        return blockedRead?.promise ?? Promise.resolve(response(200, { slugs: [...serverSlugs] }));
      }
      if (String(input) !== "/api/follows" || !["POST", "DELETE"].includes(init?.method ?? "")) {
        throw new Error(`Unexpected request: ${String(input)}`);
      }
      const request = deferred<Response>();
      writes.push({ method: init!.method!, slug: JSON.parse(String(init!.body)).slug, signal: init!.signal as AbortSignal, request });
      return request.promise;
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
    vi.unstubAllGlobals();
  });

  async function render(slugs: string[] = [], ids = ["test-stop", "test-stop"]) {
    bootstrap = { ...bootstrap, slugs };
    serverSlugs = new Set(slugs);
    // Commit the verified account snapshot before mounting the save controls.
    await act(async () => root.render(<Snapshot bootstrap={bootstrap} />));
    await act(async () => root.render(<>
      <Snapshot bootstrap={bootstrap} />
      {ids.map((id, index) => <SaveButton key={index} refType="place" refId={id} label={`Save ${id}`} />)}
    </>));
  }
  function button(index = 0) { return container.querySelectorAll("button")[index]; }
  function saved() { return container.querySelector("output")!.textContent; }
  async function click(index = 0) { await act(async () => button(index).click()); }
  async function settle(index: number, status = 200) {
    await act(async () => {
      if (status >= 200 && status < 300) {
        if (writes[index].method === "POST") serverSlugs.add(writes[index].slug);
        else serverSlugs.delete(writes[index].slug);
      }
      writes[index].request.resolve(response(status));
    });
  }

  it.each([
    ["null entry", "[null]"],
    ["malformed object", '[{"type":"event","id":"test-event","saved_at":null}]'],
    ["whitespace id", '[{"type":"event","id":"   ","saved_at":"2026-10-07T00:00:00.000Z"}]'],
  ])("mounts the real event save hooks with an unavailable %s without changing stored bytes", async (_kind, raw) => {
    identity = deferred<Response>();
    identity.resolve(response(200, { user: null }));
    localStorage.setItem("fr:saved:v1", raw);
    const storageWrites = vi.spyOn(Storage.prototype, "setItem");
    try {
      await act(async () => root.render(
        <SaveButton refType="event" refId="test-event" label="Save Test event" barLabel="Save" />,
      ));
      expect(button().getAttribute("aria-hidden")).toBeNull();
      expect(button().disabled).toBe(true);
      expect(button().hasAttribute("aria-pressed")).toBe(false);
      expect(button().getAttribute("aria-label")).toBe("Saved state unavailable for Test event");
      expect(button().textContent).toBe("Unavailable");
      expect(button().querySelector(".save-pop, .save-ring")).toBeNull();
      await click();
      expect(storageWrites).not.toHaveBeenCalled();
      expect(localStorage.getItem("fr:saved:v1")).toBe(raw);
      expect(writes).toHaveLength(0);
      expect(imports).toHaveLength(0);
      expect(mocks.toast.success).not.toHaveBeenCalled();
    } finally {
      storageWrites.mockRestore();
    }
  });

  it("keeps an unsaved bookmark unselected until account persistence confirms it", async () => {
    await render();
    await click();
    expect(saved()).toBe("");
    expect(button().getAttribute("aria-pressed")).toBe("false");
    expect(button().getAttribute("aria-busy")).toBe("true");
    expect(button().disabled).toBe(true);
    expect(writes).toHaveLength(1);
    expect(writes[0].method).toBe("POST");
    expect(mocks.toast.success).not.toHaveBeenCalled();
    await settle(0);
    expect(button().disabled).toBe(false);
    expect(mocks.toast.success).toHaveBeenCalledTimes(1);
    expect(mocks.toast.error).not.toHaveBeenCalled();
  });

  it("holds a rejected network outcome without false retry success while other places remain usable", async () => {
    await render([], ["test-stop", "other-stop"]);
    await click();
    await act(async () => writes[0].request.reject(new Error("Offline")));
    expect(saved()).toBe("");
    expect(button().disabled).toBe(false);
    expect(mocks.toast.success).not.toHaveBeenCalled();
    expect(mocks.toast.error).toHaveBeenLastCalledWith("Could not save this item", {
      description: "The connection ended before this change could be confirmed. Refresh Saved to check your list.",
    });
    await click();
    expect(writes).toHaveLength(1);
    expect(button().disabled).toBe(false);
    await click(1);
    await settle(1);
    expect(saved()).toBe("other-stop");
    expect(mocks.toast.success).toHaveBeenCalledTimes(1);
  });

  it("keeps a failed removal saved and confirms removal only after a successful retry", async () => {
    await render(["other-stop", "test-stop"]);
    await click();
    expect(saved()).toBe("other-stop,test-stop");
    expect(button().getAttribute("aria-pressed")).toBe("true");
    expect(writes[0].method).toBe("DELETE");
    expect(mocks.toast).not.toHaveBeenCalled();
    await settle(0, 503);
    expect(saved()).toBe("other-stop,test-stop");
    expect(mocks.toast.error).toHaveBeenCalledWith("Could not remove from Saved", expect.any(Object));
    await click();
    await settle(1);
    expect(saved()).toBe("other-stop");
    expect(mocks.toast).toHaveBeenCalledWith("Removed from Saved", expect.any(Object));
  });

  it("refuses queued same-place intents until a failed HTTP outcome has been reconciled", async () => {
    await render(["test-stop"]);
    blockedRead = deferred<Response>();
    await click(0);
    await click(1);
    expect(writes).toHaveLength(1);
    await settle(0, 503);
    expect(writes).toHaveLength(1);
    expect(button(0).disabled).toBe(false);
    expect(button(1).disabled).toBe(false);
    expect(mocks.toast.success).not.toHaveBeenCalled();
    expect(mocks.toast.error).toHaveBeenCalledTimes(1);
    await act(async () => blockedRead!.resolve(response(200, { slugs: ["test-stop"] })));
    blockedRead = undefined;
    await click(1);
    expect(writes).toHaveLength(2);
    expect(writes[1].method).toBe("DELETE");
    await settle(1);
    expect(saved()).toBe("");
  });

  it("keeps duplicate controls on confirmed membership through a later failed removal", async () => {
    await render();
    await click(0);
    await click(1);
    expect(saved()).toBe("");
    expect(writes).toHaveLength(1);
    await settle(0);
    expect(saved()).toBe("test-stop");
    expect(writes).toHaveLength(1);
    await click(1);
    expect(saved()).toBe("test-stop");
    expect(writes).toHaveLength(2);
    expect(writes[1].method).toBe("DELETE");
    await settle(1, 503);
    expect(saved()).toBe("test-stop");
    expect(button(0).getAttribute("aria-pressed")).toBe("true");
    expect(button(1).getAttribute("aria-pressed")).toBe("true");
    expect(mocks.toast.error).toHaveBeenCalledWith("Could not remove from Saved", expect.any(Object));
  });

  it("does not apply an old successful write over a newer same-account bootstrap", async () => {
    await render();
    await click();
    await render(["fresh-snapshot"], ["test-stop"]);
    blockedRead = deferred<Response>();
    await settle(0);
    expect(saved()).toBe("fresh-snapshot");
    expect(reads).toHaveLength(1);
    expect(mocks.toast.success).not.toHaveBeenCalled();
    expect(mocks.toast.error).toHaveBeenCalledTimes(1);
    await act(async () => blockedRead!.resolve(response(200, { slugs: [...serverSlugs] })));
    expect(saved()).toBe("fresh-snapshot,test-stop");
  });

  it.each(["icon", "place"])("explains the known account capacity refusal in the %s control", async (control) => {
    const full = Array.from({ length: 100 }, (_, index) => `saved-${index}`);
    await render(full, []);
    await act(async () => root.render(<>
      <Snapshot bootstrap={bootstrap} />
      {control === "icon" ? <SaveButton refType="place" refId="test-stop" label="Save test-stop" /> : <MyRadiusButton slug="test-stop" name="Test Stop" />}
    </>));
    await click();
    expect(writes).toHaveLength(0);
    expect(saved()!.split(",")).toHaveLength(100);
    expect(button().disabled).toBe(false);
    expect(mocks.toast.success).not.toHaveBeenCalled();
    expect(mocks.toast.error).toHaveBeenLastCalledWith(control === "icon" ? "Could not save this item" : "Could not save this place", {
      description: "You have saved 100 places. Remove a place from Saved before adding another.",
    });
  });

  it("keeps the device topic aligned with a confirmed save after a later removal fails", async () => {
    vi.stubGlobal("navigator", { serviceWorker: { ready: Promise.resolve({ pushManager: { getSubscription: async () => ({ endpoint: "https://push.example.test/consented" }) } }) } });
    await render();
    await click(0);
    await click(1);
    await settle(0);
    expect(topics).toEqual([expect.objectContaining({ add: ["biz:test-stop"] })]);
    topics.length = 0;
    await click(1);
    await settle(1, 503);
    expect(saved()).toBe("test-stop");
    expect(topics).toEqual([expect.objectContaining({ add: ["biz:test-stop"] })]);
  });

  it("keeps the final confirmed device topic after an old-generation queued intent settles", async () => {
    vi.stubGlobal("navigator", { serviceWorker: { ready: Promise.resolve({ pushManager: { getSubscription: async () => ({ endpoint: "https://push.example.test/consented" }) } }) } });
    await render([], Array.from({ length: 8 }, () => "test-stop"));
    for (let index = 0; index < 8; index++) await click(index);
    await render(["fresh-snapshot"], ["test-stop"]);
    await settle(0);
    expect(writes).toHaveLength(1);
    expect(saved()).toBe("fresh-snapshot,test-stop");
    expect(mocks.toast.success).not.toHaveBeenCalled();
    expect(topics).toEqual([expect.objectContaining({ add: ["biz:test-stop"] })]);
  });

  it("releases an import reservation canceled before send so the same account can try its first import", async () => {
    mocks.hasSynced.mockReturnValue(false).mockImplementationOnce(() => {
      // Invalidate after reservations are queued but before the fetch microtask.
      queueMicrotask(() => resetFollowsSyncFlag());
      return false;
    });
    localStorage.setItem("fr:saved:v1", JSON.stringify([{ type: "place", id: "test-stop", saved_at: "2026-10-07T00:00:00.000Z" }]));
    await render();
    expect(imports).toHaveLength(0);
    expect(writes).toHaveLength(0);
    await render();
    expect(imports).toHaveLength(1);
    await act(async () => {
      serverSlugs.add("test-stop");
      imports[0].request.resolve(response(200, { acceptedSlugs: ["test-stop"] }));
    });
    expect(saved()).toBe("test-stop");
    expect(imports).toHaveLength(1);
  });

  it.each(["ready", "subscription"])("keeps one confirmed topic sync across a same-account bootstrap during delayed %s", async (phase) => {
    const ready = deferred<{ pushManager: { getSubscription: () => Promise<{ endpoint: string }> } }>();
    const subscription = deferred<{ endpoint: string }>();
    const getSubscription = vi.fn(() => phase === "subscription" ? subscription.promise : Promise.resolve({ endpoint: "https://push.example.test/consented" }));
    const registration = { pushManager: { getSubscription } };
    vi.stubGlobal("navigator", { serviceWorker: { ready: phase === "ready" ? ready.promise : Promise.resolve(registration) } });
    await render();
    await click();
    await settle(0);
    expect(button().disabled).toBe(false);
    expect(mocks.toast.success).toHaveBeenCalledTimes(1);
    expect(topics).toHaveLength(0);
    await render(["test-stop"]);
    await render(["test-stop"]);
    await act(async () => {
      ready.resolve(registration);
      subscription.resolve({ endpoint: "https://push.example.test/consented" });
    });
    expect(topics).toEqual([expect.objectContaining({ add: ["biz:test-stop"] })]);
    expect(getSubscription).toHaveBeenCalledTimes(1);
    expect(writes).toHaveLength(1);
    expect(mocks.toast.success).toHaveBeenCalledTimes(1);
  });

  it.each(["opposite", "other-account", "same-account-reset"])("does not send a delayed topic for an obsolete %s confirmation", async (replacement) => {
    const subscription = deferred<{ endpoint: string }>();
    vi.stubGlobal("navigator", { serviceWorker: { ready: Promise.resolve({ pushManager: { getSubscription: () => subscription.promise } }) } });
    await render();
    await click();
    await settle(0);
    if (replacement === "other-account") bootstrap = { ...bootstrap, user: { id: `other-${accountSequence}`, email: null } };
    if (replacement === "same-account-reset") resetFollowsSyncFlag();
    await render(replacement === "opposite" ? [] : ["test-stop"]);
    await act(async () => subscription.resolve({ endpoint: "https://push.example.test/consented" }));
    expect(topics).toHaveLength(0);
    expect(writes).toHaveLength(1);
    expect(mocks.toast.success).toHaveBeenCalledTimes(1);
  });

  it("does not send a delayed confirmed topic against a matching but unsettled optimistic intent", async () => {
    const subscription = deferred<{ endpoint: string }>();
    vi.stubGlobal("navigator", { serviceWorker: { ready: Promise.resolve({ pushManager: { getSubscription: () => subscription.promise } }) } });
    await render();
    await click(0);
    await settle(0);
    await click(0);
    await click(1);
    expect(writes).toHaveLength(2);
    expect(saved()).toBe("test-stop");
    await act(async () => subscription.resolve({ endpoint: "https://push.example.test/consented" }));
    expect(topics).toHaveLength(0);
    await settle(1, 503);
    expect(topics).toEqual([expect.objectContaining({ add: ["biz:test-stop"] })]);
    expect(writes).toHaveLength(2);
    expect(saved()).toBe("test-stop");
  });

  it("publishes a confirmed bulk import before an explicit removal can remove its place", async () => {
    mocks.hasSynced.mockReturnValue(false);
    localStorage.setItem("fr:saved:v1", JSON.stringify([{ type: "place", id: "test-stop", saved_at: "2026-10-07T00:00:00.000Z" }]));
    await render();
    expect(button(0).disabled).toBe(true);
    expect(button(1).disabled).toBe(true);
    await click(0);
    await click(1);
    expect(imports).toHaveLength(1);
    expect(writes).toHaveLength(0);
    expect(saved()).toBe("");
    await act(async () => {
      serverSlugs.add("test-stop");
      imports[0].request.resolve(response(200, { acceptedSlugs: ["test-stop"] }));
    });
    expect(saved()).toBe("test-stop");
    expect(writes).toHaveLength(0);
    await click(0);
    expect(writes).toHaveLength(1);
    expect(writes[0].method).toBe("DELETE");
    expect(saved()).toBe("test-stop");
    await settle(0);
    expect(saved()).toBe("");
    expect([...serverSlugs]).toEqual([]);
    expect(imports).toHaveLength(1);
    expect(mocks.toast).toHaveBeenCalledWith("Removed from Saved", expect.any(Object));
  });

  it("bounds a hung import body, shares one fresh read, and ignores its late accepted slugs after removal", async () => {
    vi.useFakeTimers();
    mocks.hasSynced.mockReturnValue(false);
    localStorage.setItem("fr:saved:v1", JSON.stringify(["test-stop", "second-import"].map((id) => ({ type: "place", id, saved_at: "2026-10-07T00:00:00.000Z" }))));
    await render([], ["test-stop", "other-stop"]);
    const body = deferred<unknown>();
    await act(async () => {
      serverSlugs.add("test-stop");
      serverSlugs.add("second-import");
      imports[0].request.resolve({ ok: true, status: 200, json: () => body.promise } as Response);
    });
    await click(0);
    expect(writes).toHaveLength(0);
    await act(async () => { await vi.advanceTimersByTimeAsync(FOLLOW_WRITE_TIMEOUT_MS); });
    expect(button().disabled).toBe(false);
    expect(writes).toHaveLength(0);
    expect(reads).toHaveLength(1);
    expect(saved()).toBe("second-import,test-stop");
    expect(mocks.toast.success).not.toHaveBeenCalled();
    await click(0);
    expect(writes[0].method).toBe("DELETE");
    await settle(0);
    expect(saved()).toBe("second-import");
    await act(async () => body.resolve({ acceptedSlugs: ["test-stop", "second-import"] }));
    expect(saved()).toBe("second-import");
    expect([...serverSlugs]).toEqual(["second-import"]);
    expect(imports).toHaveLength(1);
  });

  it("holds a lost import outcome without a second batch or conflicting write and permits unrelated saves", async () => {
    vi.useFakeTimers();
    mocks.hasSynced.mockReturnValue(false);
    localStorage.setItem("fr:saved:v1", JSON.stringify([{ type: "place", id: "test-stop", saved_at: "2026-10-07T00:00:00.000Z" }]));
    await render([], ["test-stop", "other-stop"]);
    await click(0);
    await act(async () => { await vi.advanceTimersByTimeAsync(FOLLOW_WRITE_TIMEOUT_MS); });
    expect(button().disabled).toBe(false);
    expect(writes).toHaveLength(0);
    expect(mocks.toast.error).not.toHaveBeenCalled();
    await act(async () => imports[0].request.reject(new Error("Connection lost")));
    await click(0);
    expect(writes).toHaveLength(0);
    expect(mocks.toast.error).toHaveBeenLastCalledWith("Could not save this item", { description: "The connection ended before this change could be confirmed. Refresh Saved to check your list." });
    await click(1);
    await settle(0);
    expect(saved()).toBe("other-stop");
    expect(imports).toHaveLength(1);
  });

  it("orders the one-shot import before a same-place removal while another place remains usable", async () => {
    mocks.hasSynced.mockReturnValue(false);
    localStorage.setItem("fr:saved:v1", JSON.stringify([{ type: "place", id: "test-stop", saved_at: "2026-10-07T00:00:00.000Z" }]));
    await render([], ["test-stop", "other-stop"]);
    expect(imports).toHaveLength(1);
    expect(imports[0].slugs).toEqual(["test-stop"]);
    // A new verified page can see the import before its browser response arrives.
    await render(["test-stop"], ["test-stop", "other-stop"]);
    await click(0);
    expect(writes).toHaveLength(0);
    await click(1);
    expect(writes).toHaveLength(1);
    expect(writes[0].slug).toBe("other-stop");
    await settle(0);
    mocks.toast.success.mockClear();
    await act(async () => {
      serverSlugs.add("test-stop");
      imports[0].request.resolve(response(200, { acceptedSlugs: ["test-stop"] }));
    });
    expect(imports).toHaveLength(1);
    expect(mocks.toast.success).not.toHaveBeenCalled();
    // The queued intent was invalidated by the intervening verified page; retry
    // against its reconciled current membership, never acknowledge the old tap.
    expect(saved()).toBe("other-stop,test-stop");
    await click(0);
    expect(writes).toHaveLength(2);
    expect(writes[1].method).toBe("DELETE");
    await settle(1);
    expect(saved()).toBe("other-stop");
    expect([...serverSlugs]).toEqual(["other-stop"]);
    expect(imports).toHaveLength(1);
  });

  it("allows independent places to persist concurrently and preserves a different place on failure", async () => {
    await render([], ["test-stop", "other-stop"]);
    await click(0);
    await click(1);
    expect(writes).toHaveLength(2);
    await settle(1);
    await settle(0, 503);
    expect(saved()).toBe("other-stop");
    expect(button(1).getAttribute("aria-pressed")).toBe("true");
    expect(mocks.toast.success).toHaveBeenCalledTimes(1);
    expect(mocks.toast.error).toHaveBeenCalledTimes(1);
  });

  it("does not send a queued write with a different account's cookie or change its snapshot", async () => {
    await render(["test-stop"]);
    await click(0);
    await click(1);
    bootstrap = { user: { id: "account-b", email: null }, slugs: ["only-account-b"] };
    await act(async () => root.render(<Snapshot bootstrap={bootstrap} />));
    await settle(0, 503);
    expect(writes).toHaveLength(1);
    expect(saved()).toBe("only-account-b");
  });

  it("reconciles an old response after a same-account reset before permitting a newer write", async () => {
    await render();
    await click();
    resetFollowsSyncFlag();
    await render(["only-account"], ["test-stop"]);
    blockedRead = deferred<Response>();
    await click();
    expect(writes).toHaveLength(1);
    await settle(0);
    expect(writes).toHaveLength(1);
    expect(saved()).toBe("only-account");
    expect(button().disabled).toBe(false);
    expect(mocks.toast.success).not.toHaveBeenCalled();
    await act(async () => blockedRead!.resolve(response(200, { slugs: [...serverSlugs] })));
    blockedRead = undefined;
    expect(saved()).toBe("only-account,test-stop");
    await click();
    expect(writes[1].method).toBe("DELETE");
    await settle(1);
    expect(saved()).toBe("only-account");
    expect([...serverSlugs]).toEqual(["only-account"]);
  });

  it("bounds a hung save without aborting it and permits retry only after its HTTP response and fresh read", async () => {
    vi.useFakeTimers();
    await render([], ["test-stop", "other-stop"]);
    await click();
    await act(async () => { await vi.advanceTimersByTimeAsync(FOLLOW_WRITE_TIMEOUT_MS); });
    expect(writes[0].signal).toBeUndefined();
    expect(button().disabled).toBe(false);
    expect(saved()).toBe("");
    expect(mocks.toast.error).toHaveBeenLastCalledWith("Could not save this item", {
      description: "This change is still pending. Wait for it to finish before making another change to this place.",
    });
    await click();
    expect(writes).toHaveLength(1);
    expect(button().disabled).toBe(false);
    await click(1);
    await settle(1);
    expect(saved()).toBe("other-stop");
    const successes = mocks.toast.success.mock.calls.length;
    await settle(0);
    expect(reads).toHaveLength(1);
    expect(saved()).toBe("other-stop,test-stop");
    expect(mocks.toast.success).toHaveBeenCalledTimes(successes);
    await click();
    expect(writes[2].method).toBe("DELETE");
    await settle(2);
    expect(saved()).toBe("other-stop");
    expect([...serverSlugs]).toEqual(["other-stop"]);
  });

  it("settles every intent queued before timeout without launching a second mutation", async () => {
    vi.useFakeTimers();
    await render();
    await click(0);
    await click(1);
    await act(async () => { await vi.advanceTimersByTimeAsync(FOLLOW_WRITE_TIMEOUT_MS); });
    expect(writes).toHaveLength(1);
    expect(button(0).disabled).toBe(false);
    expect(button(1).disabled).toBe(false);
    expect(mocks.toast.success).not.toHaveBeenCalled();
    expect(saved()).toBe("");
    await settle(0);
    expect(saved()).toBe("test-stop");
    await click(1);
    await settle(1);
    expect(saved()).toBe("");
    expect([...serverSlugs]).toEqual([]);
  });

  it("bounds the reconciliation body read, keeps the hold, and ignores a late read after a successful retry", async () => {
    vi.useFakeTimers();
    await render();
    await click();
    await act(async () => { await vi.advanceTimersByTimeAsync(FOLLOW_WRITE_TIMEOUT_MS); });
    const body = deferred<unknown>();
    blockedRead = deferred<Response>();
    blockedRead.resolve({ ok: true, status: 200, json: () => body.promise } as Response);
    await settle(0);
    await act(async () => { await vi.advanceTimersByTimeAsync(FOLLOW_WRITE_TIMEOUT_MS); });
    expect(reads[0].signal?.aborted).toBe(true);
    expect(saved()).toBe("");
    blockedRead = undefined;
    await click();
    expect(writes).toHaveLength(1);
    expect(button().disabled).toBe(false);
    expect(saved()).toBe("test-stop");
    await click();
    await settle(1);
    expect(saved()).toBe("");
    const feedback = [mocks.toast.mock.calls.length, mocks.toast.success.mock.calls.length, mocks.toast.error.mock.calls.length];
    await act(async () => body.resolve({ slugs: ["test-stop"] }));
    expect(saved()).toBe("");
    expect([mocks.toast.mock.calls.length, mocks.toast.success.mock.calls.length, mocks.toast.error.mock.calls.length]).toEqual(feedback);
  });

  it("keeps missing membership unknown when the reconciliation snapshot is truncated", async () => {
    vi.useFakeTimers();
    await render();
    await click();
    await act(async () => { await vi.advanceTimersByTimeAsync(FOLLOW_WRITE_TIMEOUT_MS); });
    blockedRead = deferred<Response>();
    blockedRead.resolve(response(200, { slugs: ["other-stop"], truncated: true }));
    await settle(0);
    await click();
    expect(writes).toHaveLength(1);
    expect(button().disabled).toBe(false);
    expect(mocks.toast.success).not.toHaveBeenCalled();
    expect(saved()).toBe("");
  });

  it("preserves confirmed membership omitted by a truncated bootstrap during a failed removal", async () => {
    await render(["test-stop"]);
    await click();
    bootstrap = { ...bootstrap, slugs: ["other-stop"], truncated: true };
    await act(async () => root.render(<>
      <Snapshot bootstrap={bootstrap} />
      {[0, 1].map((index) => <SaveButton key={index} refType="place" refId="test-stop" label="Save test-stop" />)}
    </>));
    blockedRead = deferred<Response>();
    blockedRead.resolve(response(200, { slugs: ["other-stop"], truncated: true }));
    await settle(0, 503);
    // The old-generation failure must not rewrite the new page. Its truncated
    // read cannot establish absence, so the transport remains held for retry.
    expect(saved()).toBe("other-stop");
    expect(button().disabled).toBe(false);
    expect(button().getAttribute("aria-pressed")).toBe("false");
    expect(mocks.toast).not.toHaveBeenCalled();
    expect(mocks.toast.success).not.toHaveBeenCalled();
    expect(mocks.toast.error).toHaveBeenLastCalledWith("Could not remove from Saved", expect.any(Object));
    await click();
    expect(writes).toHaveLength(1);
    expect(saved()).toBe("other-stop,test-stop");
  });

  it("allows the first deferred authenticated lookup to hydrate and save", async () => {
    identity = deferred<Response>();
    const user = bootstrap.user;
    await act(async () => root.render(<SaveButton refType="place" refId="test-stop" label="Save test-stop" />));
    await click();
    expect(button().disabled).toBe(true);
    await act(async () => identity!.resolve(response(200, { user })));
    expect(writes).toHaveLength(1);
    expect(writes[0].method).toBe("POST");
    expect(mocks.toast.success).not.toHaveBeenCalled();
    await settle(0);
    expect(button().getAttribute("aria-pressed")).toBe("true");
    expect(mocks.toast.success).toHaveBeenCalledTimes(1);
  });

  it.each(["icon", "place"])("keeps %s failure feedback truthful when device and account membership differ during auth", async (control) => {
    identity = deferred<Response>();
    localStorage.setItem("fr:saved:v1", JSON.stringify([{ type: "place", id: "test-stop", saved_at: "2026-10-07T00:00:00.000Z" }]));
    await act(async () => root.render(control === "icon"
      ? <SaveButton refType="place" refId="test-stop" label="Save test-stop" />
      : <MyRadiusButton slug="test-stop" name="Test Stop" />));
    expect(button().getAttribute("aria-pressed")).toBe("true");
    await click();
    await act(async () => identity!.resolve(response(200, { user: bootstrap.user })));
    expect(writes).toHaveLength(0);
    expect(button().disabled).toBe(false);
    expect(button().getAttribute("aria-pressed")).toBe("false");
    expect(mocks.toast).not.toHaveBeenCalled();
    expect(mocks.toast.success).not.toHaveBeenCalled();
    expect(mocks.toast.error).toHaveBeenLastCalledWith("Could not remove from Saved", {
      description: "Your saved list changed while we checked your account. Check this place and try again.",
    });
    expect(JSON.parse(localStorage.getItem("fr:saved:v1")!)).toHaveLength(1);
    // A fresh tap uses the account state now shown by the control.
    await click();
    expect(writes).toHaveLength(1);
    expect(writes[0].method).toBe("POST");
    await settle(0);
    expect(button().getAttribute("aria-pressed")).toBe("true");
    expect(mocks.toast.success).toHaveBeenCalledTimes(1);
  });

  it("releases a hung identity lookup without a local save and recovers with a fresh lookup", async () => {
    vi.useFakeTimers();
    identity = deferred<Response>();
    const oldLookup = identity;
    const user = bootstrap.user;
    await act(async () => root.render(<SaveButton refType="place" refId="test-stop" label="Save test-stop" />));
    await click();
    await act(async () => { await vi.advanceTimersByTimeAsync(FOLLOW_WRITE_TIMEOUT_MS); });
    expect(button().disabled).toBe(false);
    expect(writes).toHaveLength(0);
    expect(localStorage.getItem("fr:saved:v1")).toBeNull();
    expect(mocks.toast.success).not.toHaveBeenCalled();
    expect(mocks.toast.error).toHaveBeenLastCalledWith("Could not save this item", {
      description: "We could not confirm this change. Please try again.",
    });
    identity = deferred<Response>();
    identity.resolve(response(200, { user }));
    // The list listener also retries unknown identity, so controls use the
    // recovered account rather than continuing to display a local snapshot.
    await act(async () => { await vi.advanceTimersByTimeAsync(1_000); });
    await click();
    expect(writes).toHaveLength(1);
    await settle(0);
    expect(button().getAttribute("aria-pressed")).toBe("true");
    expect(mocks.toast.success).toHaveBeenCalledTimes(1);
    await act(async () => oldLookup.resolve(response(200, { user: null })));
    expect(button().getAttribute("aria-pressed")).toBe("true");
    expect(localStorage.getItem("fr:saved:v1")).toBeNull();
  });

  it.each(["account", "anonymous"])("does not let an old deferred %s identity mutate a newly bootstrapped account", async (oldIdentity) => {
    identity = deferred<Response>();
    const user = bootstrap.user;
    await act(async () => root.render(<SaveButton refType="place" refId="test-stop" label="Save test-stop" />));
    await click();
    bootstrap = { user: { id: `different-${accountSequence}`, email: null }, slugs: ["only-new-account"] };
    await act(async () => root.render(<Snapshot bootstrap={bootstrap} />));
    await act(async () => identity!.resolve(response(200, { user: oldIdentity === "account" ? user : null })));
    expect(writes).toHaveLength(0);
    expect(localStorage.getItem("fr:saved:v1")).toBeNull();
    expect(saved()).toBe("only-new-account");
    expect(mocks.toast.success).not.toHaveBeenCalled();
  });

  it("keeps anonymous saves and Undo on this device without an account write", async () => {
    bootstrap = { user: null, slugs: [] };
    await render();
    await click();
    expect(writes).toHaveLength(0);
    expect(JSON.parse(localStorage.getItem("fr:saved:v1")!)).toEqual([
      expect.objectContaining({ type: "place", id: "test-stop" }),
    ]);
    expect(mocks.toast.success).toHaveBeenCalledTimes(1);
    const options = mocks.toast.success.mock.calls[0][1];
    await act(async () => options.action.onClick());
    expect(JSON.parse(localStorage.getItem("fr:saved:v1")!)).toEqual([]);
    expect(writes).toHaveLength(0);
  });
});
