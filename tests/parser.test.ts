/** iCal parser tests. Run: npx tsx tests/parser.test.ts */
import assert from "node:assert/strict";
import { parseICal } from "../src/lib/ingest/parser";

const SAMPLE = `BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//CivicEngage//iCal//EN
BEGIN:VEVENT
SUMMARY:Toddler Dance Party
DTSTART;TZID=America/New_York:20270110T093000
DTEND;TZID=America/New_York:20270110T101500
LOCATION:<p>Multipurpose Room</p> - 121 N Bentz St  Frederick MD 21701
DESCRIPTION: https://www.cityoffrederickmd.gov/calendar.aspx?EID=22084
UID:22084
DTSTAMP;TZID=America/New_York:20260514T122751
END:VEVENT
BEGIN:VEVENT
SUMMARY:Town Holiday - Offices Closed
DTSTART;VALUE=DATE:20270704
UID:9001
DTSTAMP:20260514T120000Z
END:VEVENT
END:VCALENDAR`;

let pass = 0;
function t(name: string, fn: () => void) {
  try { fn(); pass++; console.log(`  ✓ ${name}`); }
  catch (e) { console.error(`  ✗ ${name}\n    ${(e as Error).message}`); process.exitCode = 1; }
}

console.log("parser.parseICal");
const ev = parseICal(SAMPLE);

t("parses both VEVENTs", () => assert.equal(ev.length, 2));

t("timed event: UTC conversion correct (9:30 EST = 14:30Z in Jan)", () => {
  const e = ev.find((x) => x.uid === "22084")!;
  assert.equal(e.summary, "Toddler Dance Party");
  assert.equal(e.allDay, false);
  assert.equal(e.tzid, "America/New_York");
  // 2027-01-10 09:30 America/New_York (EST, -5) → 14:30Z
  assert.equal(e.startsAtUtc, "2027-01-10T14:30:00.000Z");
  assert.equal(e.endsAtUtc, "2027-01-10T15:15:00.000Z");
});

t("URL pulled from DESCRIPTION", () => {
  const e = ev.find((x) => x.uid === "22084")!;
  assert.equal(e.sourceUrl, "https://www.cityoffrederickmd.gov/calendar.aspx?EID=22084");
});

t("raw VEVENT preserved", () => {
  const e = ev.find((x) => x.uid === "22084")!;
  assert.match(e.rawVevent, /Toddler Dance Party/);
});

t("all-day event flagged + anchored to NY midnight UTC", () => {
  const e = ev.find((x) => x.uid === "9001")!;
  assert.equal(e.allDay, true);
  // 2027-07-04 midnight America/New_York (EDT, -4) → 04:00Z
  assert.equal(e.startsAtUtc, "2027-07-04T04:00:00.000Z");
  // With no DTEND, RFC all-day semantics default to the next local midnight.
  assert.equal(e.endsAtUtc, "2027-07-05T04:00:00.000Z");
});

t("dtstamp captured for change detection", () => {
  const e = ev.find((x) => x.uid === "22084")!;
  assert.ok(e.dtstamp && e.dtstamp.endsWith("Z"));
});

console.log(`\n${pass} parser assertions passed`);
