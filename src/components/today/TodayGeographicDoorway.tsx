"use client";

import { useState, useSyncExternalStore } from "react";
import { useSearchParams } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import { ArrowRight, ArrowUpRight, CalendarDays, Footprints, MapPin, Trees, Utensils } from "lucide-react";
import PlaceCardPhoto, { PlaceCardPhotoCredit } from "@/components/place/PlaceCardPhoto";
import SaveButton from "@/components/saved/SaveButton";
import { withBrowseReturnTo } from "@/lib/browse-return";
import { recordPlaceCardPhotoResult, selectedPlaceCardPhoto, type PlaceCardPhotoResult, type PlaceCardPhotoState } from "@/lib/place-card-photo";
import { getScope, parseScope, scopeToParam, subscribeScopeChange, type Scope } from "@/lib/scope";
import { localDiscoveryPlaces, type LocalDiscoveryPlace } from "@/lib/today/discovery-places";
import styles from "./TodayLayout.module.css";

export type TodayDiscoveryTask = "food" | "outside";
export type TodayGuidePhotos = { weekend: string; downtown: string };

function OutingLink({ href, title, scope, image, Icon }: {
  href: string;
  title: string;
  scope: string;
  image?: string;
  Icon: typeof CalendarDays;
}) {
  const [failedImage, setFailedImage] = useState<string | null>(null);
  return (
    <Link href={href} prefetch={false} className={styles.discoveryOuting}>
      {image && (
        <span className={styles.outingPhoto} aria-hidden="true">
          <Icon />
          {failedImage !== image && <Image src={image} alt="" fill
            sizes="(max-width: 360px) 288px, (max-width: 620px) 48vw, 240px"
            onError={() => setFailedImage(image)} />}
        </span>
      )}
      <span className={styles.outingCaption}>
        {!image && <Icon aria-hidden />}
        <span><strong>{title}</strong><small>{scope}</small></span>
        <ArrowRight aria-hidden className={styles.outingArrow} />
      </span>
    </Link>
  );
}

/** Both broad tasks retain the visitor's lens and exact origin. The old
 * pizza-only shortcut did not represent the range of things people need. */
export function todayDiscoveryTaskHref(task: TodayDiscoveryTask, scope: Scope | null, returnTo?: string): string {
  const active = parseScope(scope) ?? "county";
  const params = new URLSearchParams({ c: task, in: scopeToParam(active) });
  return withBrowseReturnTo(`/nearby?${params}`, returnTo);
}

/** No named place or photograph flashes before the actual browser lens is
 * resolved. This fallback cannot request location, metadata or image bytes. */
export function TodayGeographicDoorwayPending() {
  return <div data-today-geographic-pending aria-hidden="true" className={`${styles.geographicMosaic} ${styles.geographicPending}`} />;
}

function DiscoveryPlace({ place, scope, returnTo, lead }: { place: LocalDiscoveryPlace; scope: Scope; returnTo: string; lead: boolean }) {
  const [state, setState] = useState<PlaceCardPhotoState | null>(null);
  const source = selectedPlaceCardPhoto(place.photoPlan, state);
  const loaded = Boolean(source && state?.planKey === place.photoPlan.key && state.loadedSrc === source.src);
  const href = withBrowseReturnTo(`/places/${place.slug}?${new URLSearchParams({ in: scopeToParam(scope) })}`, returnTo);
  const onResult = (src: string, result: PlaceCardPhotoResult) => {
    setState(current => recordPlaceCardPhotoResult(place.photoPlan, current, src, result));
  };
  return (
    <article className={styles.discoveryPlace} data-today-discovery-role={lead ? "lead" : "secondary"}>
      <div className={styles.discoveryCard}>
      <Link href={href} prefetch={false} aria-label={`View ${place.name} in ${place.town}`}
        data-today-geographic-place={place.slug} data-today-discovery-action="place"
        data-photo-state={loaded ? "loaded" : source ? "pending" : "failed"}
        className={styles.discoveryPlaceLink}>
        {source ? <span className={styles.discoveryPhoto} data-today-photo-lead={lead || undefined}>
          <PlaceCardPhoto key={source.src} source={source} onResult={onResult}
            sizes="(min-width: 640px) 520px, calc(100vw - 32px)" />
        </span> : !lead && <MapPin aria-hidden data-today-discovery-glyph className={styles.discoveryGlyph} strokeWidth={1.75} />}
        <div data-today-geographic-caption data-today-name-plate={lead || undefined} className={styles.discoveryCaption}>
          <div className="min-w-0">
            <h3 className={styles.discoveryName}>{place.shortName ?? place.name}</h3>
            <p className={styles.discoveryTown}>{place.town}</p>
          </div>
          <span aria-hidden className={styles.discoveryAction}><ArrowUpRight className="h-4 w-4" strokeWidth={2.25} /></span>
        </div>
      </Link>
      <div className={styles.discoverySave}>
        <SaveButton refType="place" refId={place.slug} label={`Save ${place.name}`} barLabel="Save" importLocalSavesOnMount={false} />
      </div>
      </div>
      {source?.kind === "curated" && <div className={styles.discoveryCredit} data-today-discovery-credit={place.slug}>
        <PlaceCardPhotoCredit source={source} loaded={loaded} touchTarget compact discloseModifications />
      </div>}
    </article>
  );
}

