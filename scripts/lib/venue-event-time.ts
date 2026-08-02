const EASTERN_TIME_ZONE = "America/New_York";
const CALENDAR_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const LOCAL_DATE_TIME =
  /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2})(\.\d{1,9})?)?$/;
const ZONED_DATE_TIME =
  /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2})(\.\d{1,9})?)?(Z|[+-]\d{2}:?\d{2})$/i;

type EventTimeFields = {
  starts_at?: string;
  ends_at?: string | null;
};

function validCalendarParts(
  year: number,
  month: number,
  day: number,
  hour = 0,
  minute = 0,
  second = 0,
): boolean {
  if (
    year < 1 ||
    month < 1 ||
    month > 12 ||
    day < 1 ||
    day > 31 ||
    hour < 0 ||
    hour > 23 ||
    minute < 0 ||
    minute > 59 ||
    second < 0 ||
    second > 59
  ) {
    return false;
  }
  const calendar = new Date(Date.UTC(year, month - 1, day));
  return (
    calendar.getUTCFullYear() === year &&
    calendar.getUTCMonth() === month - 1 &&
    calendar.getUTCDate() === day
  );
}

function easternWallParts(instant: string): {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
} | null {
  try {
    const parts = Object.fromEntries(
      new Intl.DateTimeFormat("en-US", {
        timeZone: EASTERN_TIME_ZONE,
        hourCycle: "h23",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      })
        .formatToParts(new Date(instant))
        .map((part) => [part.type, part.value]),
    ) as Record<string, string>;
    return {
      year: Number(parts.year),
      month: Number(parts.month),
      day: Number(parts.day),
      hour: Number(parts.hour) % 24,
      minute: Number(parts.minute),
      second: Number(parts.second),
    };
  } catch {
    return null;
  }
}

function easternOffset(instant: string): string | null {
  try {
    const zoneName = new Intl.DateTimeFormat("en-US", {
      timeZone: EASTERN_TIME_ZONE,
      timeZoneName: "longOffset",
    })
      .formatToParts(new Date(instant))
      .find((part) => part.type === "timeZoneName")?.value;
    const match = /^GMT([+-]\d{2}:\d{2})$/.exec(zoneName ?? "");
    return match?.[1] ?? null;
  } catch {
    return null;
  }
}

function matchesEasternWall(
  instant: string,
  expected: NonNullable<ReturnType<typeof easternWallParts>>,
): boolean {
  const actual = easternWallParts(instant);
  return (
    actual !== null &&
    Object.entries(expected).every(
      ([key, value]) => actual[key as keyof typeof actual] === value,
    )
  );
}

/**
 * Normalize an extracted venue date-time without letting the server's own
 * timezone reinterpret it. Venue pages publish Frederick wall-clock times, so
 * a zone-less value is resolved through America/New_York and receives the
 * date's real EST/EDT offset. A date without a published clock is not a valid
 * venue start because this artifact has no supported all-day/date-only marker.
 */
export function normalizeVenueEventDateTime(value: string): string | null {
  const input = value.trim();
  if (CALENDAR_DATE.test(input)) return null;

  const zoned = ZONED_DATE_TIME.exec(input);
  if (zoned) {
    const [, year, month, day, hour, minute, second, fraction, rawZone] = zoned;
    if (
      !validCalendarParts(
        Number(year),
        Number(month),
        Number(day),
        Number(hour),
        Number(minute),
        Number(second ?? 0),
      )
    ) {
      return null;
    }
    const zone =
      rawZone.toUpperCase() === "Z"
        ? "Z"
        : rawZone.includes(":")
          ? rawZone
          : `${rawZone.slice(0, 3)}:${rawZone.slice(3)}`;
    const normalized =
      `${year}-${month}-${day}T${hour}:${minute}` +
      `${second ? `:${second}${fraction ?? ""}` : ""}${zone}`;
    return Number.isFinite(Date.parse(normalized)) ? normalized : null;
  }

  const local = LOCAL_DATE_TIME.exec(input);
  if (!local) return null;
  const [, year, month, day, hour, minute, second, fraction] = local;
  const numeric = {
    year: Number(year),
    month: Number(month),
    day: Number(day),
    hour: Number(hour),
    minute: Number(minute),
    second: Number(second ?? 0),
  };
  if (
    !validCalendarParts(
      numeric.year,
      numeric.month,
      numeric.day,
      numeric.hour,
      numeric.minute,
      numeric.second,
    )
  ) {
    return null;
  }

  const wallAsUtc = Date.UTC(
    numeric.year,
    numeric.month - 1,
    numeric.day,
    numeric.hour,
    numeric.minute,
    numeric.second,
  );
  // Frederick can be UTC-04:00 or UTC-05:00. Resolve both candidates through
  // Intl instead of asking for the offset at a synthetic UTC wall time, which
  // is wrong during the hours immediately after a DST transition.
  const matchingInstants = [4, 5]
    .map((hoursBehindUtc) =>
      new Date(wallAsUtc + hoursBehindUtc * 60 * 60 * 1_000).toISOString(),
    )
    .filter((candidate) => matchesEasternWall(candidate, numeric));
  if (matchingInstants.length !== 1) {
    // Zero matches is the spring-forward gap; two matches is the fall-back
    // overlap. An ambiguous source clock requires an explicit UTC offset.
    return null;
  }
  const instant = matchingInstants[0]!;
  const offset = easternOffset(instant);
  if (!offset) return null;
  return (
    `${year}-${month}-${day}T${hour}:${minute}` +
    `${second ? `:${second}${fraction ?? ""}` : ""}${offset}`
  );
}

/** Normalize the required start and any optional end on one extracted row. */
export function normalizeVenueEventTimes<T extends EventTimeFields>(
  event: T,
): T | null {
  if (typeof event.starts_at !== "string") return null;
  const startsAt = normalizeVenueEventDateTime(event.starts_at);
  if (!startsAt) return null;

  const normalized = { ...event, starts_at: startsAt } as T;
  if (typeof event.ends_at === "string" && event.ends_at.trim()) {
    const endsAt = normalizeVenueEventDateTime(event.ends_at);
    if (endsAt) {
      normalized.ends_at = endsAt;
    } else {
      delete normalized.ends_at;
    }
  } else {
    // Optional provider fields still arrive as blank strings, nulls, and
    // occasionally unexpected runtime values. Treat all of them as absent so
    // consumers never try to render an invalid end date.
    delete normalized.ends_at;
  }
  return normalized;
}
