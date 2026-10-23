"use client";

import { useState, useSyncExternalStore } from "react";
import { useSearchParams } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { getScope, parseScope, scopeTownSlug, subscribeScopeChange, type Scope } from "@/lib/scope";
import { getOwnedPlacePhoto, type OwnedPlacePhoto } from "@/lib/owned-place-photos";
import styles from "./TodayLayout.module.css";

const subscribe = (listener: () => void) => subscribeScopeChange(() => listener());

/** This owned scene shows Frederick, not whichever municipality is selected. */
export function todayShowsFrederickDoorway(scope: Scope | null): boolean {
  const parsed = parseScope(scope);
  if (parsed === "nearme") return false;
  const town = scopeTownSlug(parsed);
  return town === null || town === "frederick";
}

/** Reserve county geometry while the URL lens is unknown, without a place claim. */
export function TodayGeographicDoorwayPending() {
  return (
    <div data-today-geographic-pending aria-hidden="true" className={styles.geographicDoorway}>
      <div className={styles.geographicPhoto} />
    </div>
  );
}

const GEOGRAPHIC_PLACES = [
  { slug: "carroll-creek-linear-park-frederick", name: "Carroll Creek", actionName: "Carroll Creek Linear Park", primary: true },
  { slug: "baker-park-frederick", name: "Baker Park", actionName: "Baker Park", primary: false },
  { slug: "visitation-hotel", name: "Visitation Hotel", actionName: "Visitation Hotel", primary: false },
] as const;

/** Each real photograph can appear or fail independently of its neighbors. */
function GeographicPlaceAnchor({ place, photo }: {
  place: typeof GEOGRAPHIC_PLACES[number];
  photo: OwnedPlacePhoto | null;
}) {
  const [imageState, setImageState] = useState<"pending" | "loaded" | "failed">(photo ? "pending" : "failed");
  return (
    <Link
      href={`/places/${place.slug}`}
      prefetch={false}
      aria-label={`View ${place.actionName} in Frederick`}
      data-today-geographic-doorway={place.primary || undefined}
      data-today-geographic-place={place.slug}
      data-photo-state={imageState}
      className={`${styles.geographicDoorway} ${place.primary ? styles.geographicMain : styles.geographicSupporting}`}
    >
      {photo && imageState !== "failed" && (
        <figure className={styles.geographicPhoto} data-today-photo-lead={place.primary || undefined}>
          <Image
            src={photo.src}
            alt={photo.alt}
            fill
            sizes={place.primary ? "(min-width: 640px) 320px, 62vw" : "(min-width: 640px) 200px, 38vw"}
            loading="eager"
            style={{ objectPosition: photo.objectPosition ?? "center" }}
            onLoad={(event) => {
              const image = event.currentTarget;
              const usable = image.naturalWidth > 1 && image.naturalHeight > 1;
              setImageState((current) => current === "failed" ? current : usable ? "loaded" : "failed");
            }}
            onError={() => setImageState("failed")}
          />
        </figure>
      )}
      <div className={styles.geographicCaption} data-today-geographic-caption>
        <div>
          {place.primary ? <h2>{place.name}</h2> : <h3>{place.name}</h3>}
          {place.primary && <p>Frederick</p>}
        </div>
        <span aria-hidden className={styles.geographicAction}><ArrowRight className="h-4 w-4" /></span>
      </div>
    </Link>
  );
}

/** Exact Frederick places, never a claim of present weather or availability. */
export function TodayGeographicDoorwayView({ scope = null }: { scope?: Scope | null }) {
  if (!todayShowsFrederickDoorway(scope)) return null;
  return (
    <div data-today-geographic-mosaic className={styles.geographicMosaic}>
      {GEOGRAPHIC_PLACES.map((place) => {
        const photo = getOwnedPlacePhoto(place.slug);
        return <GeographicPlaceAnchor key={`${place.slug}:${photo?.src ?? "no-photo"}`} place={place} photo={photo} />;
      })}
    </div>
  );
}

/** Match the existing shared lens: a validated URL wins over stored scope. */
export default function TodayGeographicDoorway() {
  const storedScope = useSyncExternalStore(subscribe, getScope, () => null);
  const searchParams = useSearchParams();
  const scope = parseScope(searchParams.get("in")) ?? storedScope;
  return <TodayGeographicDoorwayView scope={scope} />;
}
