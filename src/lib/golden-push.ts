import { goldenHourWindow } from "@/lib/today/golden-hour";
import { FREDERICK_LAT, FREDERICK_LNG } from "@/lib/almanac";
import { easternDayKey } from "@/lib/tz";

/**
 * The golden-hour push decision — pure, so the send band is unit-tested.
 *
 * The cron ticks every 15 minutes through the county's possible evening
 * range; this says whether THIS tick is the one that pushes. The band is
 * 15-40 minutes before golden hour opens: wide enough that a 15-minute
 * cron cadence always lands at least one tick inside it, and push_log's
 * (topic, dedupe key) claim caps the day at exactly one send no matter
 * how many ticks qualify. All times are real NOAA sun math via
 * lib/today/golden-hour — never a guessed clock.
 */
export type GoldenPushDecision =
  | { send: false; reason: string }
  | { send: true; dedupeKey: string; title: string; body: string; url: string };

const BAND_MIN_MINUTES = 15;
const BAND_MAX_MINUTES = 40;

function fmtTime(d: Date): string {
  return d
    .toLocaleTimeString("en-US", {
      timeZone: "America/New_York",
      hour: "numeric",
      minute: "2-digit",
    })
    .toLowerCase()
    .replace(" ", "");
}

export function goldenPushDecision(
  now: Date,
  lat: number = FREDERICK_LAT,
  lng: number = FREDERICK_LNG,
): GoldenPushDecision {
  const w = goldenHourWindow(now, lat, lng);
  if (!w) return { send: false, reason: "outside-window" };
  if (w.active) return { send: false, reason: "already-started" };

  const minutesUntil = (w.goldenStart.getTime() - now.getTime()) / 60_000;
  if (minutesUntil < BAND_MIN_MINUTES || minutesUntil > BAND_MAX_MINUTES) {
    return { send: false, reason: "outside-band" };
  }

  return {
    send: true,
    dedupeKey: `golden:${easternDayKey(now)}`,
    title: `Golden hour at ${fmtTime(w.goldenStart)}`,
    body: `The day's best light starts in about half an hour and holds until sunset at ${fmtTime(w.sunset)}.`,
    url: "/today",
  };
}
