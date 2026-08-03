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

  it("keeps a numbered date-night restaurant list out of the itinerary builder", () => {
    expect(parseAskIntent("three date-night restaurants downtown")).toMatchObject({
      kind: "place",
      audience: "date",
      vibe: "food",
    });
  });

  it("keeps a nearby breakfast question as a place job", () => {
    expect(parseAskIntent("Where can I get a breakfast sandwich near me right now?")).toMatchObject({
      kind: "place",
      label: "Breakfast sandwich",
      timeNeed: "now",
    });
  });

  it("recognizes bike rentals and generic local place-seeking language", () => {
    expect(parseAskIntent("Where can I rent a bicycle?")).toMatchObject({
      kind: "place",
      vibe: "active",
    });
    expect(parseAskIntent("Where can I get a kayak?")).toMatchObject({
      kind: "place",
    });
  });

  it.each([
    ["What is the closest pharmacy open now?", "Pharmacies"],
    ["Where is the nearest gas station?", "Gas stations"],
    ["Where is the nearest ATM?", "ATMs"],
  ])(
    "recognizes a strict daily-utility request as place discovery: %s",
    (query, label) => {
      expect(parseAskIntent(query)).toMatchObject({
        kind: "place",
        label,
      });
    },
  );

  it("does not turn civic or general information requests into place discovery", () => {
    expect(parseAskIntent("Where can I get a building permit?")).toMatchObject({
      kind: "civic",
    });
    expect(parseAskIntent("Where can I find county budget data?")).toMatchObject({
      kind: "explore",
    });
    expect(parseAskIntent("Where can I find public records?")).toMatchObject({
      kind: "civic",
    });
    expect(parseAskIntent("Where is the best food court?")).toMatchObject({
      kind: "place",
    });
  });

  it("recognizes current events without treating them as a generic exploration", () => {
    expect(parseAskIntent("What live music is happening tonight?")).toMatchObject({
      kind: "event",
      timeNeed: "tonight",
      label: "What is on tonight",
    });
  });

  it("routes a dated fun request to the calendar even when it omits the word event", () => {
    expect(parseAskIntent("Anything fun tomorrow night?")).toMatchObject({
      kind: "event",
      timeNeed: "tomorrow",
      label: "Current events",
    });
  });

  it("recognizes a weekday activity request without requiring the word event", () => {
    const now = new Date("2026-07-22T16:00:00.000Z");
    expect(parseAskIntent("What should we do Friday night?", now)).toMatchObject({
      kind: "event",
      requestedDate: "2026-07-24",
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

  it("keeps ice cream and a requested after-time on the place path", () => {
    const now = new Date("2026-08-03T16:00:00.000Z");
    expect(
      parseAskIntent(
        "where can I take my kids for ice cream after 8pm tonight",
        now,
      ),
    ).toMatchObject({
      kind: "place",
      label: "Ice cream",
      audience: "family",
      timeNeed: "tonight",
      requestedTime: "8:00 PM",
      requestedDate: "2026-08-03",
      requestedDateTime: "2026-08-04T00:00:00.000Z",
    });
  });

  it("turns past midnight tonight into a next-day place boundary", () => {
    const now = new Date("2026-08-03T16:00:00.000Z");
    expect(
      parseAskIntent("what is open past midnight tonight", now),
    ).toMatchObject({
      kind: "place",
      timeNeed: "tonight",
      requestedTime: "12:00 AM",
      requestedDate: "2026-08-04",
      requestedDateTime: "2026-08-04T04:00:00.000Z",
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
