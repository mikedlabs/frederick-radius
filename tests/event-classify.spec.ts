import { describe, it, expect } from "vitest";
import { classifyEvent, isPublicEvent } from "@/lib/events/classify";

const lane = (title: string, extra: { status?: string; category?: string } = {}) =>
  classifyEvent({ title, ...extra });

describe("classifyEvent — public events stay public (the precision trap)", () => {
  it("keeps real events public, even with tricky substrings", () => {
    expect(lane("Asian American Center of Frederick-Asia on the Creek")).toBe("public");
    expect(lane("Asia On The Creek")).toBe("public");
    expect(lane("Frederick Arts Council-Sky Stage-Show")).toBe("public"); // "Council" ≠ a meeting
    expect(lane("New Market Vol Fire Co-First Due Festival")).toBe("public");
    expect(lane("Summer Concert Series | Frank Solivan & Dirty Kitchen (Bluegrass)")).toBe("public"); // "grass" ≠ yard waste
    expect(lane("Ribbon Cutting Ceremony celebrating the new Seed to Harvest Building")).toBe("public");
    expect(lane("Skateboard Demo at the Park")).toBe("public"); // "board" ≠ a board meeting
  });
});

describe("classifyEvent — non-public lanes", () => {
  it("civic meetings: boards, commissions, hearings, council sessions", () => {
    expect(lane("Senior Services Advisory Board")).toBe("civic_meeting");
    expect(lane("Fire & Rescue Advisory Board")).toBe("civic_meeting");
    expect(lane("Planning Commission")).toBe("civic_meeting");
    expect(lane("Council Legislative Meeting")).toBe("civic_meeting");
    expect(lane("Mayor and Board of Aldermen Public Hearing")).toBe("civic_meeting");
    expect(lane("Anything", { category: "civic" })).toBe("civic_meeting"); // category fallback
  });

  it("town reminders: trash, yard waste, curbside, closures", () => {
    expect(lane("Bulk Trash Pick Up")).toBe("town_reminder");
    expect(lane("Yard Waste Pickup")).toBe("town_reminder");
    expect(lane("Grass/Leaf Curbside Collection")).toBe("town_reminder");
    expect(lane("Recycling Collection Day")).toBe("town_reminder");
    expect(lane("Patrick Street Lane Closure")).toBe("town_reminder");
  });

  it("private rentals: weddings, corporate bookings", () => {
    expect(lane("Attaboy Barrel House-Wedding: Jessica & Dakota Ceremony & Reception")).toBe("private_rental");
    expect(lane("Attaboy Barrel House-Private Corp Event: Ganvir Law")).toBe("private_rental");
  });

  it("cancelled: by status or title", () => {
    expect(lane("Council Workshop", { status: "cancelled" })).toBe("cancelled");
    expect(lane("Joint City/Council Meeting CANCELLED")).toBe("cancelled");
  });
});

describe("isPublicEvent — only public leads What's on", () => {
  it("is true for public, false for every non-public lane", () => {
    expect(isPublicEvent({ title: "Asia On The Creek" })).toBe(true);
    expect(isPublicEvent({ title: "Planning Commission" })).toBe(false);
    expect(isPublicEvent({ title: "Bulk Trash Pick Up" })).toBe(false);
    expect(isPublicEvent({ title: "Wedding: A & B Reception" })).toBe(false);
    expect(isPublicEvent({ title: "X", status: "cancelled" })).toBe(false);
  });
});
