/**
 * Daily-briefing fanout cron — "Today in Frederick", every morning at 8.
 *
 * Composes a one-line briefing from NWS today's forecast + the same
 * cache-warmed public event board used by Today, Events, and Map, then fans
 * it out to subscribers opted into the "daily-briefing" topic. This is the
 * marquee daily-return tool: the reason a resident keeps the app installed.
 *
 * Timing: Vercel cron runs in UTC, so we schedule BOTH 12:03 and 13:03
 * UTC (vercel.json) and let the route itself proceed only when it is 8am
 * Eastern — that lands it at 8am local year-round across DST without any
 * timezone math in the schedule. The three-minute offset follows the
 * minute-zero event warm-up instead of racing it. The dedupe key is the
 * Eastern date, so even if both invocations ever passed the hour gate, only
 * the first actually sends (fanoutToTopic claims the (topic, key) pair once).
 *
 * Honest content: each part self-omits when its data is missing; we
 * never push a fabricated temperature or event count. If we have nothing
 * useful to say, we say nothing (no empty 8am buzz).
 *
 * Auth: same CRON_SECRET bearer as the other cron paths.
 */
import { NextResponse } from "next/server";
import { verifyCronAuth } from "../../ingest/_auth";
import { fanoutToTopic } from "@/lib/push-fanout";
import { configurePush } from "@/lib/push";
import { getNwsForecast } from "@/lib/integrations/nws";
import { assembleUnifiedEvents } from "@/lib/loaders/unifiedEvents";
import { FREDERICK_CENTER } from "@/lib/geo";
import { frederickHour } from "@/lib/search-suggestions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

/** Eastern YYYY-MM-DD for a date — the per-day dedupe key. */
function easternDateKey(d: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(d);
}

export async function GET(request: Request) {
  const auth = verifyCronAuth(request);
  if (auth) return auth;

  // Hour gate: only the 8am-Eastern invocation proceeds (see header).
  const hour = frederickHour();
  if (hour !== 8) {
    return NextResponse.json({ ok: true, skipped: `not 8am ET (is ${hour})` });
  }

  if (!configurePush()) {
    return NextResponse.json({ ok: true, skipped: "VAPID not configured" });
  }

  const now = new Date();

  // Compose from the same cache-warmed board every public event surface uses.
  // Calling getLiveEvents directly here used to start a second countywide
  // source refresh at the same minute as warm-events just to count one day.
  const [fc, eventBoard] = await Promise.all([
    getNwsForecast(FREDERICK_CENTER).catch(() => null),
    assembleUnifiedEvents(now).catch(() => null),
  ]);

  const todayKey = easternDateKey(now);

  // daily[0] is today's daytime period — high + short forecast.
  const today = fc?.daily?.[0];
  const weatherStr =
    today && typeof today.temperature === "number"
      ? `Today's forecast is ${today.temperature}°${today.temperatureUnit ?? "F"} with ${today.shortForecast.toLowerCase()}.`
      : null;

  const todayCount = (eventBoard?.publicEvents ?? []).filter(
    (e) => easternDateKey(new Date(e.starts_at)) === todayKey,
  ).length;

  const parts: string[] = [];
  if (weatherStr) parts.push(weatherStr);
  if (todayCount > 0) {
    parts.push(`${todayCount} listed event${todayCount === 1 ? " is" : "s are"} happening today.`);
  }

  // Nothing trustworthy to say → stay silent (no empty morning buzz).
  if (parts.length === 0) {
    return NextResponse.json({ ok: true, skipped: "no briefing content", date: todayKey });
  }

  const result = await fanoutToTopic("daily-briefing", `briefing:${todayKey}`, {
    title: "Today in Frederick",
    body: parts.join(" "),
    url: "/today",
    tag: `briefing:${todayKey}`,
  });

  return NextResponse.json({
    ran_at: new Date().toISOString(),
    date: todayKey,
    body: parts.join(" "),
    ...result,
  });
}
