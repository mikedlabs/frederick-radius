import { describe, expect, it } from "vitest";
import { parseAskIntent } from "./intent";

describe("parseAskIntent", () => {
  it("turns a natural date-night request into plan inputs", () => {
    expect(parseAskIntent("Plan a walkable 3 hour date night downtown")).toMatchObject({
      kind: "plan",
      audience: "date",
      vibe: "food",
      durationHours: 3,
      travelMode: "walk",
      timeNeed: null,
      constraints: ["Walking", "Date", "3 hours"],
    });
  });

  it("keeps a nearby breakfast question as a place job", () => {
    expect(parseAskIntent("Where can I get a breakfast sandwich near me right now?")).toMatchObject({
      kind: "place",
      label: "Breakfast sandwich",
      timeNeed: "now",
    });
  });

  it("recognizes current events without treating them as a generic exploration", () => {
    expect(parseAskIntent("What live music is happening tonight?")).toMatchObject({
      kind: "event",
      timeNeed: "tonight",
      label: "What is on tonight",
    });
  });

  it("captures practical filters without a model call", () => {
    expect(parseAskIntent("Surprise me with something free, local only, with the kids")).toMatchObject({
      kind: "explore",
      audience: "family",
      budget: "free",
      localOnly: true,
      surpriseMe: true,
      constraints: ["Family", "Free", "Local only", "Surprise me"],
    });
  });

  it("schedules an afternoon plan as an afternoon, not whenever the request runs", () => {
    expect(parseAskIntent("Plan an easy 3 hour afternoon")).toMatchObject({
      kind: "plan",
      timeNeed: "afternoon",
      constraints: ["Afternoon", "3 hours"],
    });
  });

  it("understands county regions and dining context in a conversational request", () => {
    const query = "I've eaten downtown and central Frederick. Curious if there are good spots in the northern or western part of the county?";
    expect(parseAskIntent(query)).toMatchObject({
      kind: "place",
      vibe: "food",
      regions: ["north", "west"],
    });
  });

  it("separates a reservation handoff and requested time from the food intent", () => {
    expect(parseAskIntent("i want a steak dinner tonight use open table to make a rev for 7:30pm tonight")).toMatchObject({
      kind: "place",
      label: "Steak dinner",
      timeNeed: "tonight",
      reservation: true,
      requestedTime: "7:30 PM",
      constraints: ["Tonight", "Reservation", "7:30 PM"],
    });
  });

  it("does not turn less-walking language into a walking plan", () => {
    expect(parseAskIntent("Plan an evening with easy parking and less walking for my parents")).toMatchObject({
      kind: "plan",
      audience: "visitor",
      travelMode: "drive",
      timeNeed: null,
    });
  });

  it("pins a plan only when the user explicitly says this evening", () => {
    expect(parseAskIntent("Plan a date for this evening")).toMatchObject({
      kind: "plan",
      audience: "date",
      timeNeed: "tonight",
    });
  });
});
