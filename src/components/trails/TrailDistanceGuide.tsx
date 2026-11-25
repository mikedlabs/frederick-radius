"use client";

import Link from "next/link";
import { useState } from "react";
import type { Trail } from "@/lib/integrations/fcTrails";
import styles from "./TrailDistanceGuide.module.css";

type DistanceEntry = Pick<Trail, "id" | "name" | "park" | "surface" | "skill" | "lengthMi" | "lat" | "lng">;

export default function TrailDistanceGuide({ trails }: { trails: DistanceEntry[] }) {
  const parks = [...new Set(trails.map((trail) => trail.park).filter((park): park is string => Boolean(park)))].sort();
  const [chosenPark, setChosenPark] = useState("");
  const selected = parks.includes(chosenPark) ? chosenPark : parks.find((park) => park === "Catoctin Mountain Park") ?? parks[0];
  if (!selected) return null;
  const choices = trails.filter((trail) => trail.park === selected)
    .sort((a, b) => (a.lengthMi ?? Infinity) - (b.lengthMi ?? Infinity) || a.name.localeCompare(b.name));
  const max = Math.max(0, ...choices.map((trail) => trail.lengthMi ?? 0));
  return (
    <section className={styles.guide} aria-labelledby="trail-distance-title">
      <div className={styles.controls}>
        <h2 id="trail-distance-title">Compare trail lengths</h2>
        <label>Park <select value={selected} onChange={(event) => setChosenPark(event.target.value)}>
          {parks.map((park) => <option key={park}>{park}</option>)}
        </select></label>
      </div>
      <ul className={styles.trails}>
        {choices.map((trail) => (
          <li key={trail.id}>
            <Link href={`/map?at=${trail.lat},${trail.lng}`} aria-label={`View ${trail.name} on the map`}>
              <span className={styles.row}><strong>{trail.name}</strong><span>{trail.lengthMi != null ? `${trail.lengthMi} mi` : "Length unlisted"}</span></span>
              {trail.lengthMi != null && max > 0 && <span aria-hidden="true" className={styles.track}>
                <span style={{ width: `${trail.lengthMi / max * 100}%` }} />
              </span>}
              <span className={styles.meta}>{[trail.skill, trail.surface].filter(Boolean).join(" · ")}</span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
