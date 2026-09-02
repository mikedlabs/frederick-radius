import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import {
  GREAT_FREDERICK_FAIR_2026_SCHEDULE_SOURCE_URL,
  parseGreatFrederickFair2026Schedule,
} from "./schedule";

const OFFICIAL_2026_FIXTURE = readFileSync(
  new URL(
    "./__fixtures__/great-frederick-fair-2026.ics",
    import.meta.url,
  ),
  "utf8",
);

function eventBlocks(source: string): string[] {
  return source.match(/BEGIN:VEVENT\n[\s\S]*?END:VEVENT\n/g) ?? [];
}

function withoutEventContaining(source: string, marker: string): string {
  const block = eventBlocks(source).find((candidate) =>
    candidate.includes(marker),
  );
  if (!block) throw new Error(`Fixture event not found: ${marker}`);
  return source.replace(block, "");
}

function changeEventContaining(
  source: string,
  marker: string,
  change: (block: string) => string,
): string {
  const block = eventBlocks(source).find((candidate) =>
    candidate.includes(marker),
  );
  if (!block) throw new Error(`Fixture event not found: ${marker}`);
  const changedBlock = change(block);
  if (changedBlock === block) {
    throw new Error(`Fixture event was not changed: ${marker}`);
  }
  return source.replace(block, changedBlock);
}

function withReversedEventOrder(source: string): string {
  const blocks = eventBlocks(source);
  const shell = source.replace(/BEGIN:VEVENT\n[\s\S]*?END:VEVENT\n/g, "");
  return shell.replace(
    "END:VCALENDAR",
    `${blocks.toReversed().join("")}END:VCALENDAR`,
  );
}