/** The exact nonmerchant places are a small, reviewed editorial selection,
 * never a replacement ranking or an assertion about current access/weather.
 * Towns without accepted local imagery retain useful scoped tasks alone. */
export function TodayGeographicDoorwayView({ scope = null, returnTo, guidePhotos }: {
  scope?: Scope | null; returnTo?: string; guidePhotos?: TodayGuidePhotos;
}) {
  const active = parseScope(scope) ?? "county";
  const origin = returnTo ?? `/today?in=${scopeToParam(active)}`;
  const places = localDiscoveryPlaces(active);
  const [lead, ...secondary] = places;
  const photos = active === "county" || active === "town:frederick" ? guidePhotos : undefined;
  const outingOrigin = `${origin.split("#", 1)[0]}#local-outings`;
  const outings = (
    <nav id="local-outings" aria-label="Local outings" data-outing-photos={Boolean(photos)} className={styles.discoveryOutings}>
      <OutingLink href={withBrowseReturnTo("/today/weekend", outingOrigin)}
        title="This Weekend" scope="Frederick County" image={photos?.weekend} Icon={CalendarDays} />
      <OutingLink href={withBrowseReturnTo("/today/two-hours-downtown", outingOrigin)}
        title="Two Hours Downtown" scope="Frederick City" image={photos?.downtown} Icon={Footprints} />
    </nav>
  );
  return (
    <section id="today-discovery" data-today-local-discovery data-today-geographic-mosaic aria-labelledby="today-discovery-heading" className={styles.geographicMosaic}>
      <h2 id="today-discovery-heading" className="sr-only">Explore local</h2>
      {/* On a wide screen the browse links fill the column beside the lead
          photograph instead of leaving a blank band there. */}
      <div className={styles.discoveryLayout}>
      {lead ? <div data-today-discovery-grid className={styles.discoveryPlaceGrid}>
        <DiscoveryPlace key={`${active}:${lead.photoPlan.key}`} place={lead} scope={active} returnTo={origin} lead />
        {outings}
        {secondary.map(place => <DiscoveryPlace key={`${active}:${place.photoPlan.key}`} place={place} scope={active} returnTo={origin} lead={false} />)}
      </div> : outings}
      <nav data-today-discovery-tasks aria-label="Browse by need" className={styles.discoveryTasks}>
        <Link href={todayDiscoveryTaskHref("food", active, origin)} prefetch={false}
          data-today-discovery-action="food" className={styles.discoveryTask}>
          <span aria-hidden className={styles.discoveryTaskIcon}><Utensils className="h-5 w-5" /></span>
          <span>Eat &amp; drink</span><ArrowUpRight aria-hidden className="h-4 w-4 shrink-0" />
        </Link>
        <Link href={todayDiscoveryTaskHref("outside", active, origin)} prefetch={false}
          data-today-discovery-action="outside" className={styles.discoveryTask}>
          <span aria-hidden className={styles.discoveryTaskIcon}><Trees className="h-5 w-5" /></span>
          <span>Get outside</span><ArrowUpRight aria-hidden className="h-4 w-4 shrink-0" />
        </Link>
      </nav>
      </div>
    </section>
  );
}

function subscribe(listener: () => void) {
  const unsubscribe = subscribeScopeChange(() => listener());
  window.addEventListener("hashchange", listener);
  window.addEventListener("popstate", listener);
  return () => { unsubscribe(); window.removeEventListener("hashchange", listener); window.removeEventListener("popstate", listener); };
}
const snapshot = () => JSON.stringify([getScope() ?? "county", window.location.search, window.location.hash]);

/** The URL lens wins even when present but invalid; a saved town must not
 * replace that explicit county fallback. Back retains intent and section. */
export default function TodayGeographicDoorway({ guidePhotos }: { guidePhotos?: TodayGuidePhotos }) {
  const stored = useSyncExternalStore(subscribe, snapshot, () => null);
  const params = useSearchParams();
  if (stored === null) return <TodayGeographicDoorwayPending />;
  const [storedScope, , hash] = JSON.parse(stored) as [Scope, string, string];
  const scope = params.has("in") ? parseScope(params.get("in")) ?? "county" : storedScope;
  const returnParams = new URLSearchParams(params.toString());
  returnParams.set("in", scopeToParam(scope));
  return <TodayGeographicDoorwayView scope={scope} returnTo={`/today?${returnParams}${hash}`} guidePhotos={guidePhotos} />;
}
