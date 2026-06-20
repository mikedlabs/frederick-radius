import { describe, it, expect } from "vitest";
import { fcvfraRows, fcvfraMapRow, fcvfraMapListing, fcvfraMunicipality, cleanFcvfraTitle } from "./fcvfra";

// A monday, so the Wed-24 bingo's next occurrence is 06/24.
const NOW = new Date("2026-06-22T16:00:00Z");

// Mimics the real FCVFRA listing: each row is an eventView.cfm?Event_ID link
// followed by name, optional address, and a MM/DD/YYYY - MM/DD/YYYY range.
const LISTING = `
<table>
<tr><td><a href="eventView.cfm?Event_ID=50">Vigilant Hose Co WEDNESDAY BINGO</a></td><td>06/24/2026 - 12/16/2026</td><td>All Day</td></tr>
<tr><td><a href="eventView.cfm?Event_ID=382">Rocky Ridge Vol. Fire Co. MONTHLY BINGO</a></td><td>07/11/2026 - 12/12/2026</td><td>All Day</td></tr>
<tr><td><a href="eventView.cfm?Event_ID=534">Carroll Manor Fire Company 2026 CALENDER OF EVENTS</a></td><td>06/20/2026 - 12/12/2026</td><td>All Day</td></tr>
<tr><td><a href="eventView.cfm?Event_ID=71">United Fire Company ONLINE RAFFLE STORE</a></td><td>06/20/2026 - 12/31/2026</td><td>All Day</td></tr>
<tr><td><a href="eventView.cfm?Event_ID=600">Brunswick Vol. Fire Co. Summer Carnival</a></td><td>07/10/2026 - 07/12/2026</td><td>All Day</td></tr>
</table>`;

describe("fcvfraRows — parse the inline listing", () => {
  it("pulls id, name, and date range, stripping the link leftover", () => {
    const rows = fcvfraRows(LISTING);
    expect(rows.length).toBe(5);
    const r = rows.find((x) => x.id === "50")!;
    expect(r.name).toBe("Vigilant Hose Co WEDNESDAY BINGO");
    expect(r.rangeStart.getUTCMonth()).toBe(5); // June
    expect(r.rangeEnd.getUTCMonth()).toBe(11); // December
  });
});

describe("fcvfraMapRow — recurrence resolution + honesty skips", () => {
  const map = Object.fromEntries(fcvfraRows(LISTING).map((r) => [r.id, fcvfraMapRow(r, NOW)]));

  it("emits the NEXT weekly occurrence of a recurring bingo", () => {
    const m = map["50"];
    expect(m).not.toBeNull();
    expect(m!.event.startsAtUtc.slice(0, 10)).toBe("2026-06-24"); // next Wednesday
    expect(m!.event.uid).toBe("50");
    expect(m!.event.allDay).toBe(true);
    expect(m!.event.sourceUrl).toContain("Event_ID=50");
  });

  it("SKIPS the free-text year rollup (would fabricate dates)", () => {
    expect(map["534"]).toBeNull();
  });

  it("SKIPS a long-span non-recurring listing (ongoing raffle store)", () => {
    expect(map["71"]).toBeNull();
  });

  it("emits a short-range single event (carnival) at its start", () => {
    const m = map["600"];
    expect(m).not.toBeNull();
    expect(m!.event.startsAtUtc.slice(0, 10)).toBe("2026-07-10");
    expect(m!.municipality).toBe("brunswick");
  });

  it("resolves a monthly series within its season", () => {
    const m = map["382"];
    expect(m).not.toBeNull();
    expect(new Date(m!.event.startsAtUtc).getTime()).toBeGreaterThanOrEqual(NOW.getTime());
  });
});

describe("fcvfraMunicipality — gap-town mapping", () => {
  it("maps fire-town names to a valid municipality slug", () => {
    expect(fcvfraMunicipality("Brunswick Vol. Fire Co. Carnival")).toBe("brunswick");
    expect(fcvfraMunicipality("Rocky Ridge Vol. Fire Co. Bingo")).toBe("thurmont");
    expect(fcvfraMunicipality("Walkersville Carnival")).toBe("walkersville");
    expect(fcvfraMunicipality("Vigilant Hose Co Bingo")).toBe("frederick"); // no town in name -> seat fallback
  });
});

describe("cleanFcvfraTitle — recover the event name from the crammed listing string", () => {
  it("drops the venue + address tail and unshouts the caps", () => {
    expect(cleanFcvfraTitle("Vigilant Hose Co WEDNESDAY BINGO Vigilant Hose Co Activities Bldg. 17701 Creamery Road Emmitsburg")).toBe(
      "Vigilant Hose Co Wednesday Bingo",
    );
    expect(cleanFcvfraTitle("Guardian Hose Company THURMONT FIREMENS CARNIVAL Thurmont Carnival Grounds 123 E. Main St. Thurmont")).toBe(
      "Guardian Hose Company Thurmont Firemens Carnival",
    );
  });

  it("keeps a trailing parenthetical cadence note", () => {
    expect(
      cleanFcvfraTitle("Rocky Ridge Vol. Fire Co. MONTHLY BINGO (2nd Saturday of each month) Rocky Ridge Vol. Fire Co. 13516 Motters Station Road, Rocky Ridge MD 21778"),
    ).toBe("Rocky Ridge Vol. Fire Co. Monthly Bingo (2nd Saturday of each month)");
  });
});

describe("fcvfraMapListing — end to end", () => {
  it("keeps only the resolvable upcoming events", () => {
    const out = fcvfraMapListing(LISTING, NOW);
    // 50 (bingo), 382 (monthly), 600 (carnival) resolve; 534 + 71 skip.
    expect(out.length).toBe(3);
    expect(out.every((m) => Date.parse(m.event.startsAtUtc) >= NOW.getTime() - 86400000)).toBe(true);
  });
});
