import Link from "next/link";
import { Navigation, Zap } from "lucide-react";
import { PARKING_GARAGES } from "@/data/parking-garages";
import { occupancyByGarageSlug, type GarageOccupancy } from "@/lib/integrations/parking-live";
import { googleMapsDirections } from "@/lib/integrations/deeplinks";
import { parkingSpacesLabel } from "@/lib/map/parking";
import styles from "./ParkingGuide.module.css";

function lastReport(deck?: GarageOccupancy) {
  if (!deck?.updated) return null;
  const amount = parkingSpacesLabel(deck)
    ?? (deck.isFilling ? "Filling up" : null)
    ?? (deck.percentFull !== null ? `${deck.percentFull}% full` : null)
    ?? (deck.availabilityState === "open" || deck.availabilityState === "available" ? "Open, count unavailable" : null);
  if (!amount) return null;
  const time = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZoneName: "short" }).format(new Date(deck.updated));
  return `${amount} reported ${time}`;
}

export default async function GarageDirectory() {
  const readings = await occupancyByGarageSlug();
  const garages = PARKING_GARAGES.map(garage => ({ garage, report: lastReport(readings.get(garage.slug)) }));
  const hasReports = garages.some(row => row.report);
  return <section id="garages" aria-labelledby="garages-heading" className={`scroll-mt-24 ${styles.directory}`}>
    <h2 id="garages-heading" className={styles.heading}>All five City garages</h2>
    <p>All five operate on a 24-hour schedule. {hasReports ? "Availability reports reflect the time shown." : "Current space counts are unavailable."}</p>
    <ul>{garages.map(({ garage, report }) => <li key={garage.slug}>
      <Link href={`/places/${garage.slug}`} className={styles.garageName}>{garage.name}</Link>
      {garage.geom && <a href={googleMapsDirections(garage.geom.lat, garage.geom.lng, "driving")} className={styles.directions} aria-label={`Driving directions to ${garage.name}`}>
        <Navigation size={15} aria-hidden /> Directions</a>}
      <p>{garage.address.replace(", Frederick, MD", "")}{garage.ev_charging && <small><Zap size={13} aria-hidden /> EV charging</small>}</p>
      {garage.notes && <p>{garage.notes}</p>}
      {garage.slug === "east-all-saints-street-parking-garage" && <p>Visitors from outside the county can get three hours validated at the Frederick Visitor Center. <a href="https://www.visitfrederick.org/plan-your-visit/visitor-center/">Visitor Center hours</a></p>}
      {hasReports && <p className={styles.status}>{report ?? "Availability unreported"}</p>}
    </li>)}</ul>
  </section>;
}
