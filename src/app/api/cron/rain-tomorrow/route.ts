/**
 * /api/cron/rain-tomorrow — an evening "rain likely tomorrow, plan indoors"
 * nudge. Distinct from the morning daily-briefing (that reports the day you're
 * in; this one lets you PLAN AHEAD) and only fires on genuinely wet days, with
 * a direct link to the indoor "Rainy day Frederick" collection.
 *
 * SHIPS OFF. It no-ops until the owner sets RAIN_TOMORROW_ENABLED=1 in Vercel,
 * so it can never surprise testers before the owner turns it on. Sends through
 * fanoutToTopic, so it honors quiet hours and dedupes to one send per day.
 *
 * Auth: the same CRON_SECRET bearer as every other cron path.
 */
import { NextResponse } from "next/server";
import { verifyCronAuth } from "../../ingest/_auth";
import { fanoutToTopic } from "@/lib/push-fanout";
import { configurePush } from "@/lib/push";
import { getNwsForecast } from "@/lib/integrations/nws";
import { FREDERICK_CENTER } from "@/lib/geo";
import { frederickHour } from "@/lib/search-suggestions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

function easternDateKey(d: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(d);
}

const RAIN_RX = /\b(rain|showers?|thunderstorm|t-?storm|drizzle)\b/i;
const POP_THRESHOLD = 55;

export async function GET(request: Request) {
  const auth = verifyCronAuth(request);
  if (auth) return auth;

  // Ships OFF: the owner flips RAIN_TOMORROW_ENABLED=1 in Vercel to go live.
  if (process.env.RAIN_TOMORROW_ENABLED !== "1") {
    return NextResponse.json({ ok: true, skipped: "RAIN_TOMORROW_ENABLED not set" });
  }

  // Evening gate: only the 6pm-ET invocation runs (the schedule fires at both
  // EST/EDT offsets; the dedupe key collapses that to one send).
  const hour = frederickHour();
  if (hour !== 18) return NextResponse.json({ ok: true, skipped: `not 6pm ET (is ${hour})` });

  if (!configurePush()) return NextResponse.json({ ok: true, skipped: "VAPID not configured" });

  const fc = await getNwsForecast(FREDERICK_CENTER).catch(() => null);
  // At 6pm ET tonight is the first daily period (isDaytime false), so the first
  // daytime period is tomorrow's.
  const tomorrow = fc?.daily?.find((p) => p.isDaytime);
  if (!tomorrow) return NextResponse.json({ ok: true, skipped: "no forecast" });

  const pop = tomorrow.probabilityOfPrecipitation ?? 0;
  const rainy = pop >= POP_THRESHOLD || RAIN_RX.test(tomorrow.shortForecast);
  if (!rainy) {
    return NextResponse.json({ ok: true, skipped: "dry tomorrow", pop, forecast: tomorrow.shortForecast });
  }

  const tomorrowKey = easternDateKey(new Date(Date.now() + 24 * 3_600_000));
  const result = await fanoutToTopic("daily-briefing", `rain-tmrw:${tomorrowKey}`, {
    title: "Rain likely tomorrow",
    body: `${tomorrow.shortForecast}. The rainy-day collection has indoor options around Frederick County.`,
    url: "/collections/rainy-day-frederick",
    tag: `rain-tmrw:${tomorrowKey}`,
  });

  return NextResponse.json({
    ran_at: new Date().toISOString(),
    date: tomorrowKey,
    pop,
    forecast: tomorrow.shortForecast,
    ...result,
  });
}
