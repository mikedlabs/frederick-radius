import Link from "next/link";
import { Wind, Droplets, Sunset, Sunrise } from "lucide-react";
import { getNwsForecast, iconForShortForecast } from "@/lib/integrations/nws";
// NWS alerts are rendered separately by CivicAlerts (promoted to the
// very top of /today in PR #100). We deliberately don't refetch them
// here — that was a duplicate fetch leftover from the earlier inline-
// alert design.
import { FREDERICK_CENTER } from "@/lib/geo";
import { weatherVerdict, nextWeatherChange } from "@/lib/weather-verdict";
import { sunTimes, FREDERICK_LAT, FREDERICK_LNG } from "@/lib/almanac";
import WeeklyForecast from "./WeeklyForecast";
import AnimatedSkyGlyph, { type SkyVariant } from "./AnimatedSkyGlyph";
import WeatherHourlyChart from "./WeatherHourlyChart";

/**
 * WeatherHero — the at-a-glance weather card on /now.
 *
 * REDESIGNED for stranger-clarity. The previous shape packed eleven
 * things into one card: temp + glyph + H/L + short forecast + verdict
 * + next change + wind + precip + sun arc + daylight remaining +
 * hourly chart + 7-day. A reader couldn't tell what the answer was.
 *
 * The new shape has three tiers, each answering a different question:
 *
 *   1. HERO       — what is it doing right now?
 *      Sky glyph, huge tabular-nums temp, a single editorial verdict
 *      sentence. That's the headline.
 *
 *   2. STATS ROW  — the four readings a reader scans for next.
 *      H/L, wind, rain chance, sunset clock. One row, monospaced
 *      numerics, no chrome. Reads like a typewriter slug, not a UI.
 *
 *   3. HOURLY     — the next 12 hours.
 *      Owned by WeatherHourlyChart. This component just hands off.
 *      The 7-day rail sits below that as a collapsible section.
 *
 * What got cut: short forecast string (the glyph + verdict carry the
 * meaning), inline next-change italic (folded into the verdict copy
 * via nextWeatherChange below), the sun-arc SVG (the AlmanacFooter
 * at the bottom of /now now anchors the day in sunrise/sunset; the
 * arc was duplicating that), and the "daylight remaining" line for
 * the same reason. Sunset stays as a single stat tile because
 * tonight's sunset is still useful planning data right next to the
 * temp.
 */

function clockLabel(d: Date): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    hour: "numeric",
    minute: "2-digit",
  })
    .format(d)
    .replace(/\s?AM$/i, "a")
    .replace(/\s?PM$/i, "p");
}

