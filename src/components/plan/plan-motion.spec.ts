import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ flushSync: vi.fn((callback: () => void) => callback()) }));
vi.mock("react-dom", () => ({ flushSync: mocks.flushSync }));
import { revealPlan } from "./plan-motion";

const completedTransition = (): Pick<ViewTransition, "ready" | "finished" | "updateCallbackDone"> => ({
  ready: Promise.resolve(), finished: Promise.resolve(), updateCallbackDone: Promise.resolve(),
});
function deferred() {
  let resolve!: () => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<void>((done, fail) => { resolve = done; reject = fail; });
  return { promise, resolve, reject };
}
function browser(start?: (callback: () => void) => Pick<ViewTransition, "ready" | "finished" | "updateCallbackDone">, reduced = false) {
  vi.stubGlobal("document", { ...(start ? { startViewTransition: start } : {}) });
  vi.stubGlobal("window", { matchMedia: vi.fn(() => ({ matches: reduced })) });
}

beforeEach(() => { vi.clearAllMocks(); mocks.flushSync.mockImplementation((callback) => callback()); });
afterEach(() => vi.unstubAllGlobals());

describe("optional plan reveal motion", () => {
  it("updates immediately in an unsupported browser", () => {
    browser();
    const update = vi.fn(); revealPlan(update);
    expect(update).toHaveBeenCalledTimes(1);
    expect(mocks.flushSync).not.toHaveBeenCalled();
  });

  it("updates immediately without a browser document", () => {
    vi.stubGlobal("document", undefined); vi.stubGlobal("window", undefined);
    const update = vi.fn(); revealPlan(update);
    expect(update).toHaveBeenCalledTimes(1);
    expect(mocks.flushSync).not.toHaveBeenCalled();
  });

  it("honors reduced motion without starting an animation", () => {
    const start = vi.fn(() => completedTransition()); browser(start, true);
    const update = vi.fn(); revealPlan(update);
    expect(update).toHaveBeenCalledTimes(1);
    expect(start).not.toHaveBeenCalled();
    expect(window.matchMedia).toHaveBeenCalledWith("(prefers-reduced-motion: reduce)");
  });

  it("updates immediately when the motion preference is unavailable", () => {
    const start = vi.fn(() => completedTransition()); browser(start);
    vi.stubGlobal("window", {});
    const update = vi.fn(); revealPlan(update);
    expect(update).toHaveBeenCalledTimes(1);
    expect(start).not.toHaveBeenCalled();
  });

  it("updates immediately when checking the motion preference throws", () => {
    const start = vi.fn(() => completedTransition()); browser(start);
    vi.stubGlobal("window", { matchMedia: () => { throw new Error("Preference unavailable"); } });
    const update = vi.fn(); revealPlan(update);
    expect(update).toHaveBeenCalledTimes(1);
    expect(start).not.toHaveBeenCalled();
  });

  it("commits synchronously inside the browser's reveal callback", () => {
    let callback: (() => void) | undefined;
    const start = vi.fn((work: () => void) => { callback = work; return completedTransition(); });
    browser(start);
    const update = vi.fn(); revealPlan(update);
    expect(start).toHaveBeenCalledTimes(1);
    expect(update).not.toHaveBeenCalled();
    callback!();
    expect(update).toHaveBeenCalledTimes(1);
    expect(mocks.flushSync).toHaveBeenCalledTimes(1);
    callback!();
    expect(update).toHaveBeenCalledTimes(1);
    expect(mocks.flushSync).toHaveBeenCalledTimes(1);
  });

  it("preserves the native document receiver", () => {
    const start = vi.fn(function (this: Document, work: () => void) {
      expect(this).toBe(document); work(); return completedTransition();
    });
    browser(start);
    const update = vi.fn(); revealPlan(update);
    expect(update).toHaveBeenCalledTimes(1);
  });

  it("falls back once when the native API throws before the callback", () => {
    browser(() => { throw new Error("Capture failed"); });
    const update = vi.fn(); revealPlan(update);
    expect(update).toHaveBeenCalledTimes(1);
    expect(mocks.flushSync).not.toHaveBeenCalled();
  });

  it("does not duplicate a commit when the API throws after the callback", () => {
    browser((work) => { work(); throw new Error("Animation failed"); });
    const update = vi.fn(); revealPlan(update);
    expect(update).toHaveBeenCalledTimes(1);
    expect(mocks.flushSync).toHaveBeenCalledTimes(1);
  });

  it("falls back when the React animation flush fails before the update", () => {
    browser((work) => { work(); return completedTransition(); });
    mocks.flushSync.mockImplementationOnce(() => { throw new Error("Flush unavailable"); });
    const update = vi.fn(); revealPlan(update);
    expect(update).toHaveBeenCalledTimes(1);
  });

  it("consumes skipped ready and failed completion promises after a commit", async () => {
    browser((work) => {
      work();
      return { ready: Promise.reject(new Error("Ready skipped")), finished: Promise.reject(new Error("Finished failed")), updateCallbackDone: Promise.reject(new Error("Update failed")) };
    });
    const update = vi.fn(); revealPlan(update);
    await Promise.resolve(); await Promise.resolve();
    expect(update).toHaveBeenCalledTimes(1);
  });

  it.each(["finished", "updateCallbackDone"] as const)("recovers an update skipped by a failed %s and ignores a later native callback", async (failure) => {
    let callback: (() => void) | undefined;
    const failed = deferred();
    const pending = deferred();
    browser((work) => { callback = work; return { ready: pending.promise, finished: pending.promise, updateCallbackDone: pending.promise, [failure]: failed.promise }; });
    const update = vi.fn();
    const completion = revealPlan(update);
    expect(update).not.toHaveBeenCalled();
    failed.reject(new Error("Transition abandoned"));
    await completion;
    expect(update).toHaveBeenCalledTimes(1);
    callback!();
    expect(update).toHaveBeenCalledTimes(1);
  });

  it("keeps the build promise pending until a deferred native callback commits, without waiting for animation", async () => {
    let callback: (() => void) | undefined;
    const nativeUpdate = deferred();
    const animation = deferred();
    browser((work) => { callback = work; return { ready: animation.promise, finished: animation.promise, updateCallbackDone: nativeUpdate.promise }; });
    const update = vi.fn();
    const completion = revealPlan(update);
    let settled = false;
    void completion.then(() => { settled = true; });
    await Promise.resolve();
    expect(settled).toBe(false);
    expect(update).not.toHaveBeenCalled();
    callback!();
    await completion;
    expect(settled).toBe(true);
    expect(update).toHaveBeenCalledTimes(1);
    expect(mocks.flushSync).toHaveBeenCalledTimes(1);
    nativeUpdate.resolve();
    animation.resolve();
    await Promise.resolve();
    expect(update).toHaveBeenCalledTimes(1);
  });

  it("falls back when native update completion arrives without a callback and ignores a late callback", async () => {
    let callback: (() => void) | undefined;
    const nativeUpdate = deferred();
    const animation = deferred();
    browser((work) => { callback = work; return { ready: animation.promise, finished: animation.promise, updateCallbackDone: nativeUpdate.promise }; });
    const update = vi.fn();
    const completion = revealPlan(update);
    nativeUpdate.resolve();
    await completion;
    expect(update).toHaveBeenCalledTimes(1);
    callback!();
    expect(update).toHaveBeenCalledTimes(1);
    expect(mocks.flushSync).not.toHaveBeenCalled();
  });

  it("consumes a skipped ready promise without resolving the build before the deferred callback", async () => {
    let callback: (() => void) | undefined;
    const ready = deferred();
    const pending = deferred();
    browser((work) => { callback = work; return { ready: ready.promise, finished: pending.promise, updateCallbackDone: pending.promise }; });
    const update = vi.fn();
    const completion = revealPlan(update);
    let settled = false;
    void completion.then(() => { settled = true; });
    ready.reject(new Error("Capture skipped"));
    await Promise.resolve(); await Promise.resolve();
    expect(settled).toBe(false);
    expect(update).not.toHaveBeenCalled();
    callback!();
    await completion;
    expect(update).toHaveBeenCalledTimes(1);
  });

  it("reports a state-update error through the build promise without retrying the failed update", async () => {
    browser((work) => { work(); return completedTransition(); });
    const update = vi.fn(() => { throw new Error("State update failed"); });
    await expect(revealPlan(update)).rejects.toThrow("State update failed");
    expect(update).toHaveBeenCalledTimes(1);
  });
});
