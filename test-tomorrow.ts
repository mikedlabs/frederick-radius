import { allUpcoming } from "./src/lib/loaders/events";
import { easternWallToUtcISO } from "./src/lib/tz";

function easternParts(d: Date): { year: number; month: number; day: number; hour: number; weekday: number } {
  const f = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", hour12: false, weekday: "short",
  });
  const p = Object.fromEntries(f.formatToParts(d).map((x) => [x.type, x.value]));
  const WD: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  return {
    year: Number(p.year),
    month: Number(p.month),
    day: Number(p.day),
    hour: Number(p.hour) % 24,
    weekday: WD[p.weekday as string] ?? 0,
  };
}

function easternDayAt(base: { year: number; month: number; day: number }, offsetDays: number, hour: number, minute = 0): string {
  const walked = new Date(Date.UTC(base.year, base.month - 1, base.day + offsetDays, 12));
  return easternWallToUtcISO(
    walked.getUTCFullYear(),
    walked.getUTCMonth() + 1,
    walked.getUTCDate(),
    hour,
    minute,
  );
}

const now = new Date();
const et = easternParts(now);
const startMs = Date.parse(easternDayAt(et, 1, 0, 0));
const endMs = Date.parse(easternDayAt(et, 2, 0, 0)) - 1;

console.log(`Tomorrow window: ${new Date(startMs).toISOString()} to ${new Date(endMs).toISOString()}`);

const upcoming = allUpcoming(now);
console.log(`Total upcoming: ${upcoming.length}`);

const tomorrowEvents = upcoming.filter((e) => {
  const ms = Date.parse(e.starts_at);
  return Number.isFinite(ms) && ms >= startMs && ms <= endMs;
});

console.log(`Tomorrow events count: ${tomorrowEvents.length}`);
if (tomorrowEvents.length > 0) {
    console.log("First tomorrow event:", tomorrowEvents[0].title, tomorrowEvents[0].starts_at);
} else {
    // print some upcoming events
    console.log("Next 5 upcoming:");
    upcoming.slice(0, 5).forEach(e => console.log(e.title, e.starts_at));
}
