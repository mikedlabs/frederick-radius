import { describe, expect, it, vi } from "vitest";
import {
  UPDATE_PROMPT_DURATION_MS,
  UPDATE_PROMPT_SNOOZE_MS,
  requestFairOfflineWarm,
  shouldReloadForAcceptedUpdate,
  shouldOfferUpdatePrompt,
  shouldWarmFairOffline,
  updatePromptPresentation,
} from "./ServiceWorkerRegister";

describe("service-worker update prompt presentation", () => {
  it("moves the prompt away from the map's bottom controls", () => {
    expect(updatePromptPresentation("/map")).toEqual({
      duration: UPDATE_PROMPT_DURATION_MS,
      position: "top-center",
    });
  });

  it("stays above mobile navigation and always expires", () => {
    const presentation = updatePromptPresentation("/today", true);

    expect(presentation.position).toBe("bottom-center");
    expect(Number.isFinite(presentation.duration)).toBe(true);
    expect(presentation.duration).toBeGreaterThanOrEqual(8_000);
  });

  it("moves to a quiet corner on wider screens", () => {
    expect(updatePromptPresentation("/today", false).position).toBe("bottom-right");
  });
});

describe("service-worker controller changes", () => {
  it("never reloads for a fresh first install", () => {
    expect(shouldReloadForAcceptedUpdate(false, false)).toBe(false);
  });

  it("reloads once after the visitor accepts an update", () => {
    expect(shouldReloadForAcceptedUpdate(true, false)).toBe(true);
    expect(shouldReloadForAcceptedUpdate(true, true)).toBe(false);
  });
});

describe("service-worker update prompt snooze", () => {
  it("does not repeat the same waiting update after an in-app navigation", () => {
    const now = Date.parse("2026-08-13T18:00:00Z");
    expect(shouldOfferUpdatePrompt(now - 5_000, now)).toBe(false);
  });

  it("offers the waiting update again after the short snooze expires", () => {
    const now = Date.parse("2026-08-13T18:00:00Z");
    expect(
      shouldOfferUpdatePrompt(now - UPDATE_PROMPT_SNOOZE_MS, now),
    ).toBe(true);
    expect(shouldOfferUpdatePrompt(null, now)).toBe(true);
  });
});

describe("Fair offline warm-up", () => {
  it.each([
    "/fair",
    "/moments/great-frederick-fair-2026",
  ])("allows the exact query-free Fair route %s", (pathname) => {
    expect(shouldWarmFairOffline(pathname, "")).toBe(true);
  });

  it.each([
    ["/fair", "?day=1"],
    ["/fair/", ""],
    ["/moments/great-frederick-fair-2026/", ""],
    ["/moments/great-frederick-fair-2026/tickets", ""],
    ["/today", ""],
  ])("rejects non-canonical route %s%s", (pathname, search) => {
    expect(shouldWarmFairOffline(pathname, search)).toBe(false);
  });

  it("messages an already-active worker after registration", async () => {
    const postMessage = vi.fn();
    const ready = Promise.resolve({ active: null });

    await expect(
      requestFairOfflineWarm(
        "/fair",
        "",
        { active: { postMessage } },
        { ready },
      ),
    ).resolves.toBe(true);
    expect(postMessage).toHaveBeenCalledWith({ type: "CACHE_FAIR" });
  });

  it("waits for the ready worker on a first install", async () => {
    const postMessage = vi.fn();

    await expect(
      requestFairOfflineWarm(
        "/moments/great-frederick-fair-2026",
        "",
        { active: null },
        { ready: Promise.resolve({ active: { postMessage } }) },
      ),
    ).resolves.toBe(true);
    expect(postMessage).toHaveBeenCalledWith({ type: "CACHE_FAIR" });
  });
});
