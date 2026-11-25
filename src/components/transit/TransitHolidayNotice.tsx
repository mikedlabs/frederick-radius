"use client";

import { useSyncExternalStore } from "react";
import { COUNTY_TRANSIT_BULLETIN_URL, MARC_HOLIDAY_URL, transitBulletinForDisplay } from "@/lib/transit-service-calendar";
import styles from "./TransitHolidayNotice.module.css";
import { easternDayKey, easternParts, easternWallToUtcISO } from "@/lib/tz";

function getDay() {
  return easternDayKey(new Date());
}

function subscribeToDayChange(update: () => void) {
  let timer: number;
  function refresh() {
    window.clearTimeout(timer);
    update();
    if (getDay() > "2026-11-28") return;
    const { year, month, day } = easternParts(new Date());
    const midnight = Date.parse(easternWallToUtcISO(year, month, day + 1, 0, 0));
    timer = window.setTimeout(refresh, midnight - Date.now());
  }
  refresh();
  document.addEventListener("visibilitychange", refresh);
  return () => {
    window.clearTimeout(timer);
    document.removeEventListener("visibilitychange", refresh);
  };
}

export default function TransitHolidayNotice({ now }: { now: Date }) {
  const day = useSyncExternalStore(subscribeToDayChange, getDay, () => easternDayKey(now));
  const bulletin = transitBulletinForDisplay(day);
  if (!bulletin) return null;
  return (
    <aside aria-label="Thanksgiving transit schedules" className={styles.notice}>
      <h2 className={styles.heading}>Thanksgiving transit schedules</h2>
      <table className={styles.schedule} aria-label="Holiday service by operator and date">
        <thead><tr>
          <th scope="col">November 2026</th><th scope="col">County Transit</th>
          {bulletin.rail && <th scope="col">MARC Brunswick</th>}
        </tr></thead>
        <tbody>
          {bulletin.rail && <tr>
            <th scope="row">Thu 26<br />Fri 27</th>
            <td className={styles.cancelled}>All service cancelled</td>
            <td className={styles.cancelled}>No service</td>
          </tr>}
          <tr>
            <th scope="row">Sat 28</th>
            <td><strong>Connector</strong><br />7:15 a.m. to 7 p.m.<br /><strong>Shuttles</strong><br />Regular Saturday schedules</td>
            {bulletin.rail && <td><a href={MARC_HOLIDAY_URL} className={styles.railLink}>Check MARC schedule</a></td>}
          </tr>
        </tbody>
      </table>
      <details className={styles.detail}>
        <summary>Bulletin details and sources</summary>
        {bulletin.county.map((line) => <p key={line}>{line}</p>)}
        {bulletin.rail && <p>{bulletin.rail}</p>}
        <div className={styles.sources}>
          <a href={COUNTY_TRANSIT_BULLETIN_URL}>County transit bulletin (PDF)</a>
          {bulletin.rail && <a href={MARC_HOLIDAY_URL}>MARC holiday schedule</a>}
        </div>
      </details>
    </aside>
  );
}
