import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { MUNICIPALITY_BY_SLUG } from "@/data/municipalities";
import CountyLocator from "@/components/map/CountyLocator";
import DiscoveryPlacePhoto from "@/components/places/DiscoveryPlacePhoto";
import styles from "./FindStart.module.css";

const guides = [
  { label: "Out with kids", href: "/collections/kid-energy-burners", place: "Sophie & Madigan’s Playground", slug: "sophie-madigans-playground-frederick" },
  { label: "Walkable date night", href: "/collections/walkable-date-night", place: "Carroll Creek Linear Park", slug: "carroll-creek-linear-park-frederick" },
] as const;

export default function FindStart({ town, nearMe = false }: { town: string | null; nearMe?: boolean }) {
  const namedTown = town ? MUNICIPALITY_BY_SLUG[town] : null;
  const showFrederickPhotos = namedTown ? namedTown.slug === "frederick" : !nearMe;
  const nearby = `/nearby?c=coffee&in=${namedTown?.slug ?? (nearMe ? "nearme" : "county")}`;
  return (
    <div className={styles.start}>
      <section aria-labelledby="find-first-choices">
        <h2 id="find-first-choices" className={styles.heading}>Start with</h2>
        <ul className={styles.quick}>
          {[
            { label: "Open right now", href: "/open-now" },
            { label: "Coffee nearby", href: nearby },
            { label: "This weekend", href: "/events?lens=weekend" },
          ].map(choice => <li key={choice.href}><Link href={choice.href}>{choice.label}<ArrowRight aria-hidden size={15} /></Link></li>)}
        </ul>
      </section>
      {namedTown && !showFrederickPhotos && <section className={styles.town} aria-label={`Find places in ${namedTown.name}`}>
        <CountyLocator town={namedTown.slug} />
        <Link href={`/nearby?in=${namedTown.slug}`}>Browse places in {namedTown.name}<ArrowRight aria-hidden size={16} /></Link>
      </section>}
      <section aria-labelledby="find-county-guides">
        <h2 id="find-county-guides" className={styles.heading}>County guides</h2>
        <ul className={styles.guides}>
          {guides.map(guide => <li key={guide.href}><Link href={guide.href} aria-label={guide.label}>
            {showFrederickPhotos && <DiscoveryPlacePhoto slug={guide.slug} sizes="(max-width: 540px) 47vw, 340px" />}
            <span className={styles.title}>{guide.label}<ArrowRight aria-hidden size={16} /></span>
            {showFrederickPhotos && <span className={styles.subject}>{guide.place} · Frederick City</span>}
          </Link></li>)}
        </ul>
        <Link className={styles.more} href="/collections/rainy-day-frederick">Rainy-day ideas<ArrowRight aria-hidden size={15} /></Link>
      </section>
    </div>
  );
}
