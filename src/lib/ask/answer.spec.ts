import { describe, expect, it, vi } from "vitest";
import { askFrederick } from "./answer";

const downtown = {
  origin: { lng: -77.4105, lat: 39.4143 },
  municipality: "frederick",
  contextLabel: "your location",
} as const;

describe("askFrederick structured answers", () => {
  it("returns evidence and proximity for a local place answer", async () => {
    const result = await askFrederick("Where can I get a breakfast sandwich?", downtown);
    expect(result.status).toBe("matches");
    expect(result.intent).toMatchObject({ kind: "place", label: "Breakfast sandwich" });
    expect(result.sources[0]).toMatchObject({
      slug: "beans-bagels-frederick",
      confidence: "high",
    });
    expect(result.sources[0].reason).toContain("breakfast sandwich");
    expect(result.sources[0].distance).toBeTruthy();
    expect(result.sources[0].status).toBeTruthy();
    expect(result.sources[0].phone).toBe("(301) 620-2165");
    expect(result.actions?.some((action) => action.label === "Make it a plan")).toBe(true);
  });

  it("takes closest literally when the user asks for the closest grocery store", async () => {
    const result = await askFrederick("What grocery store is closest to me?", downtown);
    expect(result.sources[0]?.name).toBe("Costco Wholesale");
    expect(result.answer).toContain("closest verified");
  });

  it("puts the official voter-registration action first", async () => {
    const result = await askFrederick("How do I register to vote in Frederick County?", downtown);
    expect(result.sources[0]).toMatchObject({
      slug: "register-vote",
      name: "Frederick County · Voter registration",
      category: "civic",
      href: "https://frederickcountymd.gov/1648/Voter-Registration---RegisterMake-Change",
      confidence: "high",
    });
    expect(result.answer).toContain("official Frederick resource");
    expect(result.sources).toHaveLength(1);
  });

  it("keeps City of Frederick trash information out of the county flow", async () => {
    const result = await askFrederick("When is trash pickup?", downtown);
    expect(result.sources[0]).toMatchObject({
      name: "City of Frederick · Trash & recycling",
      href: "https://www.cityoffrederickmd.gov/220/Refuse-Recycling",
    });
  });

  it("routes a downtown pothole to City public works", async () => {
    const result = await askFrederick("Who handles a pothole?", downtown);
    expect(result.sources[0]).toMatchObject({
      slug: "dept-city-public-works",
      name: "City of Frederick · Public Works (DPW)",
      phone: "301-600-1440",
    });
    expect(result.sources.some((source) => source.href.includes("frederickcountymd.gov/8235"))).toBe(false);
    expect(result.sources).toHaveLength(1);
  });

  it("uses a town's municipal record instead of a county substitute", async () => {
    const result = await askFrederick("Who handles trash in Brunswick?", {
      municipality: "brunswick",
      contextLabel: "Brunswick",
    });
    expect(result.sources[0]).toMatchObject({
      name: "Brunswick · Town Hall",
      href: "https://brunswickmd.gov/publicworks",
      phone: "301-834-7500",
    });
    expect(result.answer).toContain("instead of guessing");
  });

  it("answers the countywide dining question with balanced north and west picks", async () => {
    const query = "I've eaten pretty much all of DTF, central and eastern Frederick. But you don't hear about the other parts of the county. Curious if there are good spots in the northern or western portion of the county?";
    const result = await askFrederick(query, downtown);
    expect(result.usedModel).toBe(false);
    expect(result.sources).toHaveLength(4);
    expect(result.sources.map((source) => source.region)).toEqual(["north", "west", "north", "west"]);
    expect(result.sources.every((source) => source.category !== "civic" && source.city?.toLowerCase() !== "frederick")).toBe(true);
    expect(result.answer).toContain("North:");
    expect(result.answer).toContain("West:");
    expect(result.answer).not.toContain("food license");
    expect(result.context).toBe("North + West Frederick County");
  });

  it("turns a natural request into an editable grounded itinerary", async () => {
    const result = await askFrederick("Plan a walkable 3 hour date night, local only", downtown);
    expect(result.status).toBe("matches");
    expect(result.usedModel).toBe(false);
    expect(result.intent).toMatchObject({
      kind: "plan",
      audience: "date",
      travelMode: "walk",
      localOnly: true,
    });
    expect(result.plan?.href).toMatch(/^\/plan\?p=/);
    expect(result.plan?.stops.length).toBeGreaterThanOrEqual(2);
    expect(result.plan?.stops.every((stop) => stop.href.startsWith("/"))).toBe(true);
    expect(result.plan?.stops.every((stop) => stop.status !== "Hours unconfirmed")).toBe(true);
  });

  it("builds a lower-walking parent plan without unconfirmed stops", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-17T14:00:00.000Z"));
    try {
      const result = await askFrederick(
        "Plan an evening with easy parking and less walking for my parents",
        downtown,
      );
      expect(result.usedModel).toBe(false);
      expect(result.intent).toMatchObject({ audience: "visitor", travelMode: "drive" });
      expect(result.answer).toContain("two stops");
      expect(result.answer).not.toContain("walkable");
      expect(result.plan?.stops).toHaveLength(2);
      expect(result.plan?.stops[0]?.time).toBe("6:00 PM");
      expect(result.plan?.stops.every((stop) => stop.status !== "Hours unconfirmed")).toBe(true);
      expect(result.plan?.stops.some((stop) => Boolean(stop.tip))).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it("answers physical amenity questions from the amenity layer, never civic search noise", async () => {
    const result = await askFrederick(
      "Where can I find a public trash can or drinking water downtown?",
      downtown,
    );
    expect(result.usedModel).toBe(false);
    expect(result.intelligence?.tools).toEqual(["amenities"]);
    expect(result.sources.every((source) => ["trash", "water"].includes(source.category))).toBe(true);
    expect(result.sources.some((source) => source.category === "trash")).toBe(true);
    expect(result.sources.some((source) => source.category === "water")).toBe(true);
    expect(result.sources.every((source) => source.href.startsWith("/map?amenity="))).toBe(true);
    expect(result.sources.some((source) => /bus|connector/i.test(source.name))).toBe(false);
    expect(result.actions?.some((action) => action.href === "/map?amenity=trash")).toBe(true);
  });

  it("finds a public bike-repair station without treating a bike shop as the answer", async () => {
    const result = await askFrederick("Where is the nearest bike repair station?", downtown);
    expect(result.intelligence?.tools).toEqual(["amenities"]);
    expect(result.sources.length).toBeGreaterThan(0);
    expect(result.sources.every((source) => source.category === "bike-repair")).toBe(true);
    expect(result.sources.every((source) => source.href.startsWith("/map?amenity=bike"))).toBe(true);
  });

  it("uses venue-verified schedules for brunch instead of generic restaurant hours", async () => {
    const result = await askFrederick("Who has verified brunch this weekend near me?", downtown);
    expect(result.intelligence?.tools).toEqual(["brunch"]);
    expect(result.sources.length).toBeGreaterThan(0);
    expect(result.sources.every((source) => source.eyebrow === "Verified brunch schedule")).toBe(true);
    expect(result.sources.every((source) => /sat|sun|daily/i.test(source.status ?? ""))).toBe(true);
  });

  it("joins a destination to the nearest city garages", async () => {
    const result = await askFrederick("Where should I park for the Weinberg Center?", downtown);
    expect(result.intelligence?.tools).toContain("parking");
    expect(result.sources[0]).toMatchObject({
      name: "Court Street Garage",
      category: "parking",
      confidence: "high",
    });
    expect(result.answer).toContain("walking distance, not live space availability");
    expect(result.sources.every((source) => source.category === "parking")).toBe(true);
  });

  it("treats parking near me as location context, not a place named me", async () => {
    const result = await askFrederick("Where can I park near me?", downtown);
    expect(result.intelligence?.tools).toContain("parking");
    expect(result.sources[0]?.category).toBe("parking");
    expect(result.answer).not.toContain("identify");
  });

  it("is honest about roaming food trucks and links to current sources", async () => {
    const result = await askFrederick("Where are the food trucks today?", downtown);
    expect(result.intelligence?.tools).toEqual(["food-trucks"]);
    expect(result.answer).toContain("does not have live truck locations yet");
    expect(result.sources.length).toBeGreaterThan(0);
    expect(result.sources.every((source) => source.category === "food-truck")).toBe(true);
    expect(result.sources.some((source) => /usually at/i.test(source.eyebrow ?? ""))).toBe(true);
  });

  it("uses the postal layer for the nearest blue mailbox", async () => {
    const result = await askFrederick("Where is the nearest blue USPS mailbox?", downtown);
    expect(result.usedModel).toBe(false);
    expect(result.intelligence?.tools).toEqual(["shipping"]);
    expect(result.sources[0]).toMatchObject({
      name: "USPS mailbox",
      category: "mailbox",
    });
    expect(result.sources[0]?.href).toMatch(/^https:\/\/www\.google\.com\/maps\/dir/);
    expect(result.sources[0]?.distance).toBeTruthy();
    expect(result.sources.every((source) => source.slug.startsWith("shipping-mailbox-"))).toBe(true);
    expect(result.answer).toContain("USPS collection boxes");
    expect(result.answer).not.toMatch(/USPS USPS|boxs/);
  });

  it("keeps a FedEx package request on FedEx counters", async () => {
    const result = await askFrederick("Where can I drop off a FedEx package?", downtown);
    expect(result.intelligence?.tools).toEqual(["shipping"]);
    expect(result.sources.length).toBeGreaterThan(0);
    expect(result.sources.every((source) => /fedex/i.test(`${source.name} ${source.eyebrow}`))).toBe(true);
    expect(result.sources.some((source) => /property zoning|family support/i.test(source.name))).toBe(false);
  });

  it("keeps live-music source cards limited to actual calendar events", async () => {
    const result = await askFrederick("What live music is happening tonight?", downtown);
    expect(result.sources.every((source) => source.href.startsWith("/events/"))).toBe(true);
    expect(result.sources.every((source) => source.category === "music")).toBe(true);
    expect(result.sources.some((source) => /yoga|meeting|playground/i.test(source.name))).toBe(false);
  });

  it("can anchor a plan on a real place named in the request", async () => {
    const result = await askFrederick("Plan a date night around Hootch & Banter", downtown);
    expect(result.intent).toMatchObject({ timeNeed: null });
    expect(result.answer).toContain("anchored this at Hootch & Banter");
    expect(result.plan?.stops[0].name).toBe("Hootch & Banter");
  });

  it("keeps reservation answers honest and excludes unrelated source cards", async () => {
    const result = await askFrederick(
      "i want a steak dinner tonight use open table to make a rev for 7:30pm tonight",
      downtown,
    );

    expect(result.usedModel).toBe(false);
    expect(result.intent).toMatchObject({
      kind: "place",
      reservation: true,
      requestedTime: "7:30 PM",
    });
    expect(result.answer).toContain("can’t see live OpenTable inventory");
    expect(result.answer).toContain("7:30 PM");
    expect(result.sources.map((source) => source.slug)).toEqual(["averys-maryland-grille-frederick"]);
    expect(result.sources.every((source) => source.category === "restaurant")).toBe(true);
    expect(result.actions?.[0]).toMatchObject({
      label: "Check OpenTable for 7:30 PM",
      kind: "open",
    });
    expect(result.actions?.[0]?.href).toMatch(/^https:\/\/www\.opentable\.com\/s\?/);
    expect(result.actions?.map((action) => action.label)).toEqual([
      "Check OpenTable for 7:30 PM",
      "Closest matches",
      "Make it a dinner plan",
    ]);
  });
});
