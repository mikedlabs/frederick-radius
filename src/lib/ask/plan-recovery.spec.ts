import { describe, expect, it } from "vitest";
import type { PlaceCardData } from "@/lib/loaders/places";
import { parseAskIntent } from "./intent";
import { askPlanContext, buildAskPlanRecovery } from "./plan-recovery";

const query = "I have two hours in Brunswick this afternoon. What can I do?";
const intent = parseAskIntent(query, new Date("2026-09-06T18:00:00Z"));
const context = askPlanContext(query, { municipality: "frederick", contextLabel: "Frederick City" });
function place(slug: string, category: string, patch: Partial<PlaceCardData> = {}): PlaceCardData {
  return {
    slug, name: slug, category, municipality: "brunswick", feature_score: 7,
    open_status: { state: "unknown" }, phone: "3015550100", hours_verified: false,
    ...patch,
  } as PlaceCardData;
}
const places = [place("park", "park"), place("cafe", "coffee"), place("downtown", "coffee", { municipality: "frederick", feature_score: 10 })];

describe("a timed plan with missing hours", () => {
  it("keeps the named town, two hours and afternoon without an invented schedule", () => {
    const result = buildAskPlanRecovery(intent, context, places);
    expect(context.municipality).toBe("brunswick");
    expect(result.answer).toContain("2-hour plan in Brunswick this afternoon");
    expect(result.answer).toContain("does not have current verified hours");
    expect(result.sources).toHaveLength(2);
    expect(result.sources.every((source) => source.status === "Visit time unconfirmed" && source.phone)).toBe(true);
    expect(result.sources.some((source) => source.slug === "downtown")).toBe(false);
    expect(result.actions).toEqual([
      { label: "Check Brunswick places", kind: "open", href: "/m/brunswick" },
      { label: "See Brunswick on the map", kind: "open", href: "/map?in=brunswick" },
    ]);
  });

  it.each([
    { budget: "free" as const },
    { dietary: ["vegan" as const] },
    { travelMode: "walk" as const },
  ])("does not relax an additional hard constraint in its suggested places: %s", (constraint) => {
    expect(buildAskPlanRecovery({ ...intent, ...constraint }, context, places).sources).toEqual([]);
  });

  it("does not infer access or family suitability", () => {
    expect(buildAskPlanRecovery(intent, context, places, { accessibility: ["wheelchair"] }).sources).toEqual([]);
    expect(buildAskPlanRecovery({ ...intent, audience: "family" }, context, places).sources).toEqual([]);
  });

  it("does not mistake zero places for missing-hours coverage", () => {
    const result = buildAskPlanRecovery(intent, context, []);
    expect(result.answer).not.toContain("does not have current verified hours");
    expect(result.sources).toEqual([]);
  });
});
