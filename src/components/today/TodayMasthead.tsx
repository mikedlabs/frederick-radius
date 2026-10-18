import type { ReactNode } from "react";
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
        {dateline && <p data-today-dateline className={styles.dateline}><span className="sr-only">Frederick County · </span>{dateline}</p>}
      </div>
      <section data-today-weather className={styles.weather}>
        <div className={styles.weatherReading}>{weather}</div>
      </section>
    </header>
  );
}
