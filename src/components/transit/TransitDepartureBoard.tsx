"use client";

import { Bookmark, BookmarkCheck, ChevronDown, ExternalLink, LocateFixed } from "lucide-react";
import { readableTextOn } from "@/lib/color/readableText";
import type { TransitVehicleFocusDetail } from "@/lib/transit-focus";
import { transitBusWatchId, type Catchability, type TransitBusRef } from "@/components/transit/transitRiderModel";
import type { StopArrivalsStatus, StopPrediction } from "@/components/transit/useStopArrivals";
import styles from "./TransitExperience.module.css";

export type TransitDeparture = {
  key: string;
  prediction: StopPrediction;
  route?: { id: string; short: string; name: string; color: string };
  minutes: number;
  fresh: boolean;
  catchability: Catchability | null;
  focus: TransitVehicleFocusDetail | null;
  busRef: TransitBusRef | null;
};

type DepartureActions = {
  savedBusWatchIds: readonly string[];
  onTrack: (detail: TransitVehicleFocusDetail) => void;
  onToggleSaved: (bus: TransitBusRef) => void;
};
const SCHEDULE_URL = "https://www.frederickcountymd.gov/207/Transit-Routes-Schedule-Information";
const CLOCK_FORMATTER = new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit" });

function timeLabel(row: TransitDeparture): string {
  if (!row.fresh) return row.prediction.arrivalEpoch == null ? "Last estimate" : CLOCK_FORMATTER.format(new Date(row.prediction.arrivalEpoch * 1000));
  return row.minutes === 0 ? "Due" : `${row.minutes} min`;
}

function RouteIdentity({ row }: { row: TransitDeparture }) {
  const background = row.route?.color ?? "var(--app-cool)";
  return <span className={styles.departureRoute}>
    <span aria-label={row.route ? `Route ${row.route.short}` : "TransIT bus"}
      className={styles.routeBadge} style={{ background, color: row.route ? readableTextOn(row.route.color) : "var(--app-on-brand)" }}>
      {row.route?.short ?? "Bus"}
    </span>
    <span className={styles.departureRouteName}>{row.route?.name ?? "TransIT bus"}</span>
  </span>;
}

function BusActions({ row, savedBusWatchIds, onTrack, onToggleSaved }: { row: TransitDeparture } & DepartureActions) {
  if (!row.fresh || (!row.focus && !row.busRef)) return null;
  const focus = row.focus, bus = row.busRef;
  const destination = row.prediction.headsign?.trim();
  const saved = bus ? savedBusWatchIds.includes(transitBusWatchId(bus)) : false;
  return <div className={styles.arrivalActions}>
    {focus && <button type="button" onClick={() => onTrack(focus)}
      aria-label={`Track ${destination ? `${row.route?.name ?? "this bus"} to ${destination}` : row.route?.name ?? "this bus"} on the live map`}
      className={styles.trackAction}>
      <LocateFixed className="h-3.5 w-3.5 shrink-0" strokeWidth={2.2} aria-hidden />Track on map
    </button>}
    {bus && <button type="button" onClick={() => onToggleSaved(bus)} aria-pressed={saved}
      aria-label={saved ? `Remove bus ${bus.vehicleId} from Saved` : `Save bus ${bus.vehicleId}`} className={styles.saveAction}>
      {saved ? <BookmarkCheck className="h-3.5 w-3.5 shrink-0" strokeWidth={2.2} aria-hidden /> : <Bookmark className="h-3.5 w-3.5 shrink-0" strokeWidth={2.2} aria-hidden />}
      {saved ? "Saved bus" : "Save bus"}
    </button>}
  </div>;
}

function Departure({ row, primary, ...actions }: { row: TransitDeparture; primary: boolean } & DepartureActions) {
  const destination = row.prediction.headsign?.trim();
  const color = row.catchability?.kind === "likely" ? "var(--state-open)" : row.catchability?.kind === "tight" ? "var(--state-closing)" : "var(--app-danger-text)";
  return <li className={primary ? styles.departurePrimary : styles.departureFollowing}
    data-transit-primary-departure={primary || undefined} data-transit-departure-state={row.fresh ? "live" : "delayed"}
    style={primary ? { borderTopColor: row.route?.color ?? "var(--app-cool)" } : undefined}>
    <div className={styles.departureTop}>
      <RouteIdentity row={row} />
      <span className={primary ? styles.departurePrimaryTime : styles.departureFollowingTime} data-transit-arrival-time>{timeLabel(row)}</span>
    </div>
    {destination && <p className={styles.departureDestination}>To {destination}</p>}
    <div className={styles.departureMeta}>
      <span>{row.fresh ? "Live estimate" : "Estimate delayed"}</span>
      {row.fresh && row.catchability && <span className={styles.catchability} style={{ color }}>{row.catchability.label}</span>}
    </div>
    {row.fresh && (row.focus || row.busRef) && (primary ? <BusActions row={row} {...actions} /> : <details className={styles.departureOptions}>
      <summary><span>Bus options</span><ChevronDown className="h-4 w-4 shrink-0" aria-hidden /></summary>
      <BusActions row={row} {...actions} />
    </details>)}
  </li>;
}

/** Presentation only. Selection, prediction freshness, identity and polling
 * stay with the rider owner; route colors are identity, never progress. */
export default function TransitDepartureBoard({ arrivals, status, ...actions }: {
  arrivals: readonly TransitDeparture[];
  status: StopArrivalsStatus;
} & DepartureActions) {
  // The owner filters these too. Defensive presentation must never feature a
  // withdrawn service when this pure board is supplied independently.
  const departures = arrivals.filter(({ prediction }) =>
    prediction.tripScheduleRelationship !== "CANCELED" &&
    prediction.tripScheduleRelationship !== "DELETED" &&
    prediction.scheduleRelationship !== "SKIPPED" &&
    prediction.scheduleRelationship !== "NO_DATA",
  );
  const showSchedule = status === "stale" || status === "unavailable" || (status === "live" && departures.length === 0);
  return <section aria-label="Next arrivals" className={styles.departureBoard}>
    <h4 className={styles.departureHeading}>{departures.length > 0 && departures[0].fresh ? "Next arrival" : "Next arrivals"}</h4>
    {status === "loading" ? <p className={styles.departureEmpty}>Radius is checking for inbound buses.</p> : departures.length > 0 ? <ol className={styles.departureList}>
      {departures.map((row, index) => <Departure key={row.key} row={row} primary={index === 0} {...actions} />)}
    </ol> : <p className={styles.departureEmpty}>
      {status === "unavailable" ? "Live arrivals are unavailable for this stop right now." : status === "stale" ? "The last feed update has no usable arrival times." : "No live arrival is reporting for this stop right now. Check the official schedule before leaving."}
    </p>}
    {showSchedule && <a href={SCHEDULE_URL} target="_blank" rel="noopener noreferrer" className={styles.scheduleAction}>
      Check the official schedule<ExternalLink className="h-3.5 w-3.5 shrink-0" strokeWidth={2} aria-hidden />
    </a>}
  </section>;
}
