import { describe, expect, it } from "vitest";
import { FREDERICK_CENTER } from "@/lib/geo";
import { buildPlan, decodeSpec } from "@/lib/integrations/planner";

describe("buildPlan", () => {
  it("keeps a food date night out of daytime errand categories", () => {
    const plan = buildPlan({
      audience: "date",
      vibe: "food",
      duration_hours: 3,
      start_at: "2026-07-16T22:00:00.000Z",
      start_near: FREDERICK_CENTER,
      max_distance_m: 2_400,
    });

    expect(plan.stops.length).toBeGreaterThanOrEqual(2);
    expect(plan.stops.map((stop) => stop.place?.category).filter(Boolean)).not.toContain("market");
    expect(plan.stops.map((stop) => stop.place?.category).filter(Boolean)).not.toContain("coffee");
    expect(plan.stops.map((stop) => stop.place?.category).filter(Boolean)).not.toContain("bakery");
  });

  it("keeps every stop inside a deliberately selected town", () => {
    const plan = buildPlan({
      audience: "family",
      vibe: "easy",
      duration_hours: 3,
      start_at: "2026-07-17T14:00:00.000Z",
      start_near: { lng: -77.3523, lat: 39.3276 },
      municipality: "urbana",
    });

    expect(plan.stops.length).toBeGreaterThan(0);
    expect(
      plan.stops.every(
        (stop) =>
          stop.place?.municipality === "urbana" ||
          stop.event?.municipality === "urbana",
      ),
    ).toBe(true);
  });

  it("validates each stop at its scheduled time and stays inside the time budget", () => {
    const start = new Date("2026-07-17T22:00:00.000Z");
    const plan = buildPlan({
      audience: "date",
      vibe: "food",
      duration_hours: 4,
      start_at: start.toISOString(),
      municipality: "frederick",
    });

    expect(plan.stops.length).toBeGreaterThan(0);
    expect(plan.stops.every((stop) => stop.open === "open")).toBe(true);
    expect(plan.stops.map((stop) => stop.place?.category)).not.toContain("shopping");
    expect(plan.stops.map((stop) => stop.place?.category)).not.toContain("playground");

    const last = plan.stops[plan.stops.length - 1];
    const end = new Date(last.at).getTime() + last.duration_min * 60_000;
    expect(end - start.getTime()).toBeLessThanOrEqual(4 * 60 * 60_000);
  });

  it("freezes the start time but removes exact coordinates from share links", () => {
    const plan = buildPlan({
      audience: "solo",
      vibe: "easy",
      duration_hours: 2,
      start_near: { lng: -77.412345, lat: 39.412345 },
    });
    const shared = decodeSpec(plan.share);

    expect(shared?.i.start_at).toBeTruthy();
    expect(shared?.i.start_near).toBeUndefined();
  });

  it("rejects malformed shared plans instead of passing them to reconstruction", () => {
    const token = Buffer.from(JSON.stringify({ v: 1, s: [{ p: "missing-inputs" }] }))
      .toString("base64url");
    expect(decodeSpec(token)).toBeNull();
  });
});
