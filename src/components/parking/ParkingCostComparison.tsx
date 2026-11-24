"use client";

import { useState } from "react";
import { useMounted } from "@/hooks/useSaved";
import { CITY_GARAGE_URL, CITY_STREET_URL, CITY_HOLIDAY_PARKING_URL } from "@/data/parking-garages";
import { ARRIVAL_HOURS, CHART_MAX_DOLLARS, STREET_HOLIDAYS_URL, STAY_HOURS, parkingMoney, parkingVisit, visitDates, visitHourLabel } from "@/lib/parking-visit";
import styles from "./ParkingGuide.module.css";

export default function ParkingCostComparison({ today, arrivalDefault = { hour: 12, dayOffset: 0 } }: {
  today: string; arrivalDefault?: { hour: number; dayOffset: number };
}) {
  const ready = useMounted();
  const dates = visitDates(today);
  const [day, setDay] = useState(dates[arrivalDefault.dayOffset].key);
  const [arrival, setArrival] = useState(arrivalDefault.hour);
  const [duration, setDuration] = useState<typeof STAY_HOURS[number]>(2);
  const cost = parkingVisit(day, arrival, duration);
  const rows = [
    { name: "All five City garages", amount: cost.garage, source: CITY_GARAGE_URL },
    { name: "N Market, 4th to 5th St", amount: cost.lowerStreet, source: CITY_STREET_URL },
    { name: "N Market, 2nd to 3rd St", amount: cost.upperStreet, source: CITY_STREET_URL },
  ];
  let note = "No street session fee applies during free hours.";
  if (cost.sessions) note = cost.sessions > 1
    ? "Street estimates include two 50¢ session fees."
    : "Street estimates include one 50¢ session fee.";
  if (cost.freeAll) note = "All three are free under the City holiday program.";
  else if (rows.every(row => row.amount === 0)) note = "All three options are free during this visit.";
  else if (cost.observed) note = "The City has not confirmed rates for the observed holiday. Check the posted signs.";
  else if (cost.garage === null) note = "Street parking is free for the holiday. The garage holiday rate is unconfirmed.";
  return <section data-parking-compare aria-labelledby="garage-basics-heading" className={styles.comparison}>
    <h2 id="garage-basics-heading" className={styles.heading}>Compare parking costs</h2>
    <div className={styles.controls}>
      <label>Date<select disabled={!ready} value={day} onChange={e => setDay(e.target.value)}>{dates.map(date => <option key={date.key} value={date.key}>{date.label}</option>)}</select></label>
      <label>Arrive at<select disabled={!ready} value={arrival} onChange={e => setArrival(Number(e.target.value))}>{ARRIVAL_HOURS.map(hour => <option key={hour} value={hour}>{visitHourLabel(hour)}</option>)}</select></label>
      <fieldset><legend>Stay</legend><div className={styles.durations}>{STAY_HOURS.map(hours =>
        <button key={hours} type="button" disabled={!ready} aria-label={`${hours} ${hours === 1 ? "hour" : "hours"}`} aria-pressed={hours === duration} onClick={() => setDuration(hours)}>{hours}h</button>
      )}</div></fieldset>
    </div>
    <div data-parking-prices className={styles.chart} aria-live="polite" aria-atomic="true">
      <p className={styles.range}>{dates.find(date => date.key === day)?.label} · {visitHourLabel(arrival)} to {visitHourLabel(arrival + duration)} ET</p>
      <ol aria-label="Estimated parking charges" className={styles.bars}>
        {rows.map(({ name, amount, source }) => <li key={name}><span>{name}</span><strong>{amount === null
          ? <a className={styles.checkRate} href={source} aria-label={`Check City rate for ${name}`}>Check rate</a>
          : amount ? parkingMoney(amount) : "Free"}</strong>
          <span aria-hidden className={styles.track} data-state={amount === null ? "unknown" : amount === 0 ? "free" : "paid"}>{amount !== null && amount > 0 && <span style={{ width: `${amount / CHART_MAX_DOLLARS * 100}%` }} />}</span>
        </li>)}
      </ol>
      <p className={styles.chartNote}>{note}</p>
    </div>
    <details className={styles.rateDetails}><summary>Rates, limits and discounts</summary>
      <p>All five garages charge $1 per hour or part of an hour. The weekday 24-hour maximum is $12. Weekday nights and weekends have a $5 maximum. Sundays are free from 8 AM to 2 PM.</p>
      <p>The two North Market blocks allow up to four hours. The estimates use $1 or $2 per paid hour plus 50¢ per session, with a renewal after two paid hours. Posted signs control each space.</p>
      <p>These estimates exclude monthly passes, merchant Park and Shop coupons and accessible street-parking privileges.</p>
      <div className={styles.sources}><a href={CITY_GARAGE_URL}>City garage rates</a><a href={CITY_STREET_URL}>City street rates</a><a href={CITY_HOLIDAY_PARKING_URL}>City holiday program</a><a href={STREET_HOLIDAYS_URL}>Street holiday list</a></div>
    </details>
  </section>;
}
