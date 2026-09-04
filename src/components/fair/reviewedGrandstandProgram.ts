import type { FairScheduleSourceItem } from "@/lib/fair/schedule";

type FairPerformanceSlot = {
  name: string | null;
  timeLabel: string;
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
};

type ReviewedGrandstandEntry = ReviewedGrandstandPresentation & {
  sourceItemId: string;
  fairDate: string;
  sourceTimeLabel: string;
  sourceTextStartsWith: string;
};

/**
 * Display adapters for the six reviewed 2026 evening musical Grandstand rows.
 *
 * The opaque source ID hashes the official date, time label, and wording. The
 * additional checks make the boundary intentional: if the Fair changes a row,
 * Radius falls back to that unmodified source row until the new billing is
 * reviewed. The original FairScheduleSourceItem is never rewritten.
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
        nameStatus: "not-published",
      },
      headliner: {
        name: "Daughtry",
        timeLabel: "8 p.m.",
        nameStatus: "named",
      },
    },
  },
  {
    sourceItemId: "schedule-2026-09-19-3008a520ed07f68c",
    fairDate: "2026-09-19",
    sourceTimeLabel: "7:30 p.m.",
    sourceTextStartsWith: "POP 2000's (",
    title: "POP 2000 Tour",
    timeLabel: "7:30 p.m.",
    detail:
      "The POP 2000 Tour is listed for 7:30 p.m. Check the official event page for the latest lineup.",
    billing: {
      mode: "single-start",
      performance: {
        name: "POP 2000 Tour",
        timeLabel: "7:30 p.m.",
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
        nameStatus: "named",
      },
      headliner: {
        name: "Neal McCoy",
        timeLabel: "8 p.m.",
        nameStatus: "named",
      },
    },
  },
  {
    sourceItemId: "schedule-2026-09-24-97006a0ee39943c2",
    fairDate: "2026-09-24",
    sourceTimeLabel: "6:30 p.m.",
    sourceTextStartsWith: "Danny Gokey w/ Bay Turner -",
    title: "Danny Gokey",
    timeLabel: "Headliner 8 p.m. · Opener 6:30 p.m.",
    detail:
      "Bay Turner opens at 6:30 p.m. Danny Gokey headlines at 8 p.m.",
    billing: {
      mode: "opener-headliner",
      opener: {
        name: "Bay Turner",
        timeLabel: "6:30 p.m.",
        nameStatus: "named",
      },
      headliner: {
        name: "Danny Gokey",
        timeLabel: "8 p.m.",
        nameStatus: "named",
      },
    },
  },
  {
    sourceItemId: "schedule-2026-09-25-73bc7d39e6038aa5",
    fairDate: "2026-09-25",
    sourceTimeLabel: "6 p.m.",
    sourceTextStartsWith: "Let's Sing Taylor!",
    title: "Let's Sing Taylor!",
    timeLabel: "6 p.m.",
    detail: "This is an unofficial tribute to Taylor Swift.",
    billing: {
      mode: "single-start",
      performance: {
        name: "Let's Sing Taylor!",
        timeLabel: "6 p.m.",
        nameStatus: "named",
      },
    },
  },
  {
    sourceItemId: "schedule-2026-09-26-c8638ece748c83ea",
    fairDate: "2026-09-26",
    sourceTimeLabel: "6:30 p.m.",
    sourceTextStartsWith: "Warren Zeiders w/ TBA -",
    title: "Warren Zeiders",
    timeLabel: "Headliner 8 p.m. · Opener 6:30 p.m.",
    detail:
      "The Fair's current sources differ on the opener. Warren Zeiders headlines at 8 p.m.",
    billing: {
      mode: "opener-headliner",
      opener: {
        name: null,
        timeLabel: "6:30 p.m.",
        nameStatus: "to-be-announced",
      },
      headliner: {
        name: "Warren Zeiders",
        timeLabel: "8 p.m.",
        nameStatus: "named",
      },
    },
  },
] as const satisfies readonly ReviewedGrandstandEntry[];

export function reviewedGrandstandPresentation(
  item: FairScheduleSourceItem,
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

  return {
    title: reviewed.title,
    detail: reviewed.detail,
    timeLabel: reviewed.timeLabel,
    billing: reviewed.billing,
  };
}
