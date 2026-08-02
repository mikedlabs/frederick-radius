import { easternWallToUtcISO } from "../../src/lib/tz";

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

/**
 * Normalize an extracted venue date-time without letting the server's own
 * timezone reinterpret it. Venue pages publish Frederick wall-clock times, so
 * a zone-less value is resolved through America/New_York and receives the
 * date's real EST/EDT offset. Date-only values remain calendar dates.
 */
export function normalizeVenueEventDateTime(value: string): string | null {
  const input = value.trim();
  const dateOnly = CALENDAR_DATE.exec(input);
  if (dateOnly) {
    const [, year, month, day] = dateOnly;
    return validCalendarParts(Number(year), Number(month), Number(day))
      ? input
      : null;
  }

  const zoned = ZONED_DATE_TIME.exec(input);
  if (zoned) {
    const [, year, month, day, hour, minute, second, fraction, rawZone] =
      zoned;
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
    const zone = rawZone.toUpperCase() === "Z"
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

  const instant = easternWallToUtcISO(
    numeric.year,
    numeric.month,
    numeric.day,
    numeric.hour,
    numeric.minute,
    numeric.second,
  );
  const actual = easternWallParts(instant);
  if (
    !actual ||
    Object.entries(numeric).some(
      ([key, expected]) => actual[key as keyof typeof actual] !== expected,
    )
  ) {
    // Reject impossible local clocks, including the spring-forward DST gap.
    return null;
  }
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
  }
  return normalized;
}
