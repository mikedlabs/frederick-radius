"use client";

import { useState, useSyncExternalStore } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import PlaceCardPhoto, { PlaceCardPhotoCredit } from "@/components/place/PlaceCardPhoto";
import { withBrowseReturnTo } from "@/lib/browse-return";
import type { PlaceCardPhotoResult, PlaceCardPhotoSource } from "@/lib/place-card-photo";
import { getScope, parseScope, scopeToParam, scopeTownSlug, subscribeScopeChange, type Scope } from "@/lib/scope";
import { useTodayPlacePhoto } from "./useTodayPlacePhoto";
import styles from "./TodayLayout.module.css";

/** Owner-approved category illustration only. No restaurant, date or location
 * is known for this photograph, so it never enters an exact-place registry. */
export const TODAY_PIZZA_CATEGORY_PHOTO = {
  kind: "owned",
  src: "/images/discovery/pizza-preparation.jpg",
  alt: "Rectangular pizzas with cheese and herbs on a preparation counter.",
  objectPosition: "left",
} satisfies PlaceCardPhotoSource;

type CategoryPhoto = Extract<PlaceCardPhotoSource, { kind: "owned" }>;
const BUSINESSES = [
  { slug: "zoes-chocolate-company", name: "Zoe's Chocolate Company", actionName: "Zoe's Chocolate Company" },
  { slug: "sabor-de-cuba-restaurant-frederick", name: "Sabor de Cuba", actionName: "Sabor de Cuba Restaurant" },
] as const;

/** These are actual Frederick businesses, never a label for another town. */
export function todayShowsFrederickDoorway(scope: Scope | null): boolean {
  const parsed = parseScope(scope);
  return parsed !== "nearme" && (!scopeTownSlug(parsed) || scopeTownSlug(parsed) === "frederick");
}

export function todayPizzaHref(scope: Scope | null, returnTo?: string): string {
  const active = parseScope(scope) ?? "county";
  const params = new URLSearchParams({ c: "food", facet: "pizza", in: scopeToParam(active) });
  return withBrowseReturnTo(`/nearby?${params}`, returnTo);
}

/** Until the real browser lens is resolved, show no foreign town or photo. */
export function TodayGeographicDoorwayPending() {
  return <div data-today-geographic-pending aria-hidden="true" className={`${styles.geographicMosaic} ${styles.geographicPending}`} />;
}

function DiningPhotoTile({ title, href, label, primary = false, slug, source, loaded, onResult }: {
  title: string; href: string; label: string; primary?: boolean; slug?: string;
  source: PlaceCardPhotoSource | null; loaded: boolean;
  onResult: (src: string, result: PlaceCardPhotoResult) => void;
}) {
  return (
    <Link href={href} prefetch={false} aria-label={label}
      data-today-geographic-doorway={primary || undefined}
      data-today-geographic-place={slug}
      data-today-discovery-action={primary ? "pizza" : "place"}
      data-photo-state={loaded ? "loaded" : source ? "pending" : "failed"}
      className={`${styles.geographicDoorway} ${primary ? styles.geographicMain : styles.geographicSupporting}`}>
      {source && <span className={styles.geographicPhoto} data-today-photo-lead={primary || undefined}>
        <PlaceCardPhoto source={source} onResult={onResult}
          sizes={primary ? "(min-width: 640px) 520px, 66vw" : "(min-width: 640px) 240px, 34vw"} />
      </span>}
      <div className={styles.geographicCaption} data-today-geographic-caption>
        {primary ? <h2>{title}</h2> : <h3>{title}</h3>}
        <span aria-hidden className={styles.geographicAction}><ArrowUpRight className="h-5 w-5" /></span>
      </div>
    </Link>
  );
}

function DiningMosaic({ scope, returnTo, categoryPhoto }: { scope: Scope; returnTo: string; categoryPhoto: CategoryPhoto | null }) {
  const [categoryState, setCategoryState] = useState<PlaceCardPhotoResult | null>(null);
  const pizza = categoryState === "failed" ? null : categoryPhoto;
  const zoes = useTodayPlacePhoto({ slug: BUSINESSES[0].slug }, 360, false);
  const sabor = useTodayPlacePhoto({ slug: BUSINESSES[1].slug }, 360, false);
  const showBusinesses = todayShowsFrederickDoorway(scope);
  const sources = [zoes, sabor];
  return (
    <div data-today-geographic-mosaic className={styles.geographicMosaic}>
      <div data-today-discovery-grid data-local-businesses={showBusinesses || undefined} className={styles.geographicTileGrid}>
        <DiningPhotoTile title="Find pizza" label="Find pizza" primary
          href={todayPizzaHref(scope, returnTo)} source={pizza} loaded={categoryState === "loaded"}
          onResult={(src, result) => {
            if (src === categoryPhoto?.src) setCategoryState(current => current === "failed" ? current : result);
          }} />
        {showBusinesses && BUSINESSES.map((place, index) => {
          const photo = sources[index];
          const params = new URLSearchParams({ in: scopeToParam(scope) });
          return <DiningPhotoTile key={place.slug} title={place.name} slug={place.slug}
            label={`View ${place.actionName} in Frederick`}
            href={withBrowseReturnTo(`/places/${place.slug}?${params}`, returnTo)}
            source={photo.source} loaded={photo.loaded} onResult={photo.onResult} />;
        })}
      </div>
      {showBusinesses && sabor.source && <div className={styles.geographicCredit} data-today-discovery-credit>
        <PlaceCardPhotoCredit source={sabor.source} loaded={sabor.loaded} touchTarget compact discloseModifications />
      </div>}
    </div>
  );
}

/** Photography opens a useful category or exact place, without implying that
 * either business is open, available or recommended at the present moment. */
export function TodayGeographicDoorwayView({ scope = null, returnTo, categoryPhoto = TODAY_PIZZA_CATEGORY_PHOTO }: {
  scope?: Scope | null; returnTo?: string; categoryPhoto?: CategoryPhoto | null;
}) {
  const active = parseScope(scope) ?? "county";
  const origin = returnTo ?? `/today?in=${scopeToParam(active)}`;
  return <DiningMosaic key={`${active}:${categoryPhoto?.src ?? "no-category-photo"}`} scope={active} returnTo={origin} categoryPhoto={categoryPhoto} />;
}

function subscribe(listener: () => void) {
  const unsubscribe = subscribeScopeChange(() => listener());
  window.addEventListener("hashchange", listener);
  window.addEventListener("popstate", listener);
  return () => { unsubscribe(); window.removeEventListener("hashchange", listener); window.removeEventListener("popstate", listener); };
}
const snapshot = () => JSON.stringify([getScope() ?? "county", window.location.hash]);

/** A neutral server snapshot prevents saved-town hydration from briefly
 * displaying Frederick businesses. The validated URL always wins afterward. */
export default function TodayGeographicDoorway() {
  const stored = useSyncExternalStore(subscribe, snapshot, () => null);
  const params = useSearchParams();
  if (stored === null) return <TodayGeographicDoorwayPending />;
  const [storedScope, hash] = JSON.parse(stored) as [Scope, string];
  const scope = params.has("in") ? parseScope(params.get("in")) ?? "county" : storedScope;
  const returnParams = new URLSearchParams(params.toString());
  returnParams.set("in", scopeToParam(scope));
  return <TodayGeographicDoorwayView scope={scope} returnTo={`/today?${returnParams}${hash}`} />;
}
