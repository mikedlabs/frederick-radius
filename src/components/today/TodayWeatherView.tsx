import type { ReactNode } from "react";
import { ChevronRight } from "lucide-react";
import AppTransitionLink from "@/components/nav/AppTransitionLink";
import AnimatedSkyGlyph, { type SkyVariant } from "./AnimatedSkyGlyph";
import styles from "./TodayCard.module.css";

export type TodayWeatherViewProps = {
  /** Presentation only. Masthead keeps routine detail behind an explicit disclosure. */
  density?: "standard" | "masthead";
  headline: string;
  condition: string;
  temperatureF: number | null;
  highF: number | null;
  sun: { label: string; time: string } | null;
  variant: SkyVariant | null;
  forecastAvailable: boolean;
  issuedAt: string | null;
  safetyNote: string | null;
  daylight?: ReactNode;
  children?: ReactNode;
};

/** NWS issuance is provider evidence, never the clock that rendered the card.
 * Include the date so yesterday's cached issue cannot read as today's update. */
function forecastIssuance(value: string | null) {
  if (!value?.trim()) return null;
  const issued = new Date(value);
  if (!Number.isFinite(issued.getTime())) return null;
  return {
    dateTime: issued.toISOString(),
    label: new Intl.DateTimeFormat("en-US", {
      timeZone: "America/New_York",
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
      timeZoneName: "short",
    }).format(issued),
  };
}

function FullForecastLink() {
  return (
    <AppTransitionLink href="/pulse?open=weather" prefetch={false} tabIndex={0} className={styles.forecastLink}>
      <span>Full forecast</span><ChevronRight aria-hidden className="h-4 w-4" />
      <span className="sr-only"> for Frederick.</span>
    </AppTransitionLink>
  );
}

/** Suspense keeps the existing forecast route available without claiming a read. */
export function WeatherPending() {
  return (
    <section aria-label="Loading Frederick forecast" data-weather-state="pending"
      className={`${styles.unavailable} ${styles.masthead} ${styles.pending}`}>
      <span data-weather-message>Loading forecast…</span>
      <FullForecastLink />
    </section>
  );
}

export function WeatherUnavailable({ density = "standard" }: { density?: TodayWeatherViewProps["density"] } = {}) {
  return (
    <section
      aria-label="Weather unavailable"
      data-weather-state="unavailable"
      data-weather-density={density}
      className={`${styles.unavailable} ${density === "masthead" ? styles.masthead : ""}`}
    >
      <span data-weather-message>The NWS forecast is briefly unavailable.</span>
      {density === "masthead" ? <FullForecastLink /> : <span className={styles.handoff}>County status</span>}
    </section>
  );
}

/** Shared factual presentation. Provider reads, verdicts, sun calculations,
 * live daylight, and offline capture remain owned by the server composition. */
export default function TodayWeatherView({
  headline, condition, temperatureF, highF, sun, variant,
  forecastAvailable, issuedAt, safetyNote, daylight, children, density = "standard",
}: TodayWeatherViewProps) {
  const issuance = forecastIssuance(issuedAt);
  const hasDistinctRead = Boolean(headline && headline !== condition);
  const Condition = hasDistinctRead ? "p" : "h2";
  const provenance = (
    <>
      <p data-weather-source className={styles.source}>NWS forecast · Frederick</p>
      <p data-weather-issuance className={styles.issuance}>
        {issuance ? <>Issued <time dateTime={issuance.dateTime}>{issuance.label}</time></> : "Issue time unavailable"}
      </p>
    </>
  );

  if (density === "masthead") {
    return (
      <section
        aria-label="Today in Frederick"
        data-weather-state={forecastAvailable ? "available" : "safety-only"}
        data-weather-density={density}
        className={`${styles.card} ${styles.masthead}`}
      >
        {children}
        {/* The civic banner is an independent bounded read. Keep this warning
            visible even when that banner is absent or shows another source. */}
        {hasDistinctRead && <h2 data-weather-headline className={styles.headline}>{headline}</h2>}
        {forecastAvailable ? (
          <details className={styles.forecastDetails}>
            <summary data-today-weather-summary>
              <span className="sr-only">Forecast details for Frederick. </span>
              <span className={styles.reading}>
                {temperatureF !== null && (
                  <span data-weather-temperature className={styles.temperature}>
                    <span className="sr-only">{temperatureF} degrees Fahrenheit forecast</span>
                    <span aria-hidden="true">{temperatureF}°</span>
                  </span>
                )}
                {variant && <AnimatedSkyGlyph as="span" variant={variant} size={28} className={styles.glyph} />}
                <span className={styles.details}>
                  {condition && <span data-weather-condition className={styles.condition}>{condition}</span>}
                  <span data-weather-scope className={styles.forecastType}>Frederick · NWS</span>
                </span>
                <span data-weather-disclosure-cue className={styles.summaryCue} aria-hidden="true">Details<ChevronRight className="h-4 w-4" /></span>
              </span>
            </summary>
            <div className={styles.forecastEvidence}>
              {provenance}
              {(highF !== null || sun || daylight) && (
                <p data-weather-stats className={styles.stats}>
                  {highF !== null && <span>{`High ${highF}°`}</span>}
                  {(sun || daylight) && <span>{sun ? `${sun.label} ${sun.time}` : null}{daylight}</span>}
                </p>
              )}
              <FullForecastLink />
            </div>
          </details>
        ) : (
          <>
            <p data-weather-message className={styles.safetyNote}>The NWS forecast is briefly unavailable.</p>
            <FullForecastLink />
          </>
        )}
        {safetyNote && <p data-weather-safety-note className={styles.safetyNote}>{safetyNote}</p>}
      </section>
    );
  }

  return (
    <section
      aria-label="Today in Frederick"
      data-weather-state={forecastAvailable ? "available" : "safety-only"}
      data-weather-density={density}
      className={styles.card}
    >
      {children}
      {hasDistinctRead && <h2 className={styles.headline}>{headline}</h2>}
      {forecastAvailable ? (
        <>
          <div className={styles.reading}>
            {temperatureF !== null && (
              <span className={styles.temperature}>
                <span className="sr-only">{temperatureF} degrees Fahrenheit forecast</span>
                <span aria-hidden="true">{temperatureF}°</span>
              </span>
            )}
            <div className={styles.details}>
              {condition && <Condition className={styles.condition}>{condition}</Condition>}
              {provenance}
            </div>
            {variant && <AnimatedSkyGlyph variant={variant} size={44} className={styles.glyph} />}
          </div>
          {(highF !== null || sun) && (
            <p className={styles.stats}>
              {highF !== null && <span>{`High ${highF}°`}</span>}
              {(sun || daylight) && <span>{sun ? `${sun.label} ${sun.time}` : null}{daylight}</span>}
            </p>
          )}
        </>
      ) : (
        <p className={styles.safetyNote}>The NWS forecast is briefly unavailable.</p>
      )}
      {safetyNote && <p className={styles.safetyNote}>{safetyNote}</p>}
    </section>
  );
}
