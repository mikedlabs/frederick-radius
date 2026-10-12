import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ flushSync: vi.fn((callback: () => void) => callback()) }));
vi.mock("react-dom", () => ({ flushSync: mocks.flushSync }));
import { revealPlan } from "./plan-motion";

beforeEach(() => { vi.clearAllMocks(); mocks.flushSync.mockImplementation((callback) => callback()); });
afterEach(() => vi.unstubAllGlobals());

describe("usable plan reveal", () => {
  it("commits once before resolving without requiring a browser", async () => {
    vi.stubGlobal("document", undefined); vi.stubGlobal("window", undefined);
    const update = vi.fn();
    const completion = revealPlan(update);
    expect(update).toHaveBeenCalledTimes(1);
    expect(mocks.flushSync).toHaveBeenCalledTimes(1);
    await completion;
  });

  it("does not capture the document even when native transitions are available", async () => {
    const start = vi.fn();
    vi.stubGlobal("document", { startViewTransition: start });
    vi.stubGlobal("window", { matchMedia: vi.fn(() => ({ matches: false })) });
    const update = vi.fn();
    await revealPlan(update);
    expect(update).toHaveBeenCalledTimes(1);
    expect(start).not.toHaveBeenCalled();
  });

  it("reports a failed update without replaying it", async () => {
    const error = new Error("State update failed");
    const update = vi.fn(() => { throw error; });
    await expect(revealPlan(update)).rejects.toBe(error);
    expect(update).toHaveBeenCalledTimes(1);
  });

  it("reports a flush failure before the update without pretending to commit", async () => {
    const error = new Error("Flush unavailable");
    mocks.flushSync.mockImplementationOnce(() => { throw error; });
    const update = vi.fn();
    await expect(revealPlan(update)).rejects.toBe(error);
    expect(update).not.toHaveBeenCalled();
  });

  it("does not duplicate an update if the flush fails after it commits", async () => {
    const error = new Error("Flush failed after commit");
    mocks.flushSync.mockImplementationOnce((callback) => { callback(); throw error; });
    const update = vi.fn();
    await expect(revealPlan(update)).rejects.toBe(error);
    expect(update).toHaveBeenCalledTimes(1);
  });
});
