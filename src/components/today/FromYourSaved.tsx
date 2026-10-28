"use client";

import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ArrowRight, BookmarkCheck, MapPin } from "lucide-react";
import SectionHeading from "@/components/ui/SectionHeading";
import PlaceCategoryArtwork from "@/components/place/PlaceCategoryArtwork";
import PlaceCardPhoto, { PlaceCardPhotoCredit } from "@/components/place/PlaceCardPhoto";
import PlaceStatus from "@/components/place/PlaceStatus";
import { useFollowedSlugs } from "@/hooks/useFollows";
import { useSavedList } from "@/hooks/useSaved";
import type { PlaceCardData } from "@/lib/loaders/places";
import { MUNICIPALITY_BY_SLUG } from "@/data/municipalities";
import { withBrowseReturnTo } from "@/lib/browse-return";
import { withDeadlineOutcome } from "@/lib/promise-deadline";
import { getScope, parseScope, scopeToParam, subscribeScopeChange } from "@/lib/scope";
import { recordPlaceCardPhotoResult, selectedPlaceCardPhoto, type PlaceCardPhotoResult, type PlaceCardPhotoState } from "@/lib/place-card-photo";
import { todaySavedPlacePhotoPlan } from "@/lib/today/saved-place-photo";
import styles from "./FromYourSaved.module.css";

const MAX_LOOKUP = 4;
const MAX_SHOWN = 2;
const READ_DEADLINE_MS = 8_000;
type Details = { key: string; state: "ready"; places: PlaceCardData[] } | { key: string; state: "error" };

function SavedPlacePreview({ place, returnTo }: { place: PlaceCardData; returnTo: string }) {
  const plan = todaySavedPlacePhotoPlan(place.slug);
  const [result, setResult] = useState<PlaceCardPhotoState | null>(null);
  const source = selectedPlaceCardPhoto(plan, result);
  const loaded = Boolean(source && result?.planKey === plan.key && result.loadedSrc === source.src);
  const onResult = (src: string, outcome: PlaceCardPhotoResult) => setResult(current => recordPlaceCardPhotoResult(plan, current, src, outcome));
  const town = MUNICIPALITY_BY_SLUG[place.municipality]?.name ?? place.city;
  // A saved destination may be outside Today's current area. The map opens
  // its actual town; the return URL restores the person's original lens.
  const mapScope = MUNICIPALITY_BY_SLUG[place.municipality] ? place.municipality : "county";
  const detailHref = withBrowseReturnTo(`/places/${place.slug}`, returnTo);
  const mapHref = withBrowseReturnTo(`/map?${new URLSearchParams({ place: place.slug, in: mapScope })}`, returnTo);
  const unknownHours = place.open_status.state === "unknown" || place.open_status.state === "unverified";
  return <article className={styles.card} data-today-saved-place={place.slug}>
    <Link href={detailHref} prefetch={false} className={styles.destination} aria-label={`View saved place: ${place.name}`}>
      <div className={styles.media} data-today-saved-media={source ? "photo" : "artwork"}>
        {source ? <PlaceCardPhoto key={source.src} source={source} onResult={onResult}
          sizes="(min-width: 640px) 280px, calc((100vw - 44px) / 2)" />
          : <PlaceCategoryArtwork name={place.name} category={place.category} />}
      </div>
      <div className={styles.copy}>
        <h3>{place.name}</h3>
        <span className={styles.town}>{town}</span>
        {unknownHours ? <span className={styles.hours}>Hours not confirmed</span> : <PlaceStatus status={place.open_status} />}
      </div>
    </Link>
    <div className={styles.actions}>
      <span><BookmarkCheck aria-hidden />Saved</span>
      <Link href={mapHref} prefetch={false} aria-label={`Map saved place: ${place.name}`}><MapPin aria-hidden />Map<ArrowRight aria-hidden /></Link>
    </div>
    <PlaceCardPhotoCredit source={source} loaded={loaded} touchTarget compact />
  </article>;
}

/** Presentational workshop surface; membership fixtures never write saves. */
export function FromYourSavedView({ places, state = "ready", returnTo = "/today", onRetry }: {
  places: PlaceCardData[];
  state?: "ready" | "loading" | "error" | "unavailable";
  returnTo?: string;
  onRetry?: () => void;
}) {
  if (state === "ready" && places.length === 0) return null;
  return <section id="today-saved" data-today-saved aria-label="Your saved places" className={styles.section}>
    <SectionHeading title="Your saved places" href="/my-radius" cta="All saved" size="sm" />
    {state === "loading" ? <p role="status" className={styles.notice}>Loading your saved places…</p>
      : state === "error" ? <div className={styles.notice} role="status">
        <p>Your saved list is kept, but the place details could not load.</p>
        {onRetry && <button type="button" onClick={onRetry}>Try again</button>}
      </div>
      : state === "unavailable" ? <p className={styles.notice}>These saved places are not available in the current guide. You can still open All saved.</p>
      : <div className={styles.grid}>{places.slice(0, MAX_SHOWN).map(place => <SavedPlacePreview key={place.slug} place={place} returnTo={returnTo} />)}</div>}
  </section>;
}

