import type { Metadata } from "next";
import ProtoFrame from "@/components/proto/ProtoFrame";
import { sunTimes, nextSunHint } from "@/lib/sun";
import { moonPhase, daylightDelta, FREDERICK_LAT, FREDERICK_LNG } from "@/lib/almanac";
import { FREDERICK_CENTER } from "@/lib/geo";
import { getNwsForecast } from "@/lib/integrations/nws";
import { getNwsAlerts } from "@/lib/integrations/nws-alerts";
import { getFrederickWaterSites, type WaterSite } from "@/lib/integrations/usgsWater";
import { getAirQuality, pickWorstAqi } from "@/lib/integrations/airnow";
import { getMarcBoard } from "@/lib/integrations/marcTrains";

export const metadata: Metadata = { robots: { index: false, follow: false }, title: "Prototype: the Almanac" };
export const dynamic = "force-dynamic";

const ET = (opts: Intl.DateTimeFormatOptions) =>
  new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", ...opts });
const fmtTime = (d: Date | null) => (d ? ET({ hour: "numeric", minute: "2-digit" }).format(d) : "·");

/**
 * Seasonal note — a computed "what the county is doing right now" line from the
 * calendar alone (no feed). Frederick County, MD (USDA 6b/7a): bloom, fireflies,
 * peak foliage, frost windows. A new kind of data point: the living calendar.
 */
function seasonalNote(now: Date): { label: string; note: string } {
  const [m, d] = ET({ month: "numeric", day: "numeric" }).format(now).split("/").map(Number);
  const md = m * 100 + d;
  if (md >= 315 && md <= 415) return { label: "Spring bloom", note: "Daffodils usually appear first, followed by cherry and dogwood blooms. The last frost is typically mid-April." };
  if (md >= 416 && md <= 531) return { label: "Late spring", note: "The usual frost window has passed by late spring, when redbuds and azaleas bloom as the mountains turn green." };
  if (md >= 601 && md <= 630) return { label: "Firefly season", note: "Fireflies usually peak after dusk in the meadows and along the creek lines." };
  if (md >= 701 && md <= 815) return { label: "High summer", note: "Long summer light warms the creeks and brings produce to orchards and farm stands." };
  if (md >= 816 && md <= 930) return { label: "Late summer", note: "The first cool nights signal the move toward fall." };
  if (md >= 1001 && md <= 1115) return { label: "Peak foliage", note: "Color on the Catoctin ridge usually peaks in mid-to-late October." };
  if (md >= 1116 || md <= 131) return { label: "Bare-tree winter", note: "Bare trees open long sightlines on the ridge, and winter often brings the clearest dark skies of the year." };
  return { label: "Early spring", note: "Sap begins to rise as the first green appears at the field edges." };
}

function MoonDisc({ illumination, waxing }: { illumination: number; waxing: boolean }) {
  // A simple lit-disc: a dark circle with a lit cap whose width tracks
  // illumination, mirrored for waxing vs waning.
  const w = Math.round(illumination * 100);
  return (
    <div aria-hidden className="relative h-9 w-9 overflow-hidden rounded-full" style={{ background: "var(--app-ink-tint-2)", border: "1px solid var(--app-border)" }}>
      <div
        className="absolute inset-y-0"
        style={{
          width: `${w}%`,
          [waxing ? "right" : "left"]: 0,
          background: "var(--app-accent)",
        }}
      />
    </div>
  );
}

function Card({ label, children, accent }: { label: string; children: React.ReactNode; accent?: string }) {
  return (
    <div
      className="relative overflow-hidden rounded-[var(--app-radius-lg)] border p-4"
      style={{ borderColor: "var(--app-border)", background: "var(--app-bg-elevated-solid)", boxShadow: "var(--app-edge), var(--app-hi)" }}
    >
      <p className="font-mono text-[10px] font-bold uppercase tracking-[0.18em]" style={{ color: accent ?? "var(--app-ink-3)" }}>{label}</p>
      <div className="mt-1.5">{children}</div>
    </div>
  );
}

const Big = ({ children }: { children: React.ReactNode }) => (
  <p className="font-serif text-[22px] font-semibold leading-tight tracking-tight" style={{ color: "var(--app-ink)" }}>{children}</p>
);
const Sub = ({ children }: { children: React.ReactNode }) => (
  <p className="mt-0.5 text-[12.5px] leading-snug" style={{ color: "var(--app-ink-2)" }}>{children}</p>
);

