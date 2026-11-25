"use client";

import { useEffect, useState, type FormEvent } from "react";
import Image from "next/image";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import CountyLocator from "@/components/map/CountyLocator";
import PhotoCreditLine from "@/components/place/PhotoCreditLine";
import { curatedPhotoCredit } from "@/lib/curated-photo-source";
import { curatedPhotoUrl, getTownPhoto } from "@/lib/integrations/wikimedia";
import type { TownStat } from "@/lib/guided/town-stats";
import { townEventWindowLabel } from "@/lib/guided/town-event-window";
import styles from "./TownPicker.module.css";

function TownCounts({ town }: { town: TownStat }) {
  return <p className={styles.counts}>
    <span>{town.placeCount} {town.placeCount === 1 ? "place" : "places"}</span>
    <span>{townEventWindowLabel(town.eventCount)}</span>
  </p>;
}

/** Selection is a bookmarkable GET. All guides have a native destination in
 * the same document, including before the client router starts. */
export default function TownPicker({ stats, town }: { stats: TownStat[]; town?: string }) {
  const [selectedSlug, setSelectedSlug] = useState(town);
  useEffect(() => {
    const restore = () => setSelectedSlug(new URL(window.location.href).searchParams.get("town") ?? undefined);
    window.addEventListener("popstate", restore);
    return () => window.removeEventListener("popstate", restore);
  }, []);
  const selected = stats.find((stat) => stat.slug === selectedSlug) ?? stats.find((stat) => stat.slug === "frederick") ?? stats[0];
  if (!selected) return <p>No town guides are available.</p>;
  const alphabetical = [...stats].sort((a, b) => a.name.localeCompare(b.name, "en"));
  const others = alphabetical.filter((stat) => stat.slug !== selected.slug);
  const photo = getTownPhoto(selected.slug);

  function locate(event: FormEvent<HTMLFormElement>) {
    const slug = new FormData(event.currentTarget).get("town");
    if (typeof slug !== "string" || !stats.some((stat) => stat.slug === slug)) return;
    event.preventDefault();
    const destination = new URL(event.currentTarget.action);
    destination.searchParams.set("town", slug);
    if (destination.href !== window.location.href) window.history.pushState(null, "", destination);
    setSelectedSlug(slug);
    // The map is already in the document. Focus the chosen point's figure
    // after React updates its label; do not refetch the county's event feeds.
    requestAnimationFrame(() => {
      const locator = document.getElementById("town-location");
      locator?.focus({ preventScroll: true });
      locator?.scrollIntoView({ block: "start", behavior: "instant" });
    });
  }

  return (
    <div className={styles.index} id="town-atlas">
      <form className={styles.form} action="/towns#town-location" method="get" onSubmit={locate}>
        <label htmlFor="atlas-selection">Locate a community</label>
        <div className={styles.controls}>
          {/* On native Back, restore the town in this URL instead of a later unsent choice. */}
          <select id="atlas-selection" key={selected.slug} name="town" autoComplete="off" defaultValue={selected.slug}>
            {alphabetical.map((stat) => <option key={stat.slug} value={stat.slug}>{stat.name}</option>)}
          </select>
          <button type="submit">Show on map</button>
        </div>
      </form>

      <section aria-labelledby="selected-town-name" data-selected-town={selected.slug} className={styles.feature}>
        {photo && <figure className={styles.photo}>
          <div className={styles.frame}>
            <Image src={curatedPhotoUrl(photo, 1000)} fill sizes="(min-width: 768px) 50vw, 100vw"
              alt={photo.alt} priority style={{ objectFit: "cover", objectPosition: photo.objectPosition ?? "center" }} />
          </div>
          <figcaption><PhotoCreditLine credit={curatedPhotoCredit(photo)} /></figcaption>
        </figure>}
        <div className={styles.profile}>
          <h2 id="selected-town-name">
            <Link href={`/m/${selected.slug}`} prefetch={false} className={styles.guideLink}
              aria-label={`Open the ${selected.name} guide`}>
              {selected.name}<ArrowRight aria-hidden="true" size={23} />
            </Link>
          </h2>
          <p className={styles.fact}>{selected.fact}</p>
          <TownCounts town={selected} />
          {selected.bestFor.length > 0 && <p className={styles.bestFor}><span>In the guide</span> {selected.bestFor.join(" · ")}</p>}
        </div>
        <div className={styles.locator} id="town-location" role="region" aria-label={`County map locating ${selected.name}`} tabIndex={-1}>
          <CountyLocator town={selected.slug} />
        </div>
      </section>

      {others.length > 0 && <section aria-labelledby="other-town-guides" className={styles.directory}>
        <h2 id="other-town-guides">More town guides</h2>
        <ul className={styles.list}>
          {others.map((stat) => <li key={stat.slug}>
            <Link className={styles.row} href={`/m/${stat.slug}`} prefetch={false} aria-labelledby={`town-guide-${stat.slug}`}>
              <div className={styles.rowHeading}>
                <h3 id={`town-guide-${stat.slug}`}>{stat.name}</h3>
                <ArrowRight aria-hidden="true" size={17} />
              </div>
              <p className={styles.fact}>{stat.fact}</p>
              <TownCounts town={stat} />
              {stat.bestFor.length > 0 && <p className={styles.categories}>{stat.bestFor.join(" · ")}</p>}
            </Link>
          </li>)}
        </ul>
      </section>}
    </div>
  );
}
