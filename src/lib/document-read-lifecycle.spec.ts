// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { documentReadIsActive, scheduleDocumentRead } from "./document-read-lifecycle";

describe("optional document reads", () => {
  let frames: Map<number, FrameRequestCallback>;
  let nextFrame: number;
  const visibility = (state: DocumentVisibilityState) => {
    Object.defineProperty(document, "visibilityState", { configurable: true, value: state });
  };
  const frame = () => {
    const callbacks = [...frames.values()]; frames.clear();
    for (const callback of callbacks) callback(performance.now());
  };
  beforeEach(() => {
    visibility("visible");
    window.dispatchEvent(new Event("pageshow"));
    frames = new Map(); nextFrame = 0;
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
      const id = ++nextFrame; frames.set(id, callback); return id;
    });
    vi.stubGlobal("cancelAnimationFrame", (id: number) => { frames.delete(id); });
  });
  afterEach(() => { vi.unstubAllGlobals(); });

  it("waits for a frame before admitting the read", () => {
    const read = vi.fn(); scheduleDocumentRead(read);
    expect(read).not.toHaveBeenCalled();
    expect(frames.size).toBe(1);
    frame();
    expect(read).toHaveBeenCalledTimes(1);
  });

  it("does not admit a late passive mount after pagehide while visibility is stale", () => {
    window.dispatchEvent(new Event("pagehide"));
    const read = vi.fn(); const skipped = vi.fn();
    scheduleDocumentRead(read, skipped);
    expect(read).not.toHaveBeenCalled();
    expect(skipped).toHaveBeenCalledTimes(1);
    expect(frames.size).toBe(0);
    document.dispatchEvent(new Event("visibilitychange"));
    expect(documentReadIsActive()).toBe(false);
    window.dispatchEvent(new PageTransitionEvent("pageshow", { persisted: true }));
    scheduleDocumentRead(read); frame();
    expect(read).toHaveBeenCalledTimes(1);
  });

  it("cancels queued work once on departure even if a stale frame callback arrives", () => {
    const read = vi.fn(); const skipped = vi.fn();
    const cancel = scheduleDocumentRead(read, skipped);
    const lateCallback = [...frames.values()][0];
    window.dispatchEvent(new Event("pagehide"));
    cancel(); lateCallback(performance.now());
    expect(read).not.toHaveBeenCalled();
    expect(skipped).toHaveBeenCalledTimes(1);
    expect(frames.size).toBe(0);
  });

  it("skips hidden startup without scheduling and rechecks visibility at admission", () => {
    const read = vi.fn(); const skipped = vi.fn();
    visibility("hidden"); scheduleDocumentRead(read, skipped);
    expect(frames.size).toBe(0);
    visibility("visible"); scheduleDocumentRead(read, skipped);
    visibility("hidden"); frame();
    expect(read).not.toHaveBeenCalled();
    expect(skipped).toHaveBeenCalledTimes(2);
  });

  it("cancels queued work when the document becomes hidden", () => {
    const read = vi.fn(); const skipped = vi.fn();
    scheduleDocumentRead(read, skipped);
    visibility("hidden"); document.dispatchEvent(new Event("visibilitychange")); frame();
    expect(read).not.toHaveBeenCalled();
    expect(skipped).toHaveBeenCalledTimes(1);
    visibility("visible"); document.dispatchEvent(new Event("visibilitychange"));
    scheduleDocumentRead(read); frame();
    expect(read).toHaveBeenCalledTimes(1);
  });
});