describe("Great Frederick Fair 2026 schedule adapter", () => {
  it("resolves the reviewed feed shape into nine days and 190 source rows", () => {
    const result = parseGreatFrederickFair2026Schedule(OFFICIAL_2026_FIXTURE);

    expect(result.ok).toBe(true);
    expect(result.diagnostics).toEqual([]);
    expect(result.stats).toEqual({
      calendarEventCount: 10,
      selectedEventCount: 10,
      dayCount: 9,
      itemCount: 190,
      blankTimeLabelCount: 51,
      inheritedTimeLabelCount: 45,
    });
    expect(result.days.map((day) => day.date)).toEqual([
      "2026-09-18",
      "2026-09-19",
      "2026-09-20",
      "2026-09-21",
      "2026-09-22",
      "2026-09-23",
      "2026-09-24",
      "2026-09-25",
      "2026-09-26",
    ]);
    expect(result.days.map((day) => day.items.length)).toEqual([
      11, 23, 27, 19, 21, 22, 26, 22, 19,
    ]);
  });

  it("keeps recurrence overrides distinct from the standalone opening day", () => {
    const result = parseGreatFrederickFair2026Schedule(OFFICIAL_2026_FIXTURE);
    const [opening, ...recurringDays] = result.days;

    expect(opening.sourceUid).not.toBe(recurringDays[0].sourceUid);
    expect(opening.recurrenceId).toBeNull();
    expect(opening.gateStartsAt).toBe("2026-09-18T20:00:00.000Z");
    expect(new Set(recurringDays.map((day) => day.sourceUid))).toEqual(
      new Set(["3bu4p7b0p8ago8mqs53e9qonl7@google.com"]),
    );
    expect(recurringDays.map((day) => day.recurrenceId)).toEqual(
      recurringDays.map(
        (day) => `${day.date}T13:00:00.000Z`,
      ),
    );
    expect(result.days).toHaveLength(9);
  });

  it("fails closed when an override moves outside its RECURRENCE-ID day", () => {
    const changed = changeEventContaining(
      OFFICIAL_2026_FIXTURE,
      "RECURRENCE-ID;TZID=America/New_York:20260925T090000",
      (block) =>
        block
          .replace(
            "DTSTART;TZID=America/New_York:20260925T090000",
            "DTSTART;TZID=America/New_York:20260927T110000",
          )
          .replace(
            "DTEND;TZID=America/New_York:20260925T220000",
            "DTEND;TZID=America/New_York:20260927T220000",
          ),
    );
    const result = parseGreatFrederickFair2026Schedule(changed);

    expect(result.ok).toBe(false);
    expect(result.days).toEqual([]);
    expect(result.items).toEqual([]);
    expect(result.diagnostics).toContainEqual(
      expect.objectContaining({
        level: "error",
        code: "moved_occurrence",
        fairDate: "2026-09-25",
      }),
    );
  });

  it("fails closed when an override changes the RECURRENCE-ID time", () => {
    const changed = OFFICIAL_2026_FIXTURE.replace(
      "RECURRENCE-ID;TZID=America/New_York:20260925T090000",
      "RECURRENCE-ID;TZID=America/New_York:20260925T100000",
    );
    const result = parseGreatFrederickFair2026Schedule(changed);

    expect(result.ok).toBe(false);
    expect(result.days).toEqual([]);
    expect(result.items).toEqual([]);
    expect(result.diagnostics).toContainEqual(
      expect.objectContaining({
        level: "error",
        code: "unsupported_recurrence_override",
        fairDate: "2026-09-25",
      }),
    );
  });

  it.each([
    "RRULE:FREQ=DAILY;UNTIL=20260927T035959Z;INTERVAL=2",
    "RRULE:FREQ=DAILY;UNTIL=20260927T035959Z;BYDAY=MO",
    "RRULE:FREQ=DAILY;UNTIL=20260927T035959Z;FREQ=DAILY",
  ])("fails closed on unsupported recurrence rule %s", (replacement) => {
    const changed = OFFICIAL_2026_FIXTURE.replace(
      "RRULE:FREQ=DAILY;UNTIL=20260927T035959Z",
      replacement,
    );
    const result = parseGreatFrederickFair2026Schedule(changed);

    expect(result.ok).toBe(false);
    expect(result.days).toEqual([]);
    expect(result.items).toEqual([]);
    expect(result.diagnostics).toContainEqual(
      expect.objectContaining({
        level: "error",
        code: "unsupported_rrule",
      }),
    );
  });

  it("fails closed when a Fair-local timestamp declares another timezone", () => {
    const changed = changeEventContaining(
      OFFICIAL_2026_FIXTURE,
      "RECURRENCE-ID;TZID=America/New_York:20260925T090000",
      (block) =>
        block.replace(
          "DTSTART;TZID=America/New_York:20260925T090000",
          "DTSTART;TZID=America/Chicago:20260925T090000",
        ),
    );
    const result = parseGreatFrederickFair2026Schedule(changed);

    expect(result.ok).toBe(false);
    expect(result.days).toEqual([]);
    expect(result.diagnostics).toContainEqual(
      expect.objectContaining({
        level: "error",
        code: "invalid_event_window",
        fairDate: "2026-09-25",
      }),
    );
  });

  it("fails closed instead of normalizing invalid date components", () => {
    const changed = changeEventContaining(
      OFFICIAL_2026_FIXTURE,
      "RECURRENCE-ID;TZID=America/New_York:20260925T090000",
      (block) =>
        block.replace(
          "DTSTART;TZID=America/New_York:20260925T090000",
          "DTSTART;TZID=America/New_York:20260999T090000",
        ),
    );
    const result = parseGreatFrederickFair2026Schedule(changed);

    expect(result.ok).toBe(false);
    expect(result.days).toEqual([]);
    expect(result.diagnostics).toContainEqual(
      expect.objectContaining({
        level: "error",
        code: "invalid_event_window",
        fairDate: "2026-09-25",
      }),
    );
  });

  it("produces unique stable IDs independent of VEVENT source order", () => {
    const original = parseGreatFrederickFair2026Schedule(OFFICIAL_2026_FIXTURE);
    const reordered = parseGreatFrederickFair2026Schedule(
      withReversedEventOrder(OFFICIAL_2026_FIXTURE),
    );
    const originalIds = original.items.map((item) => item.id);

    expect(new Set(originalIds)).toHaveLength(190);
    expect(reordered.ok).toBe(true);
    expect(reordered.items.map((item) => item.id)).toEqual(originalIds);
  });

  it("preserves truly blank and inherited time labels without collapsing rows", () => {
    const result = parseGreatFrederickFair2026Schedule(OFFICIAL_2026_FIXTURE);
    const openingNote = result.days[0].items[0];
    const september19 = result.days.find((day) => day.date === "2026-09-19");
    const farmAndGarden = september19?.items.find((item) =>
      item.text.startsWith("Farm & Garden Building Opens"),
    );
    const tasteRows = september19?.items.filter((item) =>
      item.text.startsWith('Taste of "Home Grown Frederick"'),
    ) ?? [];

    expect(openingNote).toMatchObject({
      timeLabel: null,
      inheritedTimeLabel: null,
      timeOrigin: "none",
      timing: "unspecified",
      startsAt: null,
      endsAt: null,
    });
    expect(farmAndGarden).toMatchObject({
      timeLabel: null,
      inheritedTimeLabel: "9 a.m.",
      timeOrigin: "inherited",
      timing: "exact",
      startsAt: "2026-09-19T09:00:00-04:00",
    });
    expect(tasteRows).toHaveLength(2);
    expect(tasteRows.map((item) => item.inheritedTimeLabel)).toEqual([
      "Noon - 10 p.m.",
      "5 p.m.",
    ]);
    expect(tasteRows.map((item) => item.startsAt)).toEqual([
      "2026-09-19T12:00:00-04:00",
      "2026-09-19T17:00:00-04:00",
    ]);
    expect(new Set(tasteRows.map((item) => item.id))).toHaveLength(2);
  });

  it("parses exact, inferred-meridiem ranges, approximate, and open-ended labels", () => {
    const result = parseGreatFrederickFair2026Schedule(OFFICIAL_2026_FIXTURE);
    const find = (fragment: string) =>
      result.items.find((item) => item.text.includes(fragment));

    expect(find("Daughtry")).toMatchObject({
      timeLabel: "6:30 p.m.",
      timing: "exact",
      startsAt: "2026-09-18T18:30:00-04:00",
      endsAt: null,
    });
    expect(find('"Egg-citing"')).toMatchObject({
      timeLabel: "3 - 5 p.m.",
      timing: "range",
      startsAt: "2026-09-19T15:00:00-04:00",
      endsAt: "2026-09-19T17:00:00-04:00",
    });
    expect(find("Old Fashion Day")).toMatchObject({
      timeLabel: "Approx. 1:30 p.m.",
      timing: "approximate",
      startsAt: "2026-09-24T13:30:00-04:00",
      endsAt: null,
    });
    expect(find("Carnival Midway Opens - Wristbands $37")).toMatchObject({
      timeLabel: "5 p.m. - Close",
      timing: "open-ended",
      startsAt: "2026-09-18T17:00:00-04:00",
      endsAt: null,
    });
  });

  it("keeps an unparseable source label visible without claiming precision", () => {
    const changed = OFFICIAL_2026_FIXTURE.replace(
      "<td>6\n :30 p.m.</td>  <td></td>  <td>Daughtry",
      "<td>After judging</td>  <td></td>  <td>Daughtry",
    );
    expect(changed).not.toBe(OFFICIAL_2026_FIXTURE);

    const result = parseGreatFrederickFair2026Schedule(changed);
    const daughtry = result.items.find((item) => item.text.includes("Daughtry"));

    expect(result.ok).toBe(true);
    expect(daughtry).toMatchObject({
      timeLabel: "After judging",
      timing: "unspecified",
      startsAt: null,
      endsAt: null,
    });
    expect(result.diagnostics).toContainEqual(
      expect.objectContaining({
        level: "warning",
        code: "unparsed_time_label",
        fairDate: "2026-09-18",
      }),
    );
  });

  it("carries the official URL and LAST-MODIFIED provenance", () => {
    const result = parseGreatFrederickFair2026Schedule(OFFICIAL_2026_FIXTURE);

    expect(result.sourceRevision).toBe("2026-08-29T12:52:36.000Z");
    expect(
      result.items.every(
        (item) =>
          item.sourceUrl === GREAT_FREDERICK_FAIR_2026_SCHEDULE_SOURCE_URL,
      ),
    ).toBe(true);
    expect(result.items.every((item) => item.sourceModifiedAt.length > 0)).toBe(
      true,
    );
    expect(
      result.items.some(
        (item) => item.sourceModifiedAt === "2026-09-01T18:41:12.000Z",
      ),
    ).toBe(false);
  });

  it("ignores DTSTAMP churn for identity and source revision", () => {
    const original = parseGreatFrederickFair2026Schedule(OFFICIAL_2026_FIXTURE);
    const changed = parseGreatFrederickFair2026Schedule(
      OFFICIAL_2026_FIXTURE.replaceAll(
        "DTSTAMP:20260901T184112Z",
        "DTSTAMP:20301231T235959Z",
      ),
    );

    expect(changed.ok).toBe(true);
    expect(changed.sourceRevision).toBe(original.sourceRevision);
    expect(changed.items.map((item) => item.id)).toEqual(
      original.items.map((item) => item.id),
    );
  });

  it("fails closed when a rich daily override is missing", () => {
    const changed = withoutEventContaining(
      OFFICIAL_2026_FIXTURE,
      "RECURRENCE-ID;TZID=America/New_York:20260926T090000",
    );
    const result = parseGreatFrederickFair2026Schedule(changed);

    expect(result.ok).toBe(false);
    expect(result.days).toEqual([]);
    expect(result.items).toEqual([]);
    expect(result.diagnostics).toContainEqual(
      expect.objectContaining({
        level: "error",
        code: "missing_override",
        fairDate: "2026-09-26",
      }),
    );
  });

  it("fails closed and emits no public rows when an override is cancelled", () => {
    const changed = changeEventContaining(
      OFFICIAL_2026_FIXTURE,
      "RECURRENCE-ID;TZID=America/New_York:20260926T090000",
      (block) => block.replace("STATUS:CONFIRMED", "STATUS:CANCELLED"),
    );
    const result = parseGreatFrederickFair2026Schedule(changed);

    expect(result.ok).toBe(false);
    expect(result.days).toEqual([]);
    expect(result.items).toEqual([]);
    expect(result.diagnostics).toContainEqual(
      expect.objectContaining({
        level: "error",
        code: "cancelled_occurrence",
        fairDate: "2026-09-26",
      }),
    );
  });

  it.each([
    ["opening day", "DTSTART:20260918T200000Z", "2026-09-18"],
    [
      "recurrence master",
      "RRULE:FREQ=DAILY;UNTIL=20260927T035959Z",
      "2026-09-19",
    ],
  ])("fails closed when the %s is cancelled", (_name, marker, fairDate) => {
    const changed = changeEventContaining(
      OFFICIAL_2026_FIXTURE,
      marker,
      (block) => block.replace("STATUS:CONFIRMED", "STATUS:CANCELLED"),
    );
    const result = parseGreatFrederickFair2026Schedule(changed);

    expect(result.ok).toBe(false);
    expect(result.days).toEqual([]);
    expect(result.items).toEqual([]);
    expect(result.diagnostics).toContainEqual(
      expect.objectContaining({
        level: "error",
        code: "cancelled_occurrence",
        fairDate,
      }),
    );
  });

  it("fails closed when EXDATE shortens the reviewed nine-day schedule", () => {
    const changed = OFFICIAL_2026_FIXTURE.replace(
      "RRULE:FREQ=DAILY;UNTIL=20260927T035959Z",
      [
        "RRULE:FREQ=DAILY;UNTIL=20260927T035959Z",
        "EXDATE;TZID=America/New_York:20260926T090000",
      ].join("\n"),
    );
    const result = parseGreatFrederickFair2026Schedule(changed);

    expect(result.ok).toBe(false);
    expect(result.days).toEqual([]);
    expect(result.items).toEqual([]);
    expect(result.diagnostics).toContainEqual(
      expect.objectContaining({
        level: "error",
        code: "unexpected_recurrence_range",
      }),
    );
  });

  it("fails closed when an EXDATE cannot be parsed", () => {
    const changed = changeEventContaining(
      OFFICIAL_2026_FIXTURE,
      "RRULE:FREQ=DAILY;UNTIL=20260927T035959Z",
      (block) =>
        block.replace(
          "RRULE:FREQ=DAILY;UNTIL=20260927T035959Z",
          [
            "RRULE:FREQ=DAILY;UNTIL=20260927T035959Z",
            "EXDATE;TZID=America/Chicago:20260923T090000",
          ].join("\n"),
        ),
    );
    const result = parseGreatFrederickFair2026Schedule(changed);

    expect(result.ok).toBe(false);
    expect(result.days).toEqual([]);
    expect(result.items).toEqual([]);
    expect(result.diagnostics).toContainEqual(
      expect.objectContaining({
        level: "error",
        code: "invalid_event_properties",
        fairDate: "2026-09-19",
      }),
    );
  });

  it("fails closed when a critical singleton property is duplicated", () => {
    const changed = changeEventContaining(
      OFFICIAL_2026_FIXTURE,
      "RRULE:FREQ=DAILY;UNTIL=20260927T035959Z",
      (block) =>
        block.replace(
          "STATUS:CONFIRMED",
          "STATUS:CONFIRMED\nSTATUS:CANCELLED",
        ),
    );
    const result = parseGreatFrederickFair2026Schedule(changed);

    expect(result.ok).toBe(false);
    expect(result.days).toEqual([]);
    expect(result.items).toEqual([]);
    expect(result.diagnostics).toContainEqual(
      expect.objectContaining({
        level: "error",
        code: "invalid_event_properties",
        fairDate: "2026-09-19",
      }),
    );
  });

  it("fails closed on a THISANDFUTURE recurrence override", () => {
    const changed = OFFICIAL_2026_FIXTURE.replace(
      "RECURRENCE-ID;TZID=America/New_York:20260925T090000",
      "RECURRENCE-ID;RANGE=THISANDFUTURE;TZID=America/New_York:20260925T090000",
    );
    const result = parseGreatFrederickFair2026Schedule(changed);

    expect(result.ok).toBe(false);
    expect(result.days).toEqual([]);
    expect(result.items).toEqual([]);
    expect(result.diagnostics).toContainEqual(
      expect.objectContaining({
        level: "error",
        code: "unsupported_recurrence_override",
        fairDate: "2026-09-25",
      }),
    );
  });
});
