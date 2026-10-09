import type { ReactNode } from "react";
import AnimatedSkyGlyph, { type SkyVariant } from "./AnimatedSkyGlyph";
import styles from "./TodayCard.module.css";

export type TodayWeatherViewProps = {
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

export function WeatherUnavailable() {
  return (
    <section
      aria-label="Weather unavailable"
      data-weather-state="unavailable"
      className={styles.unavailable}
    >
      <span>The NWS forecast is briefly unavailable.</span>
      <span className={styles.handoff}>County status</span>
    </section>
  );
}

/** Shared factual presentation. Provider reads, verdicts, sun calculations,
 * live daylight, and offline capture remain owned by the server composition. */
export default function TodayWeatherView({
  headline, condition, temperatureF, highF, sun, variant,
  forecastAvailable, issuedAt, safetyNote, daylight, children,
}: TodayWeatherViewProps) {
  const issuance = forecastIssuance(issuedAt);
  const hasDistinctRead = Boolean(headline && headline !== condition);
  const Condition = hasDistinctRead ? "p" : "h2";

  return (
    <section
      aria-label="Today in Frederick"
      data-weather-state={forecastAvailable ? "available" : "safety-only"}
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
              <p className={styles.source}>NWS forecast · Frederick</p>
              <p className={styles.issuance}>
                {issuance ? <>Issued <time dateTime={issuance.dateTime}>{issuance.label}</time></> : "Issue time unavailable"}
              </p>
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
