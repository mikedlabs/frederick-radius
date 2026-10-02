import { CloudSun, ChevronRight } from "lucide-react";
import { getNwsForecast } from "@/lib/integrations/nws";
import { FREDERICK_CENTER } from "@/lib/geo";
import { withDeadlineFallback } from "@/lib/promise-deadline";
import { withBrowseReturnTo } from "@/lib/browse-return";

export default async function TonightWeather({ startsAt, returnTo }: { startsAt: string; returnTo: string }) {
  const forecast = await withDeadlineFallback(getNwsForecast(FREDERICK_CENTER), 2_500, null);
  const at = new Date(startsAt).getTime();
  const period = forecast?.hourly.find((row) => new Date(row.startTime).getTime() <= at && at < new Date(row.endTime).getTime());
  // The shared provider intentionally returns only the next 12 hourly
  // periods. An early-morning evening request can fall beyond that preview
  // even when NWS is healthy; do not describe that as a missing forecast.
  const hourlyEnds = (forecast?.hourly ?? [])
    .map((row) => Date.parse(row.endTime))
    .filter(Number.isFinite);
  const beyondPreview = Boolean(forecast?.asOf && hourlyEnds.length > 0 &&
    at >= Math.max(...hourlyEnds));
  const reading = period && forecast?.asOf
    ? `${period.temperature}°${period.temperatureUnit} · ${period.shortForecast}`
    : beyondPreview
      ? "Tonight is beyond the hourly preview."
      : "Frederick’s hourly forecast for tonight is unavailable.";
  // Open the existing standalone Pulse board. A client-intercepted Pulse
  // overview would put its forecast sheet inside a second route drawer.
  const href = withBrowseReturnTo("/pulse?open=weather", returnTo);
  return (
    <a href={href}
      className="flex min-h-11 items-center gap-2.5 py-2 text-[15px]" style={{ color: "var(--app-ink-2)" }}>
      <CloudSun className="h-5 w-5 shrink-0" aria-hidden style={{ color: "var(--app-cool)" }} />
      <span className="min-w-0 flex-1"><span className="font-semibold">{reading}</span><span className="ml-2 text-[11px]" style={{ color: "var(--app-ink-3)" }}>{period && forecast?.asOf ? "NWS forecast for Frederick" : "Check Frederick’s NWS forecast"}</span></span>
      <ChevronRight className="h-4 w-4 shrink-0" aria-hidden />
    </a>
  );
}
