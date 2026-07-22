import { afterEach, describe, expect, it, vi } from "vitest";
import { PLAUSIBLE_GOAL_EVENTS, shouldSendToPlausible, track } from "./track";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("Starter Plausible event budget", () => {
  it("keeps the dashboard focused on meaningful outcomes", () => {
    expect(PLAUSIBLE_GOAL_EVENTS.has("search_pick")).toBe(true);
    expect(PLAUSIBLE_GOAL_EVENTS.has("ask_answer")).toBe(true);
    expect(PLAUSIBLE_GOAL_EVENTS.has("pulse_item_open")).toBe(true);
    expect(PLAUSIBLE_GOAL_EVENTS.has("map_ready")).toBe(false);
    expect(PLAUSIBLE_GOAL_EVENTS.has("moment_spotlight_view")).toBe(false);
  });

  it("counts a save only when something is added", () => {
    expect(shouldSendToPlausible("save_place", { on: true })).toBe(true);
    expect(shouldSendToPlausible("save_place", { on: false })).toBe(false);
    expect(shouldSendToPlausible("map_dock", { pick: "what" })).toBe(false);
  });

  it("queues a goal without relying on the retired domain variable", () => {
    const fakeWindow: { plausible?: { q?: string[][] } } = {};
    vi.stubGlobal("window", fakeWindow);
    vi.stubGlobal("localStorage", { getItem: () => null });
    vi.stubGlobal("document", { cookie: "" });
    vi.stubGlobal("navigator", { sendBeacon: () => true });

    track("search_pick");

    expect(fakeWindow.plausible?.q).toEqual([["search_pick"]]);
  });
});