export default async function Page() {
  const now = new Date();

  // Computed (keyless, instant): sky, daylight, moon, season.
  const sun = sunTimes(now, FREDERICK_LAT, FREDERICK_LNG);
  const hint = nextSunHint(now, FREDERICK_LAT, FREDERICK_LNG);
  const delta = daylightDelta(now);
  const moon = moonPhase(now);
  const season = seasonalNote(now);

  // Live (network, fail-soft): weather, alerts, water, air, rail.
  const [fc, alerts, water, air, marc] = await Promise.all([
    getNwsForecast(FREDERICK_CENTER).catch(() => null),
    getNwsAlerts().catch(() => []),
    getFrederickWaterSites().catch(() => [] as WaterSite[]),
    getAirQuality(FREDERICK_CENTER).catch(() => null),
    getMarcBoard(now).catch(() => null),
  ]);

  const wxNow = fc?.hourly?.[0] ?? fc?.daily?.[0] ?? null;
  const alert = alerts[0] ?? null;
  const monocacy = water.find((w) => /MONOCACY/i.test(w.river)) ?? water[0] ?? null;
  const floodNote = (() => {
    if (!monocacy?.floodStages || monocacy.gageHeightFt == null) return null;
    const g = monocacy.gageHeightFt;
    const s = monocacy.floodStages;
    if (g >= s.minor) return { word: "Flooding", color: "var(--app-brand)" };
    if (g >= s.action) return { word: "Above normal · watch", color: "var(--app-accent)" };
    return { word: "Normal", color: "var(--app-brand-2)" };
  })();
  const worstAqi = air ? pickWorstAqi(air) : null;
  const nextTrains = marc?.serviceToday
    ? marc.stations.reduce(
        (n, s) => n + Object.values(s.departures).reduce((a, arr) => a + arr.length, 0),
        0,
      )
    : 0;
  const dl = delta ? (delta.deltaMinutes >= 0 ? `+${delta.deltaMinutes}m` : `${delta.deltaMinutes}m`) : null;

  return (
    <ProtoFrame
      title="The Almanac"
      blurb="One calm screen that reveals the living state of the county right now: sky, light, moon, weather, water, air, rail, and the season's own calendar. Composed from data already wired; fail-soft per instrument."
    >
      <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
        {/* SKY + LIGHT */}
        <Card label="Sky · today's light" accent="var(--app-accent)">
          <Big>
            {fmtTime(sun.sunrise)} <span style={{ color: "var(--app-ink-3)" }}>→</span> {fmtTime(sun.sunset)}
          </Big>
          <Sub>
            {hint ? `${hint.label}: ${fmtTime(hint.from)}–${fmtTime(hint.to ?? null)}` : "Golden hour has passed"}
            {sun.dusk ? ` · dark by ${fmtTime(sun.dusk)}` : ""}
            {dl ? ` · ${dl} of daylight vs yesterday` : ""}
          </Sub>
        </Card>

        {/* MOON */}
        <Card label="Moon">
          <div className="flex items-center gap-3">
            <MoonDisc illumination={moon.illumination} waxing={moon.cycle < 14.77} />
            <div>
              <Big>{moon.name}</Big>
              <Sub>
                {Math.round(moon.illumination * 100)}% lit ·{" "}
                {moon.daysToFull === 0 ? "full tonight" : `${moon.daysToFull}d to full`}
              </Sub>
            </div>
          </div>
        </Card>

        {/* WEATHER + ALERTS */}
        <Card label="Weather" accent={alert ? "var(--app-brand)" : undefined}>
          {wxNow ? (
            <>
              <Big>{wxNow.temperature}°{wxNow.temperatureUnit} · {wxNow.shortForecast}</Big>
              <Sub>
                {alert ? (
                  <span style={{ color: "var(--app-brand)" }}>⚠ {alert.event ?? "Active weather alert"}</span>
                ) : (
                  `Wind ${wxNow.windSpeed}${wxNow.probabilityOfPrecipitation != null ? ` · ${wxNow.probabilityOfPrecipitation}% precip` : ""}`
                )}
              </Sub>
            </>
          ) : (
            <Sub>Forecast unavailable right now.</Sub>
          )}
        </Card>

        {/* WATER */}
        <Card label="Water · creeks & rivers" accent={floodNote?.color}>
          {monocacy ? (
            <>
              <Big>
                {monocacy.river.replace(/\b\w/g, (c) => c.toUpperCase())}
                {monocacy.gageHeightFt != null ? ` · ${monocacy.gageHeightFt.toFixed(1)} ft` : ""}
              </Big>
              <Sub>
                {floodNote ? <span style={{ color: floodNote.color }}>{floodNote.word}</span> : "Gage height"}
                {monocacy.streamflowCfs != null ? ` · ${Math.round(monocacy.streamflowCfs).toLocaleString()} ft³/s` : ""}
                {` · ${water.length} gages countywide`}
              </Sub>
            </>
          ) : (
            <Sub>USGS gage data unavailable right now.</Sub>
          )}
        </Card>

        {/* AIR */}
        <Card label="Air quality" accent={worstAqi?.category.color}>
          {worstAqi ? (
            <>
              <Big>AQI {worstAqi.aqi} · {worstAqi.category.name}</Big>
              <Sub>{worstAqi.parameter} · {worstAqi.reportingArea}</Sub>
            </>
          ) : (
            <Sub>Air-quality feed not configured (needs AIRNOW_API_KEY).</Sub>
          )}
        </Card>

        {/* RAIL */}
        <Card label="Rail · MARC Brunswick line">
          {marc?.serviceToday ? (
            <>
              <Big>{nextTrains} departures ahead</Big>
              <Sub>Brunswick · Point of Rocks · Frederick stops</Sub>
            </>
          ) : (
            <>
              <Big>No service today</Big>
              <Sub>Weekday commuter service only.</Sub>
            </>
          )}
        </Card>

        {/* SEASON — the living calendar */}
        <div className="sm:col-span-2">
          <Card label="The season" accent="var(--app-brand-2)">
            <Big>{season.label}</Big>
            <Sub>{season.note}</Sub>
          </Card>
        </div>
      </div>
    </ProtoFrame>
  );
}
