import { easternWallToUtcISO } from "./src/lib/tz";

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

const et = { year: 2026, month: 9, day: 11, hour: 10, weekday: 5 };
console.log("Tomorrow start:", easternDayAt(et, 1, 0, 0));
console.log("Tomorrow end:", easternDayAt(et, 2, 0, 0));
