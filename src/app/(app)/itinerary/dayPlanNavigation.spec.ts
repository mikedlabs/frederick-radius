import { expect, it } from "vitest";
import { RADIUS_TOOLS, radiusJourneyForPath } from "@/data/radius-tools";
import { TOOL_DECK_GROUP_DEFINITIONS } from "@/components/nav/toolDeckModel";
import { search } from "@/lib/search";
it("finds Day Plan by its familiar names and keeps Saved selected", () => {
  const tool = RADIUS_TOOLS.find((item) => item.id === "day-plan");
  expect(tool).toMatchObject({ label: "Day Plan", href: "/itinerary" });
  expect(radiusJourneyForPath("/itinerary")).toBe("saved");
  expect(TOOL_DECK_GROUP_DEFINITIONS.find((group) => group.id === "yours")!.toolIds).toContain("day-plan");
  for (const query of ["day plan", "itinerary"]) {
    const pages = search(query, 20, [], { resultKind: "page", placePool: [] }).filter((hit) => hit.type === "page");
    expect(pages.some((hit) => hit.type === "page" && hit.page.href === "/itinerary")).toBe(true);
    expect(pages.some((hit) => hit.type === "page" && hit.page.href === "/plan")).toBe(false);
  }
});
