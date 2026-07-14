import { getNwsForecast, iconForShortForecast, type NwsForecast, type NwsHourly } from "@/lib/integrations/nws";
import { getAirQuality, pickWorstAqi, type AqiObservation } from "@/lib/integrations/airnow";
import { FREDERICK_CENTER } from "@/lib/geo";
import { sunTimes } from "@/lib/sun";
import { currentSkyPalette } from "@/components/today/SkyHero";
import AnimatedSkyGlyph from "@/components/today/AnimatedSkyGlyph";
import CollapsibleSection from "@/components/ui/CollapsibleSection";

/**
 * PulseWeatherPanel — the weather built INTO the /pulse dashboard as a tall,
 * data-dense, visual panel that uses the vertical (9:16) screen: a time-of-day
 * sky header carrying the big current temp + condition, a realtime stat grid
 * (feels-like, humidity, wind, rain, dewpoint, air quality), an SVG hourly
 * temperature curve with precip bars, the sun's rise/set, and a range-anchored
 * 7-day strip. All real, sourced (NWS + AirNow), refreshed every render.
 *
 * Server component (no client JS). Fail-soft: a feed hiccup degrades the panel
 * to nothing rather than throwing into the page.
 */

const ET = "America/New_York";
const cToF = (c: number) => c * 9 / 5 + 32;
const fmtClock = (d: Date) =>
  new Intl.DateTimeFormat("en-US", { timeZone: ET, hour: "numeric", minute: "2-digit" }).format(d);
const shortDay = (iso: string) =>
  new Intl.DateTimeFormat("en-US", { timeZone: ET, weekday: "short" }).format(new Date(iso));
/** "2 PM" → "2p" for a compact axis tick. */
const compactHour = (iso: string) =>
  new Intl.DateTimeFormat("en-US", { timeZone: ET, hour: "numeric" })
    .format(new Date(iso))
    .replace(" AM", "a")
    .replace(" PM", "p");

const sentence = (s: string) => (s || "").toLowerCase().replace(/^\w/, (c) => c.toUpperCase());
const parseWindMph = (s: string) => {
  const m = (s || "").match(/\d+/);
  return m ? Number(m[0]) : 0;
};

/** NWS-standard apparent temperature: heat index when warm + humid, wind chill
 *  when cold + breezy, else the air temp. Returns a rounded °F. */
function feelsLike(tempF: number, rh: number | undefined, windMph: number): number {
  const T = tempF;
  if (T >= 80 && rh != null) {
    const R = rh;
    const hi =
      -42.379 + 2.04901523 * T + 10.14333127 * R - 0.22475541 * T * R - 0.00683783 * T * T -
      0.05481717 * R * R + 0.00122874 * T * T * R + 0.00085282 * T * R * R - 0.00000199 * T * T * R * R;
    return Math.round(hi);
  }
  if (T <= 50 && windMph > 3) {
    const v = Math.pow(windMph, 0.16);
    return Math.round(35.74 + 0.6215 * T - 35.75 * v + 0.4275 * T * v);
  }
  return Math.round(T);
}

type Day = { label: string; hi?: number; lo?: number };
function buildDays(daily: NwsHourly[]): Day[] {
  const days: Day[] = [];
  for (const p of daily) {
    if (p.isDaytime) {
      days.push({ label: p.startTime ? shortDay(p.startTime) : "", hi: p.temperature });
    } else if (days.length && days[days.length - 1].lo == null) {
      days[days.length - 1].lo = p.temperature;
    } else {
      days.push({ label: p.startTime ? shortDay(p.startTime) : "", lo: p.temperature });
    }
  }
  return days.slice(0, 7);
}

function Stat({ label, value, valueColor }: { label: string; value: string; valueColor?: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="font-mono text-[9px] font-semibold uppercase tracking-[0.12em]" style={{ color: "var(--app-ink-3)" }}>
        {label}
      </span>
      <span className="font-mono text-[14px] font-semibold tabular-nums leading-none" style={{ color: valueColor ?? "var(--app-ink)" }}>
        {value}
      </span>
    </div>
  );
}