function subscribeOrigin(listener: () => void) {
  const unsubscribe = subscribeScopeChange(() => listener());
  window.addEventListener("hashchange", listener);
  window.addEventListener("popstate", listener);
  return () => { unsubscribe(); window.removeEventListener("hashchange", listener); window.removeEventListener("popstate", listener); };
}
const originSnapshot = () => JSON.stringify([getScope() ?? "county", window.location.hash]);

/** A saved membership is useful independently of confirmed opening hours.
 * Passive arrival reads never import device saves into an account. Fetch a
 * bounded set once, retain membership on failure, and reject superseded reads. */
export default function FromYourSaved() {
  const { slugs, loading, authed } = useFollowedSlugs(undefined, { importLocalSavesOnMount: false });
  const deviceSaves = useSavedList();
  const params = useSearchParams();
  const origin = useSyncExternalStore(subscribeOrigin, originSnapshot, () => null);
  const selected = useMemo(() => {
    const ordered = [...slugs];
    // The account store retains its initial server order and prepends newly
    // confirmed additions. Device saves have their own real capture clocks;
    // equal clocks use their recorded append order, never an invented date.
    if (!authed) {
      const dates = new Map<string, { at: number; index: number }>();
      deviceSaves.forEach((save, index) => {
        if (save.type !== "place" || !slugs.has(save.id)) return;
        const at = Date.parse(save.saved_at);
        if (!Number.isFinite(at)) return;
        const previous = dates.get(save.id);
        if (!previous || at >= previous.at) dates.set(save.id, { at, index });
      });
      const sourceOrder = new Map(ordered.map((slug, index) => [slug, index]));
      ordered.sort((a, b) => {
        const aDate = dates.get(a), bDate = dates.get(b);
        if (aDate && bDate) return bDate.at - aDate.at || bDate.index - aDate.index;
        if (aDate || bDate) return aDate ? -1 : 1;
        return sourceOrder.get(a)! - sourceOrder.get(b)!;
      });
    }
    return ordered.slice(0, MAX_LOOKUP);
  }, [slugs, authed, deviceSaves]);
  const selectedKey = JSON.stringify(selected);
  const [retry, setRetry] = useState(0);
  const requestKey = `${selectedKey}:${retry}`;
  const [details, setDetails] = useState<Details | null>(null);

  useEffect(() => {
    const selected = JSON.parse(selectedKey) as string[];
    if (loading || selected.length === 0) return;
    let cancelled = false;
    const controller = new AbortController();
    const requested = new Set(selected);
    const read = fetch(`/api/places/by-slugs?slugs=${encodeURIComponent(selected.join(","))}`, { signal: controller.signal })
      .then(async response => {
        if (!response.ok) throw new Error("Saved details unavailable");
        const data = await response.json() as { places?: PlaceCardData[] };
        if (!Array.isArray(data.places) || data.places.some(place => !place || typeof place.slug !== "string")) throw new Error("Invalid saved details");
        const bySlug = new Map(data.places.filter(place => requested.has(place.slug)).map(place => [place.slug, place]));
        return selected.flatMap(slug => { const place = bySlug.get(slug); return place ? [place] : []; });
      });
    void withDeadlineOutcome(read, READ_DEADLINE_MS).then(outcome => {
      if (cancelled) return;
      if (outcome.status !== "fulfilled") {
        controller.abort();
        setDetails({ key: requestKey, state: "error" });
      } else {
        setDetails({ key: requestKey, state: "ready", places: outcome.value });
      }
    });
    return () => { cancelled = true; controller.abort(); };
  }, [loading, selectedKey, requestKey]);

  // Unknown membership is not an empty list, and is never presented as one.
  if (loading || selected.length === 0) return null;
  const [storedScope, hash] = origin ? JSON.parse(origin) : ["county", ""];
  const scope = params.has("in") ? parseScope(params.get("in")) ?? "county" : parseScope(storedScope) ?? "county";
  const returnParams = new URLSearchParams(params.toString());
  returnParams.set("in", scopeToParam(scope));
  const returnTo = `/today?${returnParams}${hash}`;
  const current = details?.key === requestKey ? details : null;
  const places = current?.state === "ready" ? current.places : [];
  return <FromYourSavedView places={places} returnTo={returnTo}
    state={!current ? "loading" : current.state === "error" ? "error" : places.length === 0 ? "unavailable" : "ready"}
    onRetry={() => setRetry(value => value + 1)} />;
}
