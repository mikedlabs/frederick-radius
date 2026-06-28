import Link from "next/link";
import { Martini, Sun, Cloud, CloudRain } from "lucide-react";
import { getNwsForecast } from "@/lib/integrations/nws";
import { FREDERICK_CENTER } from "@/lib/geo";
import { weatherVerdict } from "@/lib/weather-verdict";
import { placesWithFieldHappyHour } from "@/lib/loaders/fieldNotes";
import { happyHourStatus } from "@/lib/happyHour";

/**
 * NowIntel — one calm "right now" line above the I-want-to grid. Turns browse
 * into a smart nudge: today's weather verdict ("Clear and easy, a patio
 * evening") plus, when any are live, a count of happy hours on RIGHT NOW
 * (linked). Both are honest, time-live, and cheap — the forecast is the same
 * cached call the hero uses, and the happy-hour count is the small verified
 * Field Notes moat, not a full places scan. Self-hides when there's nothing to
 * say. Streamed in its own Suspense boundary so it never blocks the shell.
 */
export default async function NowIntel({ now }: { now: Date }) {
  const forecast = await getNwsForecast(FREDERICK_CENTER).catch(() => null);
  const cur = forecast?.hourly?.[0] ?? null;
  const verdict =
    cur && forecast
      ? weatherVerdict({
          temp: cur.temperature,
          shortForecast: cur.shortForecast,
          precipNow: cur.probabilityOfPrecipitation ?? 0,
          hourly: forecast.hourly,
          now,
        })
      : null;

  const happyNow = placesWithFieldHappyHour().filter(
    (v) => happyHourStatus(v.happy_hour.schedule, now).state === "now",
  ).length;

  if (!verdict && happyNow === 0) return null;

  const Wx = verdict?.tone === "rough" ? CloudRain : verdict?.tone === "mixed" ? Cloud : Sun;
  const wxColor =
    verdict?.tone === "rough"
      ? "var(--app-warning)"
      : verdict?.tone === "mixed"
        ? "var(--app-ink-3)"
        : "var(--app-accent)";

  return (
    <p className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[12.5px]" style={{ color: "var(--app-ink-2)" }}>
      {verdict && (
        // Tappable: the verdict reads "patio evening" / "a wet one", so the
        // natural next tap is the full forecast. Links to /pulse#weather.
        <Link href="/pulse#weather" className="inline-flex items-center gap-1">
          <Wx className="h-3.5 w-3.5 shrink-0" strokeWidth={2} aria-hidden style={{ color: wxColor }} />
          {verdict.line}
        </Link>
      )}
      {verdict && happyNow > 0 && (
        <span aria-hidden style={{ color: "var(--app-ink-3)" }}>·</span>
      )}
      {happyNow > 0 && (
        <Link href="/happy-hour" className="inline-flex items-center gap-1 font-semibold" style={{ color: "var(--app-brand)" }}>
          <Martini className="h-3.5 w-3.5 shrink-0" strokeWidth={2} aria-hidden />
          {happyNow} happy hour{happyNow === 1 ? "" : "s"} on now
        </Link>
      )}
    </p>
  );
}
