import { describe, it, expect } from "vitest";
import { classifyEvent } from "@/lib/events/classify";
import { feedCategory } from "@/lib/integrations/ical-live";

const feed = (o: Record<string, unknown>) =>
  o as unknown as Parameters<typeof feedCategory>[0];

const county = feed({ source: "county", default_category: "civic" });

/**
 * County RSS still skips the generic keyword matcher (P0-5). Title-only
 * rules assign a real category; public bodies go to civic so the existing
 * meetings lane can hide them from Today and the default /events list.
 */
describe("feedCategory", () => {
  it("falls back to community for ordinary county titles", () => {
    expect(feedCategory(county, "Earth, Wheels, & Fire 54th Anniversary", "")).toBe(
      "community",
    );
    expect(feedCategory(county, "FSK Post 11 Memorial Day Observation", "")).toBe(
      "community",
    );
    expect(feedCategory(county, "Trivia with a Twist", "")).toBe("community");
    expect(feedCategory(county, "Weis Market Nutrition Talks", "")).toBe("community");
    expect(feedCategory(county, "Pickleball @ Emmitsburg", "")).toBe("community");
    expect(feedCategory(county, "Chair Yoga @ Urbana", "")).toBe("community");
    expect(
      feedCategory(county, "Mt. Zion AME Church 130th Anniversary Celebration Worship Service", ""),
    ).toBe("community");
  });

  it("never reads a county description that lists council members as civic", () => {
    const title = "Mt. Zion AME Church 130th Anniversary Celebration Worship Service";
    const description = "Council Member Jerry Donald will attend.";
    expect(feedCategory(county, title, description)).toBe("community");
    expect(classifyEvent({ title, category: feedCategory(county, title, description) })).toBe(
      "public",
    );
  });

  it("maps a Gaver Farm title or venue to farms / pick-your-own", () => {
    expect(feedCategory(county, "Gaver Farm-Fall Festival", "")).toBe("agritourism");
    expect(feedCategory(county, "Fall Festival", "", "Gaver Farm")).toBe("agritourism");
  });

  it("maps theater or theatre in the title to theaters", () => {
    expect(feedCategory(county, "Live Theatre Production", "")).toBe("theater");
    expect(feedCategory(county, "ESP Theater performs: The Canterville Ghost", "")).toBe(
      "theater",
    );
  });

  it("maps park walk, hike, or trail in the title to parks & trails", () => {
    expect(feedCategory(county, "Urbana District Park Walk", "")).toBe("outdoors");
    expect(feedCategory(county, "Catoctin Morning Hike", "")).toBe("outdoors");
    expect(feedCategory(county, "Cunningham Falls Trail Day", "")).toBe("outdoors");
  });

  it("lanes county public-body titles as civic meetings", () => {
    for (const title of [
      "Police Accountability Board (Webstream on FCG TV 2 Only)",
      "Agriculture Business Council",
      "Local Management Board",
      "Planning Commission Meeting",
    ]) {
      expect(feedCategory(county, title, "Council Member will speak."), title).toBe("civic");
      expect(classifyEvent({ title, category: feedCategory(county, title, "") }), title).toBe(
        "civic_meeting",
      );
    }
  });

  it("does not treat board games or senior-center classes as meetings", () => {
    for (const title of ["Board Game Afternoon", "Board Games", "Chair Yoga @ Urbana"]) {
      expect(feedCategory(county, title, "")).toBe("community");
      expect(classifyEvent({ title, category: "community" }), title).toBe("public");
    }
  });

  it("keeps keyword inference for non-county feeds", () => {
    const celebrate = feed({ source: "celebrate", default_category: "arts" });
    expect(feedCategory(celebrate, "Live music concert with a band", "")).not.toBe("");
    expect(feedCategory(celebrate, "An unremarkable listing", "")).toBe("arts");
  });
});
