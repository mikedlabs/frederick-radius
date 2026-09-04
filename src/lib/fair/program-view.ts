import type { FairScheduleSourceItem } from "@/lib/fair/schedule";

const FAIR_TIME_ZONE = "America/New_York";

export type FairProgramTimedItem = {
  title: string;
  performanceSlots?: readonly {
    startsAt: string;
    role: "performance" | "opener" | "headliner";
    name: string | null;
    timeLabel: string;
  }[];
  sourceItem: Pick<
    FairScheduleSourceItem,
    "startsAt" | "endsAt" | "sourcePosition" | "timing"
  >;
};

export type FairProgramDaypart =
  | "morning"
  | "afternoon"
  | "evening"
  | "unscheduled";

export type FairProgramLiveStatus = {
  label: string;
  state: "live" | "next";
};

export function fairProgramTimestamp(value: string | null): number {
  if (!value) return Number.POSITIVE_INFINITY;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : Number.POSITIVE_INFINITY;
}

function fairProgramStartTimestamps(item: FairProgramTimedItem): number[] {
  const slotStarts = item.performanceSlots
    ?.map((slot) => fairProgramTimestamp(slot.startsAt))
    .filter(Number.isFinite)
    .sort((left, right) => left - right);
  if (slotStarts && slotStarts.length > 0) return slotStarts;
  const sourceStart = fairProgramTimestamp(item.sourceItem.startsAt);
  return Number.isFinite(sourceStart) ? [sourceStart] : [];
}

function fairProgramFirstStart(item: FairProgramTimedItem): number {
  return fairProgramStartTimestamps(item)[0] ?? Number.POSITIVE_INFINITY;
}

function fairLocalParts(timestamp: string): {
  date: string;
  hour: number;
  minute: number;
} | null {
  if (!Number.isFinite(Date.parse(timestamp))) return null;
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: FAIR_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(timestamp));
  const value = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "";
  const hour = Number(value("hour"));
  const minute = Number(value("minute"));
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) return null;
  return {
    date: `${value("year")}-${value("month")}-${value("day")}`,
    hour,
    minute,
  };
}

export function fairProgramLocalDate(timestamp: string): string | null {
  return fairLocalParts(timestamp)?.date ?? null;
}

export function fairProgramStartMinutes(item: FairProgramTimedItem): number {
  const startsAt = fairProgramFirstStart(item);
  if (!Number.isFinite(startsAt)) return Number.POSITIVE_INFINITY;
  const parts = fairLocalParts(new Date(startsAt).toISOString());
  return parts ? parts.hour * 60 + parts.minute : Number.POSITIVE_INFINITY;
}

export function fairProgramDaypart(
  item: FairProgramTimedItem,
): FairProgramDaypart {
  const minutes = fairProgramStartMinutes(item);
  if (!Number.isFinite(minutes)) return "unscheduled";
  if (minutes < 12 * 60) return "morning";
  if (minutes < 17 * 60) return "afternoon";
  return "evening";
}

export function sortFairProgramItems<T extends FairProgramTimedItem>(
  items: readonly T[],
): T[] {
  return [...items].sort(
    (left, right) =>
      fairProgramFirstStart(left) - fairProgramFirstStart(right) ||
      left.sourceItem.sourcePosition - right.sourceItem.sourcePosition ||
      left.title.localeCompare(right.title),
  );
}

export function fairProgramNextStart<T extends FairProgramTimedItem>(
  items: readonly T[],
  asOf: string,
  selectedDate: string,
): number | null {
  if (fairProgramLocalDate(asOf) !== selectedDate) return null;
  const now = Date.parse(asOf);
  if (!Number.isFinite(now)) return null;
  const timestamp = Math.min(
    ...items.flatMap((item) =>
      fairProgramStartTimestamps(item).filter((start) => start > now),
    ),
  );
  return Number.isFinite(timestamp) ? timestamp : null;
}

