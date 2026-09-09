import type { FairScheduleSourceItem } from "@/lib/fair/schedule";

export type FairPerformanceSlot = {
  name: string | null;
  timeLabel: string;
  startsAt: string;
  role: "performance" | "opener" | "headliner";
  nameStatus: "named" | "not-published" | "to-be-announced";
};

export type ReviewedGrandstandBilling =
  | {
      mode: "single-start";
      performance: FairPerformanceSlot;
    }
  | {
      mode: "opener-headliner";
      opener: FairPerformanceSlot;
      headliner: FairPerformanceSlot;
    };

export type ReviewedGrandstandPresentation = {
  title: string;
  detail: string;
  timeLabel: string;
  billing: ReviewedGrandstandBilling;
  sourceUrl: string;
  reviewedOn: string;
  validThrough: string;
  sourceRevision: string;
};

type ReviewedGrandstandEntry = Omit<
  ReviewedGrandstandPresentation,
  "sourceUrl" | "reviewedOn" | "validThrough" | "sourceRevision"
> & {
  sourceItemId: string;
  fairDate: string;
  sourceTimeLabel: string;
  sourceTextStartsWith: string;
};

const GRANDSTAND_SOURCE_URL =
  "https://thegreatfrederickfair.com/schedule/";
const GRANDSTAND_REVIEWED_ON = "2026-09-09";
const GRANDSTAND_VALID_THROUGH = "2026-09-26";
const GRANDSTAND_EXPIRES_AT = "2026-09-27T00:00:00-04:00";
const GRANDSTAND_SOURCE_REVISION = "manual-review-2026-09-09";

/**
 * Display adapters for the six reviewed 2026 evening musical Grandstand rows.
 *
 * The opaque source ID hashes the official date, time label, and wording. The
 * additional checks make the boundary intentional: if the imported row changes,
 * Radius falls back to that unmodified source row until the new billing is
 * reviewed. A presentation may also carry a newer, first-party correction than
 * the immutable imported snapshot. The original FairScheduleSourceItem is never
 * rewritten.
 */
