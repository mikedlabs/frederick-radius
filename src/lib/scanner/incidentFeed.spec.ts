import { describe, it, expect } from "vitest";
import { parseIncidentLine, publicIncident, publicIncidents, geocodableAddress, classifyPublicIncident } from "./incidentFeed";

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
  vehicleFire: "5:12 pm | VEHICLE FIRE | 7000 BLOCK GUILFORD DR | Radio: 9C | Units: E93",
  hazmat: "10:02 am | FUEL SPILL | 5300 BLOCK BUCKEYSTOWN PIKE | Radio: 9C | Units: E31",
  entrapment: "8:15 pm | BUILDING COLLAPSE WITH ENTRAPMENT | 100 BLOCK E PATRICK ST | Radio: 9C | Units: R19",
  medevacCrash: "3:20 pm | MEDEVAC REQUESTED FOR VEHICLE ACCIDENT | 9400 BLOCK OLD NATIONAL PIKE | Radio: 9B | Units: TROOPER 3",
  // Adversarial-audit leak lines (2026-07-21): all of these were classifying
  // as public before the deny list + context requirements. NEVER again.
  medevacBare: "2:44 am | MEDEVAC | 100 BLOCK HOPE FARM CT | Radio: 9D | Units: TROOPER 3",
  landingZoneAls: "12:47 am | LANDING ZONE - ALS | 6800 BLOCK BLOOMSBURY RD | Radio: 9D | Units: TROOPER 3, A289",
  fallTrapped: "6:44 pm | FALL VICTIM TRAPPED IN BATHROOM | 200 BLOCK W PATRICK ST | Radio: 9C | Units: A1",
  bariatric: "2:03 am | EMS EXTRICATION - BARIATRIC LIFT ASSIST | 500 BLOCK MOTTER AVE | Radio: 9D | Units: A2",
  elevator: "1:30 am | PERSON TRAPPED IN ELEVATOR | 900 BLOCK WATERFORD DR, SUNRISE RETIREMENT | Radio: 9C | Units: E11",
  standbyTwoWords: "3:57 pm | FHH STAND BY FOR HELICOPTER LANDING | 400 BLOCK W SEVENTH ST, FHH | Radio: 9C | Units: K33",
  aptFire: "9:10 pm | APARTMENT FIRE | 100 BLOCK WILLOWDALE DR, Bldg: 7, Apt/Unit: 302 | Radio: 9C | Units: E15",
  exactAddress: "4:12 pm | HOUSE FIRE | 123 W PATRICK ST | Radio: 9C | Units: E1",
  poolRescue: "2:10 pm | WATER RESCUE | 100 BLOCK SUNSET CT, PRIVATE POOL | Radio: 9C | Units: R19",
  motorcycle: "4:10 pm | MOTORCYCLE ACCIDENT | 8000 BLOCK BASEBALL BLVD | Radio: 9B | Units: A11",
  flooding: "7:00 am | FLOODING CONDITION | 300 BLOCK E SOUTH ST | Radio: 9C | Units: E1",
  // Private medical calls — must NEVER surface, even though they carry a unit.
  chestPain: "2:11 pm | CHEST PAIN - ALS | 300 BLOCK COLLEGE AVE | Radio: 9D | Units: A1",
  fall: "6:44 pm | FALL VICTIM - BLS | 200 BLOCK W PATRICK ST | Radio: 9C | Units: A1",
  sick: "9:30 am | SICK PERSON | 1400 BLOCK NORTH AVE | Radio: 9C | Units: M1",
  unconscious: "1:05 am | UNCONSCIOUS SUBJECT - ALS | 500 BLOCK MOTTER AVE | Radio: 9D | Units: A2",
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

  it("KEEPS a pedestrian struck, vehicle fire, hazmat, entrapment, medevac", () => {
    // A person hit on a public road is a road collision, not private medical —
    // even with the medical unit ("- ALS") riding along.
    expect(publicIncident(L.pedestrian)).toMatchObject({ kind: "Pedestrian struck", roadImpact: true });
    expect(publicIncident(L.vehicleFire)).toMatchObject({ kind: "Vehicle fire", roadImpact: true });
    expect(publicIncident(L.hazmat)).toMatchObject({ kind: "Hazmat", roadImpact: true });
    expect(publicIncident(L.entrapment)).toMatchObject({ kind: "Rescue" });
    expect(publicIncident(L.medevacCrash)).toMatchObject({ kind: "Medevac", roadImpact: true });
    expect(publicIncident(L.motorcycle)).toMatchObject({ kind: "Crash", roadImpact: true });
    expect(publicIncident(L.flooding)).toMatchObject({ kind: "Flooding", roadImpact: true });
  });

  it("DROPS the adversarial-audit leak lines: medical rescues, bare medevacs, two-word standby", () => {
    for (const line of [L.medevacBare, L.landingZoneAls, L.fallTrapped, L.bariatric, L.elevator, L.standbyTwoWords]) {
      expect(publicIncident(line), line).toBeNull();
    }
  });

  it("sanitizes locations to block level on EVERY path", () => {
    // Bldg/Apt/Unit identifiers never reach display or the archive.
    const apt = publicIncident(L.aptFire)!;
    expect(apt.location).toBe("100 block Willowdale Dr");
    expect(JSON.stringify(apt)).not.toMatch(/bldg|apt|unit|302/i);
    // A bare house number blurs to its hundred block.
    expect(publicIncident(L.exactAddress)!.location).toBe("100 block W Patrick St");
    // A water rescue drops the landmark tail (a pool is a medical scene).
    const pool = publicIncident(L.poolRescue)!;
    expect(pool.location).toBe("100 block Sunset Ct");
    expect(JSON.stringify(pool)).not.toMatch(/pool/i);
  });

  it("DROPS everything PRIVATE-medical, personal, or noisy", () => {
    // These must never reach a user — a private medical emergency (chest pain,
    // a fall, a sick or unconscious person), homes, a retirement facility,
    // false-heavy alarms, routine standby, mutual aid, and non-incident chatter.
    for (const line of [
      L.chestPain, L.fall, L.sick, L.unconscious,
      L.service, L.mutualAid, L.gasInside, L.fireAlarm, L.odorInside, L.standby,
    ]) {
      expect(publicIncident(line), line).toBeNull();
    }
  });

  it("title-cases the block-level location, no unit/radio codes", () => {
    const inc = publicIncident(L.crash)!;
    expect(inc.location).toBe("12200 block Coppermine Rd");
    expect(JSON.stringify(inc)).not.toMatch(/A179|E172|Radio|9B/);
  });
});

