import type { ReactNode } from "react";
import { ChevronRight } from "lucide-react";
import AppTransitionLink from "@/components/nav/AppTransitionLink";
import styles from "./TodayLayout.module.css";

/** The heading is immediate; only the supplied factual weather read may suspend. */
export default function TodayMasthead({ title, shortTitle, dateline, weather }: {
  title: string;
  shortTitle?: string;
  dateline?: string;
  weather: ReactNode;
}) {
  return (
    <header data-today-masthead className={`scroll-masthead ${styles.masthead}`}>
      <div className={styles.heading}>
        <h1 aria-label={shortTitle ? title : undefined} className={styles.title}>{shortTitle ?? title}</h1>
        {dateline && <p data-today-dateline className={styles.dateline}>Frederick County <span aria-hidden>·</span> {dateline}</p>}
      </div>
      <section data-today-weather className={styles.weather}>
        <div className={styles.weatherReading}>{weather}</div>
        <AppTransitionLink href="/pulse?open=weather" prefetch={false} className={styles.forecastLink}>
          <span>Full forecast</span><ChevronRight aria-hidden className="h-4 w-4" />
          <span className="sr-only"> for Frederick.</span>
        </AppTransitionLink>
      </section>
    </header>
  );
}