/** The hourly temperature curve — an SVG area+line over the next ~12 hours with
 *  precip-chance bars and a "now" marker. The visual centerpiece. */
function HourlyCurve({ hours }: { hours: NwsHourly[] }) {
  const pts = hours.slice(0, 12);
  if (pts.length < 2) return null;
  const W = 324, H = 104, padL = 8, padR = 8, padT = 20, padB = 26;
  const chartH = H - padT - padB;
  const baseY = H - padB;
  const temps = pts.map((p) => p.temperature);
  const min = Math.min(...temps), max = Math.max(...temps);
  const span = max - min || 1;
  const x = (i: number) => padL + (i * (W - padL - padR)) / (pts.length - 1);
  const y = (t: number) => padT + (1 - (t - min) / span) * chartH;

  const line = pts.map((p, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(p.temperature).toFixed(1)}`).join(" ");
  const area = `${line} L${x(pts.length - 1).toFixed(1)},${baseY} L${x(0).toFixed(1)},${baseY} Z`;
  const maxI = temps.indexOf(max);

  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" height="auto" role="img"
      aria-label={`Hourly temperatures: now ${temps[0]}°, peaking ${max}° over the next ${pts.length} hours.`}
      style={{ display: "block" }}>
      <defs>
        <linearGradient id="fr-temp-fill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--app-brand)" stopOpacity="0.28" />
          <stop offset="100%" stopColor="var(--app-brand)" stopOpacity="0.02" />
        </linearGradient>
      </defs>
      {/* precip-chance bars (cool), only where there's a real chance */}
      {pts.map((p, i) => {
        const pop = p.probabilityOfPrecipitation ?? 0;
        if (pop < 5) return null;
        const h = (pop / 100) * (chartH * 0.7);
        return (
          <rect key={`p${i}`} x={x(i) - 4} y={baseY - h} width={8} height={h} rx={2}
            fill="var(--app-cool)" opacity={0.16} />
        );
      })}
      <path d={area} fill="url(#fr-temp-fill)" />
      <path d={line} fill="none" stroke="var(--app-brand)" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
      {/* now marker */}
      <circle cx={x(0)} cy={y(temps[0])} r={3.5} fill="var(--app-brand)" stroke="var(--app-bg-elevated-solid)" strokeWidth={2} />
      {/* temp labels: now + the peak */}
      {[0, maxI].filter((v, idx, a) => a.indexOf(v) === idx).map((i) => (
        <text key={`t${i}`} x={x(i)} y={y(temps[i]) - 7} textAnchor="middle"
          fontFamily="var(--font-mono)" fontSize="11" fontWeight="600" fill="var(--app-ink)">
          {temps[i]}&deg;
        </text>
      ))}
      {/* hour ticks every 3rd hour */}
      {pts.map((p, i) =>
        i % 3 === 0 ? (
          <text key={`h${i}`} x={x(i)} y={H - 8} textAnchor="middle"
            fontFamily="var(--font-mono)" fontSize="9" letterSpacing="0.04em" fill="var(--app-ink-3)">
            {i === 0 ? "NOW" : compactHour(p.startTime)}
          </text>
        ) : null,
      )}
    </svg>
  );
}

/** A range-anchored 7-day strip — each day's lo→hi as a bar across the week's
 *  span (the flood-gauge range language), with mono Hi/Lo. */
function WeekStrip({ days }: { days: Day[] }) {
  const his = days.map((d) => d.hi).filter((n): n is number => n != null);
  const los = days.map((d) => d.lo).filter((n): n is number => n != null);
  if (his.length === 0 && los.length === 0) return null;
  const wMin = Math.min(...los, ...his);
  const wMax = Math.max(...los, ...his);
  const wSpan = wMax - wMin || 1;
  const pct = (v: number) => ((v - wMin) / wSpan) * 100;

  return (
    <div className="space-y-1.5">
      {days.map((d, i) => {
        const lo = d.lo ?? d.hi ?? wMin;
        const hi = d.hi ?? d.lo ?? wMax;
        const left = pct(lo);
        const width = Math.max(6, pct(hi) - pct(lo));
        return (
          <div key={i} className="flex items-center gap-2.5">
            <span className="w-8 shrink-0 font-mono text-[10px] font-semibold uppercase tracking-[0.06em]" style={{ color: i === 0 ? "var(--app-ink)" : "var(--app-ink-3)" }}>
              {i === 0 ? "Today" : d.label}
            </span>
            <span className="w-6 shrink-0 text-right font-mono text-[11px] tabular-nums" style={{ color: "var(--app-ink-3)" }}>
              {d.lo != null ? `${d.lo}°` : ""}
            </span>
            <span className="relative h-1.5 flex-1 overflow-hidden rounded-full" style={{ background: "var(--app-bg-sunken)" }}>
              <span className="absolute inset-y-0 rounded-full"
                style={{
                  left: `${left}%`,
                  width: `${width}%`,
                  background: "linear-gradient(to right, var(--app-cool), var(--app-accent) 60%, var(--app-brand))",
                }} />
            </span>
            <span className="w-6 shrink-0 font-mono text-[11px] font-semibold tabular-nums" style={{ color: "var(--app-ink)" }}>
              {d.hi != null ? `${d.hi}°` : ""}
            </span>
          </div>
        );
      })}
    </div>
  );
}

export default async function PulseWeatherPanel({
  forecast: providedForecast,
  aqiObs: providedAqi,
}: {
  forecast?: NwsForecast | null;
  aqiObs?: AqiObservation[] | null;
} = {}) {
  const [forecast, aqiObs] = providedForecast !== undefined && providedAqi !== undefined
    ? [providedForecast, providedAqi]
    : await Promise.all([
        getNwsForecast(FREDERICK_CENTER).catch(() => null),
        getAirQuality(FREDERICK_CENTER).catch(() => null),
      ]);
  const cur = forecast?.hourly?.[0];
  if (!forecast || !cur) return null;

  const sky = currentSkyPalette();
  const onSky = sky.tone === "dark" ? "var(--app-bg)" : "var(--app-ink)";
  const isDay = sky.tone !== "dark";
  const variant = iconForShortForecast(cur.shortForecast, isDay);
  const condition = sentence(cur.shortForecast);

  const daily = forecast.daily ?? [];
  const high = daily.find((p) => p.isDaytime)?.temperature;
  const low = daily.find((p) => !p.isDaytime)?.temperature;

  const windMph = parseWindMph(cur.windSpeed);
  const feels = feelsLike(cur.temperature, cur.relativeHumidity, windMph);
  const popMax = Math.max(0, ...forecast.hourly.slice(0, 12).map((h) => h.probabilityOfPrecipitation ?? 0));
  const aqi = aqiObs ? pickWorstAqi(aqiObs) : null;
  const sun = sunTimes(new Date(), FREDERICK_CENTER.lat, FREDERICK_CENTER.lng);
  const updated = forecast.asOf ? fmtClock(new Date(forecast.asOf)) : null;
  const days = buildDays(daily);

  return (
    <section
      id="weather"
      aria-label={`Weather in Frederick County: ${cur.temperature} degrees, ${condition}`}
      className="overflow-hidden rounded-[var(--app-radius-lg)] border"
      style={{ borderColor: "var(--app-border)", boxShadow: "var(--app-elev-1)" }}
    >
      {/* SKY HEADER — time-of-day gradient carrying the big current reading. */}
      <div
        className="relative px-4 pb-4 pt-3"
        style={{ background: `linear-gradient(165deg, ${sky.top} 0%, ${sky.mid} 52%, ${sky.bottom} 100%)`, color: onSky }}
      >
        <p className="flex items-center gap-1.5 font-mono text-[10px] font-bold uppercase tracking-[0.16em]" style={{ opacity: 0.85 }}>
          <span aria-hidden className="pulse-dot inline-block h-1.5 w-1.5 rounded-full" style={{ background: "currentColor" }} />
          Live · NWS · Frederick{updated ? ` · ${updated}` : ""}
        </p>
        <div className="mt-1.5 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-baseline gap-1">
              <span className="font-serif text-[60px] font-light leading-[0.9] tabular-nums tracking-tight">{cur.temperature}</span>
              <span className="font-serif text-[28px] font-light leading-none">&deg;</span>
            </div>
            <p className="mt-1 text-[15px] font-semibold leading-tight">{condition}</p>
            <p className="text-[12px] leading-tight" style={{ opacity: 0.82 }}>
              Feels {feels}&deg;
              {high != null && <> · H {high}&deg;</>}
              {low != null && <> · L {low}&deg;</>}
            </p>
          </div>
          <div className="shrink-0" style={{ color: onSky }}>
            <AnimatedSkyGlyph variant={variant} size={64} />
          </div>
        </div>
      </div>

      {/* BODY — the realtime detail, on paper. */}
      <div className="space-y-4 p-4" style={{ backgroundColor: "var(--app-bg-elevated-solid)", backgroundImage: "var(--app-paper-light)" }}>
        {/* realtime stat grid */}
        <div className="grid grid-cols-3 gap-x-3 gap-y-3">
          <Stat label="Feels" value={`${feels}°`} />
          <Stat label="Humidity" value={cur.relativeHumidity != null ? `${cur.relativeHumidity}%` : "-"} />
          <Stat label="Wind" value={`${cur.windDirection} ${windMph}`} />
          <Stat label="Rain" value={`${popMax}%`} />
          <Stat label="Dewpoint" value={cur.dewpointC != null ? `${Math.round(cToF(cur.dewpointC))}°` : "-"} />
          <Stat
            label="Air quality"
            value={aqi ? `${aqi.aqi} ${aqi.category.name.split(" ")[0]}` : "-"}
            valueColor={aqi ? aqi.category.color : undefined}
          />
        </div>

        {/* MORE DETAIL — the deeper forecast (hourly curve, sun, 7-day) is
            revealed on tap, so the card leads with current conditions and the
            depth is one tap away (matching the dashboard tiles' reveal). */}
        <div className="border-t pt-1" style={{ borderColor: "var(--app-border)" }}>
          <CollapsibleSection title="Hourly & 7-day" storageKey="fr.pulse.weather.detail" defaultOpen={false}>
            <div className="space-y-4 pt-1">
              {/* hourly curve */}
              <div className="space-y-1">
                <p className="font-mono text-[9px] font-semibold uppercase tracking-[0.14em]" style={{ color: "var(--app-ink-3)" }}>
                  Next 12 hours
                </p>
                <HourlyCurve hours={forecast.hourly} />
              </div>

              {/* sun */}
              {(sun.sunrise || sun.sunset) && (
                <div className="flex items-center justify-between border-t pt-3 font-mono text-[11px] tabular-nums" style={{ borderColor: "var(--app-border)", color: "var(--app-ink-2)" }}>
                  {sun.sunrise && <span className="uppercase tracking-[0.06em]">↑ Sunrise {fmtClock(sun.sunrise)}</span>}
                  {sun.sunset && <span className="uppercase tracking-[0.06em]">Sunset {fmtClock(sun.sunset)} ↓</span>}
                </div>
              )}

              {/* 7-day */}
              {days.length > 0 && (
                <div className="space-y-2 border-t pt-3" style={{ borderColor: "var(--app-border)" }}>
                  <p className="font-mono text-[9px] font-semibold uppercase tracking-[0.14em]" style={{ color: "var(--app-ink-3)" }}>
                    7-day outlook
                  </p>
                  <WeekStrip days={days} />
                </div>
              )}
            </div>
          </CollapsibleSection>
        </div>
      </div>
    </section>
  );
}
