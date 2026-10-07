import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Today's answer shelf, live happy hours and event recovery carry time facts
 * a reader acts on ("Why it leads", "On now · till close", the events
 * heading). The Today audit found them at 9.5px and 10px, below what reads
 * reliably on a phone in daylight. Text these components author must stay at
 * 11px or larger; shared headings are covered by their own components.
 */
const FILES = [
  "src/components/today/DaypartNeeds.tsx",
  "src/components/today/HappyHourWallet.tsx",
  "src/components/today/TodayEventsRecovery.tsx",
];

const SUB_ELEVEN_PIXEL = /text-\[(?:\d|10)(?:\.\d+)?px\]/g;

describe("Today type floor", () => {
  it.each(FILES)("%s authors no text below 11px", (file) => {
    const source = readFileSync(resolve(file), "utf8");
    expect(source.match(SUB_ELEVEN_PIXEL) ?? []).toEqual([]);
    expect(source).not.toMatch(/fontSize:\s*(?:\d|10)(?:\.\d+)?\b/);
  });
});
