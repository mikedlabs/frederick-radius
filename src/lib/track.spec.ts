import { afterEach, describe, expect, it, vi } from "vitest";
import {
  PLAUSIBLE_GOAL_EVENTS,
  plausibleGoalName,
  shouldSendToPlausible,
  track,
} from "./track";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("Starter Plausible event budget", () => {
  it("keeps the dashboard focused on meaningful outcomes", () => {
    expect(PLAUSIBLE_GOAL_EVENTS.has("search_pick")).toBe(true);
    expect(PLAUSIBLE_GOAL_EVENTS.has("ask_answer")).toBe(true);
    expect(PLAUSIBLE_GOAL_EVENTS.has("pulse_item_open")).toBe(true);
    expect(PLAUSIBLE_GOAL_EVENTS.has("keep_radius_offer")).toBe(true);
    expect(PLAUSIBLE_GOAL_EVENTS.has("keep_radius_success")).toBe(true);
    expect(PLAUSIBLE_GOAL_EVENTS.has("pwa_launch")).toBe(true);
    expect(PLAUSIBLE_GOAL_EVENTS.has("decision_open")).toBe(true);
    expect(PLAUSIBLE_GOAL_EVENTS.has("decision_action")).toBe(true);
    expect(PLAUSIBLE_GOAL_EVENTS.has("decision_helpful")).toBe(true);
    expect(PLAUSIBLE_GOAL_EVENTS.has("decision_not_relevant")).toBe(true);
    expect(PLAUSIBLE_GOAL_EVENTS.has("decision_wrong")).toBe(true);
    expect(PLAUSIBLE_GOAL_EVENTS.has("decision_impression")).toBe(true);
    expect(PLAUSIBLE_GOAL_EVENTS.has("map_ready")).toBe(false);
    expect(PLAUSIBLE_GOAL_EVENTS.has("moment_spotlight_view")).toBe(false);
  });

  it("counts a save only when something is added", () => {
    expect(shouldSendToPlausible("save_place", { on: true })).toBe(true);
    expect(shouldSendToPlausible("save_place", { on: false })).toBe(false);
    expect(shouldSendToPlausible("map_dock", { pick: "what" })).toBe(false);
    expect(shouldSendToPlausible("decision_impression", { position: "lead" })).toBe(true);
    expect(shouldSendToPlausible("decision_impression", { position: "result" })).toBe(false);
    expect(
      shouldSendToPlausible("decision_impression", {
        surface: "map",
        position: "result",
      }),
    ).toBe(true);
  });

  it("names the three core journeys without sending categorical properties", () => {
    expect(
      plausibleGoalName(
        "decision_impression",
        { surface: "today", position: "lead", entity_id: "public-place" },
        "/today",
      ),
    ).toBe("today_answer_view");
    expect(
      plausibleGoalName(
        "decision_impression",
        { surface: "map", position: "result", entity_id: "public-place" },
        "/map",
      ),
    ).toBe("map_result_view");
    expect(
      plausibleGoalName(
        "decision_open",
        { surface: "events", position: "result", entity_id: "public-event" },
        "/events",
      ),
    ).toBe("events_detail_open");
    // Reused event cards elsewhere must not masquerade as an Events-board
    // journey merely because their entity kind is an event.
    expect(
      plausibleGoalName(
        "decision_open",
        { surface: "events", position: "result", entity_id: "public-event" },
        "/today",
      ),
    ).toBe("decision_open");
  });

  it("separates verified, reported, and non-install Return Bridge outcomes", () => {
    expect(
      plausibleGoalName("keep_radius_success", { method: "native" }, "/today"),
    ).toBe("install_complete");
    expect(
      plausibleGoalName("keep_radius_success", { method: "appinstalled" }, "/today"),
    ).toBe("install_complete");
    expect(
      plausibleGoalName(
        "keep_radius_success",
        { method: "manual_confirm" },
        "/today",
      ),
    ).toBe("install_reported_complete");
    expect(
      plausibleGoalName("keep_radius_success", { method: "copy" }, "/today"),
    ).toBe("keep_radius_success");
  });

  it("queues a goal without relying on the retired domain variable", () => {
    const fakeWindow: {
      plausible?: { q?: Array<[string, { interactive?: boolean }?]> };
    } = {};
    vi.stubGlobal("window", fakeWindow);
    vi.stubGlobal("localStorage", { getItem: () => null });
    vi.stubGlobal("document", { cookie: "" });
    vi.stubGlobal("navigator", { sendBeacon: () => true });

    track("search_pick");

    expect(fakeWindow.plausible?.q).toEqual([["search_pick", undefined]]);
  });

  it("queues only the stable journey name, never its source properties", () => {
    const fakeWindow: {
      plausible?: { q?: Array<[string, { interactive?: boolean }?]> };
    } = {};
    vi.stubGlobal("window", fakeWindow);
    vi.stubGlobal("location", { pathname: "/events" });
    vi.stubGlobal("localStorage", { getItem: () => null });
    vi.stubGlobal("document", { cookie: "" });
    vi.stubGlobal("navigator", { sendBeacon: () => true });

    track("decision_open", {
      surface: "events",
      entity_kind: "event",
      entity_id: "alive-at-five-2026",
      position: "result",
      action: "open",
    });

    expect(fakeWindow.plausible?.q).toEqual([["events_detail_open", undefined]]);
    expect(JSON.stringify(fakeWindow.plausible?.q)).not.toContain("alive-at-five");
  });

  it("keeps automatic answer and result exposures non-interactive", () => {
    const fakeWindow: {
      plausible?: { q?: Array<[string, { interactive?: boolean }?]> };
    } = {};
    vi.stubGlobal("window", fakeWindow);
    vi.stubGlobal("location", { pathname: "/today" });
    vi.stubGlobal("localStorage", { getItem: () => null });
    vi.stubGlobal("document", { cookie: "" });
    vi.stubGlobal("navigator", { sendBeacon: () => true });

    track("decision_impression", {
      surface: "today",
      entity_kind: "place",
      entity_id: "public-place",
      position: "lead",
    });

    expect(fakeWindow.plausible?.q).toEqual([
      ["today_answer_view", { interactive: false }],
    ]);
  });
});