const REVIEWED_2026_GRANDSTAND_SHOWS = [
  {
    sourceItemId: "schedule-2026-09-18-d87c6a779710b823",
    fairDate: "2026-09-18",
    sourceTimeLabel: "6:30 p.m.",
    sourceTextStartsWith: "Daughtry -",
    title: "Daughtry",
    timeLabel: "Headliner 8 p.m. · Opener 6:30 p.m.",
    detail:
      "Daughtry is the 8 p.m. headliner. The Fair lists an opener at 6:30 p.m. but does not name the opener in this program row.",
    billing: {
      mode: "opener-headliner",
      opener: {
        name: null,
        timeLabel: "6:30 p.m.",
        startsAt: "2026-09-18T18:30:00-04:00",
        role: "opener",
        nameStatus: "not-published",
      },
      headliner: {
        name: "Daughtry",
        timeLabel: "8 p.m.",
        startsAt: "2026-09-18T20:00:00-04:00",
        role: "headliner",
        nameStatus: "named",
      },
    },
  },
  {
    sourceItemId: "schedule-2026-09-19-48fd72c61ae4d96a",
    fairDate: "2026-09-19",
    sourceTimeLabel: "7:30 p.m.",
    sourceTextStartsWith: "POP 2000’s (",
    title: "POP 2000 Tour",
    timeLabel: "7:30 p.m.",
    detail:
      "The reviewed Fair schedule lists Chris Kirkpatrick from N*SYNC, LFO, OTOWN, and Ryan Cabrera.",
    billing: {
      mode: "single-start",
      performance: {
        name: "POP 2000 Tour",
        timeLabel: "7:30 p.m.",
        startsAt: "2026-09-19T19:30:00-04:00",
        role: "performance",
        nameStatus: "named",
      },
    },
  },
  {
    sourceItemId: "schedule-2026-09-20-0dbdc28c8a12f368",
    fairDate: "2026-09-20",
    sourceTimeLabel: "6:30 p.m.",
    sourceTextStartsWith: "Neal McCoy w/ Mark Wills-",
    title: "Neal McCoy",
    timeLabel: "Headliner 8 p.m. · Opener 6:30 p.m.",
    detail:
      "Mark Wills opens at 6:30 p.m. Neal McCoy headlines at 8 p.m.",
    billing: {
      mode: "opener-headliner",
      opener: {
        name: "Mark Wills",
        timeLabel: "6:30 p.m.",
        startsAt: "2026-09-20T18:30:00-04:00",
        role: "opener",
        nameStatus: "named",
      },
      headliner: {
        name: "Neal McCoy",
        timeLabel: "8 p.m.",
        startsAt: "2026-09-20T20:00:00-04:00",
        role: "headliner",
        nameStatus: "named",
      },
    },
  },
  {
    sourceItemId: "schedule-2026-09-24-145d13a52f4c3b39",
    fairDate: "2026-09-24",
    sourceTimeLabel: "6:30 p.m.",
    sourceTextStartsWith: "Danny Gokey w/ TBA -",
    title: "Danny Gokey",
    timeLabel: "Headliner 8 p.m. · Opener 6:30 p.m.",
    detail:
      "The reviewed Fair schedule lists the 6:30 p.m. opener as TBA. Danny Gokey headlines at 8 p.m.",
    billing: {
      mode: "opener-headliner",
      opener: {
        name: null,
        timeLabel: "6:30 p.m.",
        startsAt: "2026-09-24T18:30:00-04:00",
        role: "opener",
        nameStatus: "to-be-announced",
      },
      headliner: {
        name: "Danny Gokey",
        timeLabel: "8 p.m.",
        startsAt: "2026-09-24T20:00:00-04:00",
        role: "headliner",
        nameStatus: "named",
      },
    },
  },
  {
    sourceItemId: "schedule-2026-09-25-fa388a27b728316b",
    fairDate: "2026-09-25",
    sourceTimeLabel: "6 p.m.",
    sourceTextStartsWith: "Let’s Sing Taylor!",
    title: "Let's Sing Taylor!",
    timeLabel: "6 p.m.",
    detail: "This is an unofficial tribute to Taylor Swift.",
    billing: {
      mode: "single-start",
      performance: {
        name: "Let's Sing Taylor!",
        timeLabel: "6 p.m.",
        startsAt: "2026-09-25T18:00:00-04:00",
        role: "performance",
        nameStatus: "named",
      },
    },
  },
  {
    sourceItemId: "schedule-2026-09-26-76e1fe3070a06994",
    fairDate: "2026-09-26",
    sourceTimeLabel: "6:30 p.m.",
    sourceTextStartsWith: "Warren Zeiders w/ Chris Darlington -",
    title: "Warren Zeiders",
    timeLabel: "Headliner 8 p.m. · Opener 6:30 p.m.",
    detail:
      "Chris Darlington opens at 6:30 p.m. Warren Zeiders headlines at 8 p.m.",
    billing: {
      mode: "opener-headliner",
      opener: {
        name: "Chris Darlington",
        timeLabel: "6:30 p.m.",
        startsAt: "2026-09-26T18:30:00-04:00",
        role: "opener",
        nameStatus: "named",
      },
      headliner: {
        name: "Warren Zeiders",
        timeLabel: "8 p.m.",
        startsAt: "2026-09-26T20:00:00-04:00",
        role: "headliner",
        nameStatus: "named",
      },
    },
  },
] as const satisfies readonly ReviewedGrandstandEntry[];

export function reviewedGrandstandPresentation(
  item: FairScheduleSourceItem,
  asOf: Date,
): ReviewedGrandstandPresentation | null {
  const reviewed = REVIEWED_2026_GRANDSTAND_SHOWS.find(
    (candidate) => candidate.sourceItemId === item.id,
  );
  if (
    !reviewed ||
    item.fairDate !== reviewed.fairDate ||
    item.timeLabel !== reviewed.sourceTimeLabel ||
    !item.text.startsWith(reviewed.sourceTextStartsWith)
  ) {
    return null;
  }
  if (asOf.getTime() >= Date.parse(GRANDSTAND_EXPIRES_AT)) {
    return null;
  }

  return {
    title: reviewed.title,
    detail: reviewed.detail,
    timeLabel: reviewed.timeLabel,
    billing: reviewed.billing,
    sourceUrl: GRANDSTAND_SOURCE_URL,
    reviewedOn: GRANDSTAND_REVIEWED_ON,
    validThrough: GRANDSTAND_VALID_THROUGH,
    sourceRevision: GRANDSTAND_SOURCE_REVISION,
  };
}
