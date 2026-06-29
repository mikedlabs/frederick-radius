import Link from "next/link";
import { Umbrella } from "lucide-react";
import { getNwsForecast } from "@/lib/integrations/nws";
import { FREDERICK_CENTER } from "@/lib/geo";
import { weatherNudge } from "@/lib/weather-nudge";

/**
 * WeatherNudge — a streamed, weather-aware FIELD MOVE for the /today masthead.
 * Where NowIntel describes the weather ("Wet out, an indoor kind of day"), this
 * adds the ACTION: on a stormy / snowy / actively-wet / hard-cold / hard-hot
 * hour it points at the indoor (rainy-day) collection. Honest: it fires only on
 * real adverse NWS readings and self-hides on an ordinary hour.
 *
 * Same cached forecast call as NowIntel (Next's data cache de-dupes it in one
 * render, so this adds no network round-trip), and it streams in its OWN
 * Suspense via MastheadNotes, so it never blocks the I-want grid's first paint.
 */
export default async function WeatherNudge() {
  const forecast = await getNwsForecast(FREDERICK_CENTER).catch(() => null);
  const cur = forecast?.hourly?.[0];
  if (!cur) return null;

  const nudge = weatherNudge({
    temp: cur.temperature,
    shortForecast: cur.shortForecast,
    precipNow: cur.probabilityOfPrecipitation ?? 0,
  });
  if (!nudge) return null;

  return (
    <p className="flex flex-wrap items-center gap-x-1.5 text-[12.5px]" style={{ color: "var(--app-ink-2)" }}>
      <Umbrella className="h-3.5 w-3.5 shrink-0" strokeWidth={2} aria-hidden style={{ color: "var(--app-cool)" }} />
      <span className="font-semibold" style={{ color: "var(--app-ink)" }}>{nudge.lead}</span>
      <Link href={nudge.href} className="font-semibold" style={{ color: "var(--app-brand-press)" }}>
        {nudge.cta} →
      </Link>
    </p>
  );
}
