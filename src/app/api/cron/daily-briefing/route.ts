/**
 * Daily-briefing fanout cron — "Today in Frederick", every morning at 8.
 *
 * Composes a one-line briefing from LIVE data (NWS today's forecast +
 * the live event count for today) and fans it out to subscribers opted
 * into the "daily-briefing" topic. This is the marquee daily-return
 * tool: the reason a resident keeps the app installed.
 *
 * Timing: Vercel cron runs in UTC, so we schedule BOTH 12:00 and 13:00
 * UTC (vercel.json) and let the route itself proceed only when it is 8am
 * Eastern — that lands it at 8am local year-round across DST without any
 * timezone math in the schedule. The dedupe key is the Eastern date, so
 * even if both invocations ever passed the hour gate, only the first
 * actually sends (fanoutToTopic claims the (topic, key) pair once).
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
import { getLiveEvents } from "@/lib/integrations/ical-live";
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

  // ── Compose from live data (both fail soft) ──────────────────────
  const [fc, live] = await Promise.all([
    getNwsForecast(FREDERICK_CENTER).catch(() => null),
    getLiveEvents(1).catch(() => ({ events: [] as Array<{ starts_at: string }> })),
  ]);

  const todayKey = easternDateKey(new Date());

  // daily[0] is today's daytime period — high + short forecast.
  const today = fc?.daily?.[0];
  const weatherStr =
    today && typeof today.temperature === "number"
      ? `${today.temperature}°${today.temperatureUnit ?? "F"} · ${today.shortForecast}`
      : null;

  const todayCount = (live.events ?? []).filter(
    (e) => easternDateKey(new Date(e.starts_at)) === todayKey,
  ).length;

  const parts: string[] = [];
  if (weatherStr) parts.push(weatherStr);
  if (todayCount > 0) parts.push(`${todayCount} thing${todayCount === 1 ? "" : "s"} on today`);

  // Nothing trustworthy to say → stay silent (no empty morning buzz).
  if (parts.length === 0) {
    return NextResponse.json({ ok: true, skipped: "no briefing content", date: todayKey });
  }

  const result = await fanoutToTopic("daily-briefing", `briefing:${todayKey}`, {
    title: "Today in Frederick",
    body: parts.join(" · "),
    url: "/today",
    tag: `briefing:${todayKey}`,
  });

  return NextResponse.json({
    ran_at: new Date().toISOString(),
    date: todayKey,
    body: parts.join(" · "),
    ...result,
  });
}
