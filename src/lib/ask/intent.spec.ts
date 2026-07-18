import { describe, expect, it } from "vitest";
import { parseAskIntent, parseFixedAppointmentAnchor } from "./intent";

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

  it("recognizes a hyphenated date-night comparison as planning", () => {
    expect(
      parseAskIntent(
        "Compare two date-night options near downtown for tomorrow, including dinner timing, parking, and live music",
      ),
    ).toMatchObject({
      kind: "plan",
      audience: "date",
      durationHours: 3,
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
      constraints: ["Family", "Free", "Independent spots", "Surprise me"],
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

  it("captures an explicit weekday and common dinner time", () => {
    const now = new Date("2026-07-18T18:00:00.000Z");
    expect(parseAskIntent("Plan a date night Monday at 7", now)).toMatchObject({
      kind: "plan",
      requestedDate: "2026-07-20",
      requestedTime: "7:00 PM",
      requestedDateTime: "2026-07-20T23:00:00.000Z",
    });
  });

  it("treats gluten-free as dietary language, not a zero-dollar budget", () => {
    expect(parseAskIntent("Find a gluten-free dinner")).toMatchObject({
      kind: "place",
      budget: null,
      dietary: ["gluten-free"],
    });
  });

  it("recognizes dinner and a show as a multi-stop plan", () => {
    expect(parseAskIntent("Dinner and a show Saturday night")).toMatchObject({
      kind: "plan",
      audience: "solo",
    });
  });

  it("treats a timed show as a fixed anchor for dinner discovery", () => {
    const now = new Date("2026-07-18T05:00:00.000Z");
    const query = "I need a quiet dinner downtown before a 7:30 show tonight";
    expect(parseAskIntent(query, now)).toMatchObject({
      kind: "place",
      label: "Dinner",
      timeNeed: "tonight",
      vibe: "food",
    });
    expect(parseFixedAppointmentAnchor(query, now)).toEqual({
      relation: "before",
      kind: "show",
      timeLabel: "7:30 PM",
      dateTime: "2026-07-18T23:30:00.000Z",
    });
  });

  it.each(["concert", "performance", "event", "movie", "play"])(
    "treats a known %s as an appointment rather than event discovery",
    (kind) => {
      expect(parseAskIntent(`Find dinner downtown before a 7:30 ${kind} tonight`)).toMatchObject({
        kind: "place",
        label: "Dinner",
      });
    },
  );

  it("keeps an actual concert-discovery question on the event path", () => {
    expect(parseAskIntent("What concerts are happening tonight?")).toMatchObject({
      kind: "event",
      timeNeed: "tonight",
    });
  });
});