export default async function WeatherHero() {
  const forecast = await getNwsForecast(FREDERICK_CENTER).catch(() => null);

  const cur = forecast?.hourly?.[0] ?? null;
  // 12-hour chart — the NWS API caps us at 12 periods anyway, so this
  // is the full hourly outlook handed to the chart component.
  const next12 = forecast?.hourly?.slice(0, 12) ?? [];
  // Today's high/low — the first "isDaytime: true" daily period is
  // today's high (or tomorrow's if we're already past sunset; the
  // NWS API rolls over after dark). Same heuristic for low.
  const today = forecast?.daily ?? [];
  const todayDay = today.find((p) => p.isDaytime);
  const todayNight = today.find((p) => !p.isDaytime);
  const high = todayDay?.temperature;
  const low = todayNight?.temperature;
  const precip = cur?.probabilityOfPrecipitation ?? 0;

  const now = new Date();
  const sun = sunTimes(now, FREDERICK_LAT, FREDERICK_LNG);

  const curVariant: SkyVariant = cur ? iconForShortForecast(cur.shortForecast) : "Cloud";

  // Verdict — the one sentence that turns the forecast into a plan.
  // This is the headline answer below the temp; the typography weight
  // signals it carries the meaning.
  const verdict = cur
    ? weatherVerdict({
        temp: cur.temperature,
        shortForecast: cur.shortForecast,
        precipNow: precip,
        hourly: forecast?.hourly ?? [],
        now,
      })
    : null;

  // Next change — folded into a quiet subtitle under the verdict
  // when present. Removed from a separate italic line because the
  // double-headline read was confusing. One editorial voice, one
  // tier down for the time-stamped heads-up.
  const nextChange = cur && forecast?.hourly
    ? nextWeatherChange({ hourly: forecast.hourly, now })
    : null;
  const verdictColor =
    verdict?.tone === "rough"
      ? "var(--app-cool)"
      : verdict?.tone === "mixed"
        ? "var(--app-ink-2)"
        : "var(--app-ink)";

  // Brand-palette wash. The card lifts from flat paper to a quiet
  // gradient that carries a brand cue tied to the forecast — almanac
  // gold for a good day, Carroll Creek slate for a rough one, sage
  // for the in-between, paper-2 as the default. All tinted at 7-10%
  // over the paper-cream background so the card stays readable and
  // doesn't fight any content on top.
  const accentToken =
    verdict?.tone === "rough"
      ? "var(--app-cool)"
      : verdict?.tone === "mixed"
        ? "var(--app-sage)"
        : verdict?.tone === "good"
          ? "var(--app-accent)"
          : "var(--app-paper-2)";
  const heroBg = `linear-gradient(155deg, var(--app-bg-elevated) 0%, color-mix(in srgb, ${accentToken} 9%, var(--app-bg-elevated)) 100%)`;

  if (!cur) {
    return (
      <article
        className="wx-hero relative overflow-hidden rounded-[var(--app-radius-lg)] p-4"
        style={{ background: heroBg }}
      >
        <p className="text-[12px]" style={{ color: "var(--app-ink-3)" }}>
          Weather is briefly unavailable.
        </p>
      </article>
    );
  }

  return (
    <article
      className="wx-hero tactile tactile-feature relative overflow-hidden rounded-[var(--app-radius-lg)]"
      style={{ background: heroBg }}
    >
      {/* HERO + STATS — wrapped in a Link to /pulse for the deep view.
          Hourly chart + weekly forecast sit OUTSIDE the link so their
          interactive controls (scrub, expand/collapse) don't fight
          the parent navigation intent. */}
      <Link
        href="/pulse"
        aria-label="Current weather — open the full weather board"
        className="block px-4 pt-4 pb-3 transition active:scale-[0.995]"
      >
        {/* HERO: huge temp + sky glyph + verdict. The verdict carries
            the meaning; the short-forecast text used to do this less
            well and is gone. */}
        <div className="flex items-start gap-3">
          <AnimatedSkyGlyph variant={curVariant} size={64} />
          <div className="min-w-0 flex-1">
            <p
              className="font-serif text-[44px] font-semibold leading-none tabular-nums"
              style={{ color: "var(--app-ink)" }}
            >
              {cur.temperature}&deg;
            </p>
            {verdict && (
              <p
                className="mt-1.5 text-[15px] font-semibold leading-snug tracking-tight"
                style={{ color: verdictColor }}
              >
                {verdict.line}
              </p>
            )}
            {nextChange && (
              <p
                className="mt-0.5 text-[12.5px] leading-snug"
                style={{ color: "var(--app-ink-3)" }}
              >
                {nextChange}
              </p>
            )}
          </div>
        </div>

        {/* STATS ROW — four readings, always rendered so the grid is
            a stable 2x2 on mobile and a clean 4-up on tablet+. Missing
            data shows an em-dash placeholder; a 0% rain chance shows
            as "0%" (still useful — it answers "is rain on the table?"
            with a clear no). The Sun tile flips between sunset and
            tomorrow's sunrise depending on whether the user is reading
            before or after dusk, so the label is always the NEXT sun
            event, never a stale one. */}
        <dl
          className="mt-3 grid grid-cols-2 gap-x-3 gap-y-1.5 text-[12px] tabular-nums sm:grid-cols-4"
          style={{ color: "var(--app-ink-3)" }}
        >
          <Stat
            label="High / Low"
            value={
              high !== undefined || low !== undefined ? (
                <>
                  {high !== undefined ? `${high}°` : "—"}
                  <span className="opacity-50">{" / "}</span>
                  {low !== undefined ? `${low}°` : "—"}
                </>
              ) : (
                "—"
              )
            }
          />
          <Stat
            icon={<Wind className="h-3 w-3" strokeWidth={2.25} aria-hidden />}
            label="Wind"
            value={
              cur.windSpeed
                ? `${cur.windSpeed}${cur.windDirection ? ` ${cur.windDirection}` : ""}`
                : "—"
            }
          />
          <Stat
            icon={<Droplets className="h-3 w-3" strokeWidth={2.25} aria-hidden />}
            label="Rain"
            value={`${precip}%`}
            valueColor={precip >= 50 ? "var(--app-cool)" : undefined}
          />
          {(() => {
            // Show whichever sun event is NEXT — sunset before dusk,
            // tomorrow's sunrise after. Reading "Sunset 8:23p" at 10pm
            // is stale; "Sunrise 6:42a" is the actionable answer.
            if (!sun) {
              return <Stat icon={<Sunset className="h-3 w-3" strokeWidth={2.25} aria-hidden />} label="Sunset" value="—" />;
            }
            if (now < sun.sunset) {
              return (
                <Stat
                  icon={<Sunset className="h-3 w-3" strokeWidth={2.25} aria-hidden />}
                  label="Sunset"
                  value={clockLabel(sun.sunset)}
                />
              );
            }
            const tomorrow = sunTimes(
              new Date(now.getTime() + 86_400_000),
              FREDERICK_LAT,
              FREDERICK_LNG,
            );
            if (!tomorrow) {
              return <Stat icon={<Sunrise className="h-3 w-3" strokeWidth={2.25} aria-hidden />} label="Sunrise" value="—" />;
            }
            return (
              <Stat
                icon={<Sunrise className="h-3 w-3" strokeWidth={2.25} aria-hidden />}
                label="Sunrise"
                value={clockLabel(tomorrow.sunrise)}
              />
            );
          })()}
        </dl>
      </Link>

      {/* HOURLY — interactive scrub, NOT nested in the /pulse link.
          The scrub's pointer events would otherwise double-fire a
          page navigation on every drag. */}
      {next12.length > 0 && <WeatherHourlyChart hours={next12} />}

      {/* WEEKLY — collapsible 7-day rail. Same containment rules. */}
      {forecast?.daily && forecast.daily.length > 0 && (
        <div style={{ borderTop: "1px solid var(--app-border)" }}>
          <WeeklyForecast daily={forecast.daily} />
        </div>
      )}
    </article>
  );
}

/**
 * A single stat tile in the row below the hero. Label sits above the
 * value, both lines small and quiet — the hero up top is doing all
 * the typographic work, so this row reads as a typewriter slug.
 */
function Stat({
  icon,
  label,
  value,
  valueColor,
}: {
  icon?: React.ReactNode;
  label: string;
  value: React.ReactNode;
  valueColor?: string;
}) {
  return (
    <div className="flex min-w-0 flex-col">
      <dt
        className="inline-flex items-center gap-1 text-[10px] font-medium uppercase tracking-[0.08em]"
        style={{ color: "var(--app-ink-3)" }}
      >
        {icon}
        {label}
      </dt>
      <dd
        className="truncate text-[13.5px] font-semibold"
        style={{ color: valueColor ?? "var(--app-ink-2)" }}
      >
        {value}
      </dd>
    </div>
  );
}
