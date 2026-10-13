import type { ReactNode } from "react";
import { ChevronRight } from "lucide-react";
import AppTransitionLink from "@/components/nav/AppTransitionLink";
import styles from "./TodayLayout.module.css";

/** The heading is immediate; only the supplied factual weather read may suspend. */
export default function TodayMasthead({ title, weather }: { title: string; weather: ReactNode }) {
  return (
    <header data-today-masthead className={`scroll-masthead ${styles.masthead}`}>
      <h1 className={styles.title}>{title}</h1>
      <section data-today-weather className={styles.weather}>
        <AppTransitionLink href="/pulse?open=weather" prefetch={false} className={styles.forecastLink}>
          <span className={styles.forecastLabel}>Full forecast <ChevronRight aria-hidden className="h-4 w-4" /></span>
          {weather}
          <span className="sr-only">Open the full forecast for Frederick.</span>
        </AppTransitionLink>
      </section>
    </header>
  );
}
