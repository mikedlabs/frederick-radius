"use client";

import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import CountyLocator from "@/components/map/CountyLocator";
import PhotoCreditLine, { type PhotoCreditFacts } from "@/components/place/PhotoCreditLine";
import styles from "./ParkGuide.module.css";

export type ParkGuideItem = {
  id: string; name: string; area: string; lat: number; lng: number;
  address?: string; type?: string; official?: string;
  photo?: { src: string; alt: string; position?: string; credit: PhotoCreditFacts };
};

export default function ParkGuide({ parks }: { parks: ParkGuideItem[] }) {
  const [id, setId] = useState(() => parks.find((p) => p.id === "ballenger-creek-park")?.id ?? parks[0]?.id);
  const [failedImage, setFailedImage] = useState<string | null>(null);
  const selected = parks.find((park) => park.id === id) ?? parks[0];
  if (!selected) return null;
  const photo = selected.photo && selected.photo.src !== failedImage ? selected.photo : null;
  return (
    <section className={styles.guide} aria-labelledby="park-picker-title">
      <label htmlFor="park-picker" id="park-picker-title" className={styles.label}>Choose a park</label>
      <select id="park-picker" value={selected.id} className={styles.select}
        onChange={(event) => setId(event.target.value)}>
        {parks.map((park) => <option key={park.id} value={park.id}>{park.name} · {park.area}</option>)}
      </select>
      <div className={styles.selected}>
        <div className={styles.visual}>
          {photo ? <Image src={photo.src} alt={photo.alt} width={640} height={354}
            className={styles.photo} style={{ objectPosition: photo.position }}
            sizes="(max-width: 700px) 100vw, 42vw" onError={() => setFailedImage(photo.src)} />
            : <CountyLocator point={{ lat: selected.lat, lng: selected.lng, label: selected.name, kind: "Selected place" }} />}
        </div>
        <div className={styles.info}>
          <h2 className={styles.name}>{selected.name}</h2>
          <p className={styles.context}>{[selected.type, selected.area].filter(Boolean).join(" · ")}</p>
          {selected.address && <p>{selected.address}</p>}
          <div className={styles.actions}>
            <Link href={`/map?at=${selected.lat},${selected.lng}`} aria-label={`View ${selected.name} on the map`}>View on map</Link>
            {selected.official && <a href={selected.official}>Official park page</a>}
          </div>
          {photo && <details className={styles.credit}><summary>Photo credit</summary><PhotoCreditLine credit={photo.credit} /></details>}
        </div>
      </div>
    </section>
  );
}