export function rankFairProgramPreviewItems<T extends FairProgramTimedItem>(
  items: readonly T[],
  asOf: string,
  selectedDate: string,
  dayClosesAt?: string | null,
): T[] {
  const ordered = sortFairProgramItems(items);
  if (fairProgramLocalDate(asOf) !== selectedDate) return ordered;
  const now = Date.parse(asOf);
  if (!Number.isFinite(now)) return ordered;

  const happeningNow: T[] = [];
  const upcoming: Array<{ item: T; startsAt: number }> = [];
  const earlierStarts: T[] = [];
  for (const item of ordered) {
    const startsAt = fairProgramFirstStart(item);
    const endsAt = fairProgramEffectiveEnd(item, dayClosesAt);
    const nextPerformanceStart = fairProgramStartTimestamps(item).find(
      (start) => start > now,
    );
    if (item.performanceSlots && item.performanceSlots.length > 0) {
      if (nextPerformanceStart !== undefined) {
        upcoming.push({ item, startsAt: nextPerformanceStart });
      } else {
        earlierStarts.push(item);
      }
      continue;
    }
    if (
      Number.isFinite(startsAt) &&
      Number.isFinite(endsAt) &&
      startsAt <= now &&
      now < endsAt
    ) {
      happeningNow.push(item);
    } else if (nextPerformanceStart !== undefined) {
      upcoming.push({ item, startsAt: nextPerformanceStart });
    } else {
      earlierStarts.push(item);
    }
  }
  upcoming.sort((left, right) => left.startsAt - right.startsAt);
  return [
    ...happeningNow,
    ...upcoming.map(({ item }) => item),
    ...earlierStarts,
  ];
}

export function fairProgramLiveStatus(
  item: FairProgramTimedItem,
  asOf: string,
  selectedDate: string,
  nextStart: number | null,
  dayClosesAt?: string | null,
): FairProgramLiveStatus | null {
  if (fairProgramLocalDate(asOf) !== selectedDate) return null;
  const now = Date.parse(asOf);
  const performanceSlot = item.performanceSlots
    ?.map((slot) => ({
      ...slot,
      timestamp: fairProgramTimestamp(slot.startsAt),
    }))
    .filter((slot) => Number.isFinite(slot.timestamp) && slot.timestamp > now)
    .sort((left, right) => left.timestamp - right.timestamp)[0];
  if (performanceSlot) {
    const minutesAway = Math.max(
      1,
      Math.ceil((performanceSlot.timestamp - now) / 60_000),
    );
    const subject =
      performanceSlot.name ??
      (performanceSlot.role === "opener" ? "Opener" : "Performance");
    if (nextStart === performanceSlot.timestamp || minutesAway <= 60) {
      return {
        label:
          minutesAway <= 90
            ? `${subject} in ${minutesAway} min`
            : `${subject} up next`,
        state: "next",
      };
    }
    return null;
  }
  if (item.performanceSlots && item.performanceSlots.length > 0) return null;

  const startsAt = fairProgramTimestamp(item.sourceItem.startsAt);
  const endsAt = fairProgramEffectiveEnd(item, dayClosesAt);
  if (!Number.isFinite(now) || !Number.isFinite(startsAt)) return null;

  if (Number.isFinite(endsAt) && startsAt <= now && now < endsAt) {
    return { label: "Happening now", state: "live" };
  }
  if (startsAt <= now) return null;

  const minutesAway = Math.max(1, Math.ceil((startsAt - now) / 60_000));
  const approximate = item.sourceItem.timing === "approximate";
  if (nextStart === startsAt) {
    return {
      label: approximate
        ? "Up next · approximate time"
        : minutesAway <= 90
          ? `Up next in ${minutesAway} min`
          : "Up next",
      state: "next",
    };
  }
  if (minutesAway <= 60) {
    return {
      label: approximate
        ? "Starting soon · approximate time"
        : `Starts in ${minutesAway} min`,
      state: "next",
    };
  }
  return null;
}

function fairProgramEffectiveEnd(
  item: FairProgramTimedItem,
  dayClosesAt?: string | null,
): number {
  const publishedEnd = fairProgramTimestamp(item.sourceItem.endsAt);
  if (Number.isFinite(publishedEnd)) return publishedEnd;
  return item.sourceItem.timing === "open-ended"
    ? fairProgramTimestamp(dayClosesAt ?? null)
    : Number.POSITIVE_INFINITY;
}

export function fairProgramDefaultOpenDaypart<T extends FairProgramTimedItem>(
  items: readonly T[],
  asOf: string,
  selectedDate: string,
  dayClosesAt?: string | null,
): FairProgramDaypart | null {
  const ordered = sortFairProgramItems(items);
  if (ordered.length === 0) return null;
  if (fairProgramLocalDate(asOf) !== selectedDate) {
    return fairProgramDaypart(ordered[0]);
  }

  const now = Date.parse(asOf);
  if (!Number.isFinite(now)) return fairProgramDaypart(ordered[0]);
  const relevant = ordered.find((item) => {
    const startsAt = fairProgramTimestamp(item.sourceItem.startsAt);
    const endsAt = fairProgramEffectiveEnd(item, dayClosesAt);
    return (
      startsAt > now ||
      (Number.isFinite(endsAt) && startsAt <= now && now < endsAt)
    );
  });
  return fairProgramDaypart(relevant ?? ordered.at(-1)!);
}