describe("classifyPublicIncident — shared by the pipe + RSS sources", () => {
  it("keeps public, drops medical/alarm — from separated parts (the RSS path)", () => {
    expect(classifyPublicIncident("HOUSE FIRE", "700 BLOCK E POTOMAC ST", "11:17 pm")).toMatchObject({
      kind: "Structure fire",
      time: "11:17 pm",
    });
    expect(classifyPublicIncident("VEHICLE ACCIDENT - BLS", "12200 BLOCK COPPERMINE RD", "7:23 pm")).toMatchObject({ kind: "Crash" });
    expect(classifyPublicIncident("COMMERCIAL FIRE ALARM", "5200 BLOCK BLACK LOCUST DR", "11:06 pm")).toBeNull();
    expect(classifyPublicIncident("GAS ODOR INSIDE", "1300 BLOCK HOPE FARM CT", "3:14 pm")).toBeNull();
    expect(classifyPublicIncident("", "somewhere", "1:00 pm")).toBeNull();
  });
});

describe("geocodableAddress", () => {
  it("drops BLOCK and the landmark tail, keeps the street", () => {
    expect(geocodableAddress("12200 block Coppermine Rd")).toBe("12200 Coppermine Rd");
    expect(geocodableAddress("200 block N Market St, Bloom Asian Haus")).toBe("200 N Market St");
  });
  it("rewrites an intersection", () => {
    expect(geocodableAddress("FSK Highway / Middleburg Rd")).toBe("FSK Highway and Middleburg Rd");
  });
  it("returns null when there's no street token", () => {
    expect(geocodableAddress("")).toBeNull();
    expect(geocodableAddress("12345")).toBeNull();
  });
});

describe("publicIncidents — batch", () => {
  it("keeps only the public subset of a mixed batch", () => {
    const all = [L.service, L.crash, L.mutualAid, L.gasOutside, L.gasInside, L.pedestrian, L.fireAlarm, L.wires, L.transformer, L.odorInside, L.standby, L.crashNoRadio];
    const kept = publicIncidents(all);
    expect(kept).toHaveLength(6); // 2 crashes, gas leak, wires, transformer, pedestrian struck
    expect(kept.every((i) => i.location.length > 0)).toBe(true);
  });
});
