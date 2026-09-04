import type { FairScheduleSourceItem } from "@/lib/fair/schedule";

const FAIR_TIME_ZONE = "America/New_York";

export type FairProgramTimedItem = {
  title: string;
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
  const startsAt = item.sourceItem.startsAt;
  if (!startsAt) return Number.POSITIVE_INFINITY;
  const parts = fairLocalParts(startsAt);
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
      fairProgramTimestamp(left.sourceItem.startsAt) -
        fairProgramTimestamp(right.sourceItem.startsAt) ||
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
  const next = sortFairProgramItems(items).find(
    (item) => fairProgramTimestamp(item.sourceItem.startsAt) > now,
  );
  const timestamp = next
    ? fairProgramTimestamp(next.sourceItem.startsAt)
    : Number.POSITIVE_INFINITY;
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
  const upcoming: T[] = [];
  const earlierStarts: T[] = [];
  for (const item of ordered) {
    const startsAt = fairProgramTimestamp(item.sourceItem.startsAt);
    const endsAt = fairProgramEffectiveEnd(item, dayClosesAt);
    if (
      Number.isFinite(startsAt) &&
      Number.isFinite(endsAt) &&
      startsAt <= now &&
      now < endsAt
    ) {
      happeningNow.push(item);
    } else if (Number.isFinite(startsAt) && startsAt > now) {
      upcoming.push(item);
    } else {
      earlierStarts.push(item);
    }
  }
  return [...happeningNow, ...upcoming, ...earlierStarts];
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
