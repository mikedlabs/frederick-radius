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
  lowF?: number | null;
  retainedHighIssuedAt?: string | null;
  sunriseTime?: string | null;
  sunsetTime?: string | null;
  actionableHeadline?: boolean;
  sun: { label: string; time: string } | null;
  variant: SkyVariant | null;
  forecastAvailable: boolean;
  issuedAt: string | null;
  safetyNote: string | null;
  /** The note only reports a missing air-quality reading. The masthead keeps
   *  it inside the forecast details instead of a first-screen line. */
  safetyNoteRoutine?: boolean;
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

type DailyWeatherFacts = Pick<TodayWeatherViewProps, "lowF" | "sunriseTime" | "sunsetTime" | "retainedHighIssuedAt"> & { highF?: number | null };

function DailyFacts({ highF, lowF, sunriseTime, sunsetTime, retainedHighIssuedAt }: DailyWeatherFacts) {
  const facts = [
    [retainedHighIssuedAt ? "Earlier high" : "High", highF == null ? null : `${highF}°`],
    ["Low", lowF == null ? null : `${lowF}°`],
    ["Sunrise", sunriseTime],
    ["Sunset", sunsetTime],
  ] as const;
  return <p data-weather-stats className={styles.dailyFacts}>
    {facts.map(([label, value]) => <span key={label}>
      {value ? `${label} ${value}` : <>{label} <span aria-hidden>–</span><span className="sr-only">unavailable</span></>}
    </span>)}
  </p>;
}

function EarlierHighSource({ issuedAt }: { issuedAt?: string | null }) {
  const issued = issuedAt && forecastIssuance(issuedAt);
  return issued ? <p className={styles.issuance}>The daytime high is from the NWS forecast issued on <time dateTime={issued.dateTime}>{issued.label}</time>.</p> : null;
}

export function WeatherUnavailable({ density = "standard", ...facts }: DailyWeatherFacts & { density?: TodayWeatherViewProps["density"] } = {}) {
  return (
    <section aria-label="Weather unavailable" data-weather-state="unavailable" data-weather-density={density}
      className={density === "masthead" ? styles.compactUnavailable : styles.unavailable}>
      <span data-weather-message className={density === "masthead" ? styles.forecastMessage : undefined}>The NWS forecast is briefly unavailable.</span>
      {density === "masthead" ? <><FullForecastLink /><DailyFacts {...facts} /></> : <span className={styles.handoff}>County status</span>}
    </section>
  );
}

/** Shared factual presentation. Provider reads, verdicts, sun calculations,
 * live daylight, and offline capture remain owned by the server composition. */
export default function TodayWeatherView({
  headline, condition, temperatureF, highF, lowF, sunriseTime, sunsetTime, retainedHighIssuedAt, actionableHeadline, sun, variant,
  forecastAvailable, issuedAt, safetyNote, safetyNoteRoutine = false, daylight, children, density = "standard",
}: TodayWeatherViewProps) {
  const issuance = forecastIssuance(issuedAt);
  const hasDistinctRead = Boolean(headline && headline !== condition);
  const Condition = hasDistinctRead ? "p" : "h2";
  const provenance = (
    <>
      <p data-weather-source data-weather-scope className={styles.source}>NWS forecast · Frederick</p>
      <p data-weather-issuance className={styles.issuance}>
        {issuance ? <>Issued <time dateTime={issuance.dateTime}>{issuance.label}</time></> : "Issue time unavailable"}
      </p>
    </>
  );

  if (density === "masthead") {
    // Unavailable readings do not take primary space. A missing air-quality
    // reading joins the forecast evidence; a missing alert feed, or a note
    // with no forecast to disclose, stays in the first read.
    const noteInDetails = Boolean(safetyNote && safetyNoteRoutine && forecastAvailable);
    // First-read notes keep data-weather-safety-note; a routine note inside
    // the details is marked separately so it never reads as a first-read fact.
    const safetyLine = safetyNote
      ? noteInDetails
        ? <p data-weather-routine-note className={styles.safetyNote}>{safetyNote}</p>
        : <p data-weather-safety-note className={styles.safetyNote}>{safetyNote}</p>
      : null;
    return (
      <section
        aria-label="Today in Frederick"
        data-weather-state={forecastAvailable ? "available" : "safety-only"}
        data-weather-density={density}
        className={`${styles.card} ${styles.masthead}`}
      >
        {children}
        {forecastAvailable ? (
          <details className={styles.forecastDetails}>
            <summary data-today-weather-summary>
              <span className="sr-only">Forecast details for Frederick. </span>
              <span className={styles.reading}>
                {variant && <AnimatedSkyGlyph as="span" variant={variant} size={20} className={styles.glyph} />}
                {temperatureF !== null && (
                  <span data-weather-temperature className={styles.temperature}>
                    <span className="sr-only">{temperatureF} degrees Fahrenheit forecast</span>
                    <span aria-hidden="true">{temperatureF}°</span>
                  </span>
                )}
                <span data-weather-disclosure-cue className={styles.summaryCue} aria-hidden="true"><ChevronRight className="h-3.5 w-3.5" /></span>
                {condition && <span data-weather-condition className={styles.condition}>{condition}</span>}
              </span>
            </summary>
            <div className={styles.forecastEvidence}>
              {provenance}
              <EarlierHighSource issuedAt={retainedHighIssuedAt} />
              {hasDistinctRead && !actionableHeadline && <p className={styles.safetyNote}>{headline}</p>}
              {noteInDetails && safetyLine}
              {daylight && <p className={styles.safetyNote}>{daylight}</p>}
              <FullForecastLink />
            </div>
          </details>
        ) : (
          <div className={styles.compactUnavailable}>
            <span data-weather-message className={styles.forecastMessage}>The NWS forecast is briefly unavailable.</span>
            <FullForecastLink />
          </div>
        )}
        {hasDistinctRead && (actionableHeadline || !forecastAvailable) &&
          <h2 data-weather-headline className={styles.headline}>{headline}</h2>}
        {!noteInDetails && safetyLine}
        <DailyFacts highF={highF} lowF={lowF} sunriseTime={sunriseTime} sunsetTime={sunsetTime} retainedHighIssuedAt={retainedHighIssuedAt} />
        {!forecastAvailable && <EarlierHighSource issuedAt={retainedHighIssuedAt} />}
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
