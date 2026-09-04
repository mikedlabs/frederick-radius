import { describe, expect, it } from "vitest";

import type { FairScheduleSourceItem } from "@/lib/fair/schedule";

import {
  fairProgramDaypart,
  fairProgramDefaultOpenDaypart,
  fairProgramLiveStatus,
  rankFairProgramPreviewItems,
  sortFairProgramItems,
} from "./program-view";

function item(
  id: string,
  startsAt: string,
  options: {
    endsAt?: string | null;
    sourcePosition?: number;
    timing?: FairScheduleSourceItem["timing"];
  } = {},
) {
  return {
    id,
    title: id,
    sourceItem: {
      startsAt,
      endsAt: options.endsAt ?? null,
      sourcePosition: options.sourcePosition ?? 1,
      timing: options.timing ?? (options.endsAt ? "range" : "exact"),
    } satisfies Pick<
      FairScheduleSourceItem,
      "startsAt" | "endsAt" | "sourcePosition" | "timing"
    >,
  };
}

describe("Fair program view timing", () => {
  it("sorts and groups from parsed startsAt rather than the end of a display range", () => {
    const morningRange = item(
      "9 a.m. - 12 noon",
      "2026-09-18T09:00:00-04:00",
      { endsAt: "2026-09-18T12:00:00-04:00", sourcePosition: 2 },
    );
    const afternoonRange = item(
      "3 - 5 p.m.",
      "2026-09-18T15:00:00-04:00",
      { endsAt: "2026-09-18T17:00:00-04:00", sourcePosition: 1 },
    );

    expect(sortFairProgramItems([afternoonRange, morningRange])).toEqual([
      morningRange,
      afternoonRange,
    ]);
    expect(fairProgramDaypart(morningRange)).toBe("morning");
    expect(fairProgramDaypart(afternoonRange)).toBe("afternoon");
  });

  it("puts reliable live intervals and upcoming starts before earlier point starts", () => {
    const earlierPoint = item("earlier point", "2026-09-18T12:00:00-04:00");
    const live = item("live", "2026-09-18T16:30:00-04:00", {
      endsAt: "2026-09-18T18:00:00-04:00",
    });
    const next = item("next", "2026-09-18T17:15:00-04:00");

    expect(
      rankFairProgramPreviewItems(
        [earlierPoint, next, live],
        "2026-09-18T17:00:00-04:00",
        "2026-09-18",
      ).map((candidate) => candidate.id),
    ).toEqual(["live", "next", "earlier point"]);
  });

  it("labels only evidence-backed live intervals and the earliest future start", () => {
    const live = item("live", "2026-09-18T16:30:00-04:00", {
      endsAt: "2026-09-18T18:00:00-04:00",
    });
    const point = item("point", "2026-09-18T16:30:00-04:00");
    const next = item("next", "2026-09-18T17:15:00-04:00");
    const nextStart = Date.parse("2026-09-18T17:15:00-04:00");

    expect(
      fairProgramLiveStatus(
        live,
        "2026-09-18T17:00:00-04:00",
        "2026-09-18",
        nextStart,
      ),
    ).toEqual({ label: "Happening now", state: "live" });
    expect(
      fairProgramLiveStatus(
        point,
        "2026-09-18T17:00:00-04:00",
        "2026-09-18",
        nextStart,
      ),
    ).toBeNull();
    expect(
      fairProgramLiveStatus(
        next,
        "2026-09-18T17:00:00-04:00",
        "2026-09-18",
        nextStart,
      ),
    ).toEqual({ label: "Up next in 15 min", state: "next" });
  });

  it("opens the relevant daypart for today and the first daypart for future days", () => {
    const morning = item("morning", "2026-09-18T09:00:00-04:00");
    const evening = item("evening", "2026-09-18T19:00:00-04:00");

    expect(
      fairProgramDefaultOpenDaypart(
        [morning, evening],
        "2026-09-18T18:30:00-04:00",
        "2026-09-18",
      ),
    ).toBe("evening");
    expect(
      fairProgramDefaultOpenDaypart(
        [morning, evening],
        "2026-09-17T18:30:00-04:00",
        "2026-09-18",
      ),
    ).toBe("morning");
  });

  it("treats an official to-close row as live only until the reviewed gate close", () => {
    const midway = item("midway", "2026-09-18T16:00:00-04:00", {
      timing: "open-ended",
    });
    const gateClosesAt = "2026-09-18T22:00:00-04:00";

    expect(
      fairProgramLiveStatus(
        midway,
        "2026-09-18T20:00:00-04:00",
        "2026-09-18",
        null,
        gateClosesAt,
      ),
    ).toEqual({ label: "Happening now", state: "live" });
    expect(
      fairProgramLiveStatus(
        midway,
        "2026-09-18T22:05:00-04:00",
        "2026-09-18",
        null,
        gateClosesAt,
      ),
    ).toBeNull();
  });

  it("never turns an approximate start into an exact minute countdown", () => {
    const approximate = item(
      "approximately 5 p.m.",
      "2026-09-18T17:00:00-04:00",
      { timing: "approximate" },
    );

    expect(
      fairProgramLiveStatus(
        approximate,
        "2026-09-18T16:45:00-04:00",
        "2026-09-18",
        Date.parse("2026-09-18T17:00:00-04:00"),
      ),
    ).toEqual({
      label: "Up next · approximate time",
      state: "next",
    });
  });
});
