import { describe, it, expect } from "vitest";
import { parseIncidentLine, publicIncident, publicIncidents } from "./incidentFeed";

// Real lines from the FredScanner #incidents feed (2026-07-19/20).
const L = {
  service: "8:23 pm | SERVICE CALL | 100 BLOCK S MARKET ST, CARRIAGE HOUSE APTS | Radio: 9C | Units: E31 | Listen live at FrederickScanner.com",
  crash: "7:23 pm | VEHICLE ACCIDENT - BLS | 12200 BLOCK COPPERMINE RD | Radio: 9B | Units: A179, E172",
  crashNoRadio: "2:56 pm | VEHICLE ACCIDENT - BLS | FSK HIGHWAY / MIDDLEBURG RD | Units: E91 | Listen live at FrederickScanner.com",
  mutualAid: "4:29 pm | MUTUAL AID | 13100 BLOCK PRICES DISTILLERY RD | Radio: 7A4 | Units: K23",
  gasOutside: "4:26 pm | GAS LEAK OUTSIDE | 13100 BLOCK PRICES DISTILLERY RD | Radio: 7A4 | Units: A239",
  gasInside: "3:14 pm | GAS ODOR INSIDE | 1300 BLOCK HOPE FARM CT | Radio: 9C | Units: PE52",
  pedestrian: "1:38 pm | PEDESTRIAN STRUCK - ALS | 200 BLOCK SHOREBIRD ST | Radio: 9D | Units: A249",
  fireAlarm: "12:40 pm | COMMERCIAL FIRE ALARM | 5900 BLOCK QUINN ORCHARD RD, COUNTRY MEADOWS | Radio: 9C | Units: E331",
  wires: "1:55 am | WIRES DOWN OR ARCING | E B ST / NINTH AVE | Radio: 9C | Units: BR55",
  transformer: "2:57 pm | TRANSFORMER FIRE | 200 BLOCK N MARKET ST, BLOOM ASIAN HAUS | Radio: 9C | Units: BR35",
  odorInside: "4:56 pm | UNKNOWN ODOR INSIDE | 900 BLOCK WATERFORD DR, SUNRISE RETIREMENT | Radio: 9C | Units: E11",
  standby: "3:57 pm | FHH STANDBY FOR HELICOPTER LANDING | 400 BLOCK W SEVENTH ST, FHH | Radio: 9C | Units: K33",
  structureFire: "9:10 pm | WORKING STRUCTURE FIRE | 100 BLOCK E CHURCH ST | Radio: 9C | Units: E1, TW1",
  attachmentPrefix: "Attachment: 6:31 pm | VEHICLE ACCIDENT - BLS | 4200 BLOCK BILL MOXLEY RD | Radio: 9B | Units: A259",
};

describe("parseIncidentLine", () => {
  it("splits time / type / location and ignores Radio, Units, promo", () => {
    expect(parseIncidentLine(L.crash)).toEqual({
      time: "7:23 pm",
      type: "VEHICLE ACCIDENT - BLS",
      location: "12200 BLOCK COPPERMINE RD",
    });
  });
  it("handles a line with no Radio segment", () => {
    expect(parseIncidentLine(L.crashNoRadio)?.location).toBe("FSK HIGHWAY / MIDDLEBURG RD");
  });
  it("strips an IFTTT 'Attachment:' prefix", () => {
    expect(parseIncidentLine(L.attachmentPrefix)?.type).toBe("VEHICLE ACCIDENT - BLS");
  });
  it("rejects a non-dispatch string", () => {
    expect(parseIncidentLine("hopefully canada gets rain too")).toBeNull();
    expect(parseIncidentLine("")).toBeNull();
  });
});

describe("publicIncident — the privacy allowlist", () => {
  it("KEEPS public road/fire/hazard calls", () => {
    expect(publicIncident(L.crash)).toMatchObject({ kind: "Crash", roadImpact: true });
    expect(publicIncident(L.gasOutside)).toMatchObject({ kind: "Gas leak", roadImpact: true });
    expect(publicIncident(L.wires)).toMatchObject({ kind: "Wires down", roadImpact: true });
    expect(publicIncident(L.transformer)).toMatchObject({ kind: "Wires down" });
    expect(publicIncident(L.structureFire)).toMatchObject({ kind: "Structure fire", roadImpact: false });
  });

  it("DROPS everything medical, personal, or noisy", () => {
    // These must never reach a user — homes, a retirement facility, a person
    // struck, false-heavy alarms, and non-incident chatter.
    for (const line of [L.service, L.mutualAid, L.gasInside, L.pedestrian, L.fireAlarm, L.odorInside, L.standby]) {
      expect(publicIncident(line), line).toBeNull();
    }
  });

  it("title-cases the block-level location, no unit/radio codes", () => {
    const inc = publicIncident(L.crash)!;
    expect(inc.location).toBe("12200 block Coppermine Rd");
    expect(JSON.stringify(inc)).not.toMatch(/A179|E172|Radio|9B/);
  });
});

describe("publicIncidents — batch", () => {
  it("keeps only the public subset of a mixed batch", () => {
    const all = [L.service, L.crash, L.mutualAid, L.gasOutside, L.gasInside, L.pedestrian, L.fireAlarm, L.wires, L.transformer, L.odorInside, L.standby, L.crashNoRadio];
    const kept = publicIncidents(all);
    expect(kept).toHaveLength(5); // 2 crashes, gas leak, wires, transformer
    expect(kept.every((i) => i.location.length > 0)).toBe(true);
  });
});
