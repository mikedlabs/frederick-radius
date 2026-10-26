"use client";

import { useEffect, useId, useRef, useState, type MouseEvent } from "react";
import Link from "next/link";
import Image from "next/image";
import { PAPER_CREAM_BLUR } from "@/lib/blur-placeholder";
import { PlaceCardPhotoCredit } from "@/components/place/PlaceCardPhoto";
import {
  isPlacePhotoFailureSignal,
  placeCardPhotoPlan,
  recordPlaceCardPhotoResult,
  selectedPlaceCardPhoto,
  type PlaceCardPhotoPlan,
  type PlaceCardPhotoSource,
  type PlaceCardPhotoState,
} from "@/lib/place-card-photo";
import {
  ArrowRight,
  Bookmark,
  Check,
  ChevronDown,
  CornerUpRight,
  Share2,
} from "lucide-react";
import { CATEGORY_BY_SLUG } from "@/data/categories";
import { MUNICIPALITY_BY_SLUG } from "@/data/municipalities";
import { formatDistance, haversineMeters, type LngLat } from "@/lib/geo";
import { directionsHref } from "@/lib/map/directionsHref";
import { formatHoursLine, type OpenStatus } from "@/lib/hours";
import { useFollowMutationState, useIsFollowed, useToggleFollow } from "@/hooks/useFollows";
import { toast } from "sonner";
import { haptic } from "@/lib/haptics";
import { logActivity, track } from "@/lib/track";
import { trackDecision } from "@/lib/decision/telemetry";
import type { GooglePhotoAttribution } from "@/lib/integrations/google-places";
import type { EventPin, MapPinPlace } from "./types";
import type { NearbyUtility } from "./mapNearby";
import {
  buildMapPeekDecisionSurface,
  mapPeekDecisionTelemetry,
  mapDecisionFreshnessLabel,
  type MapPeekDecisionCue,
  type MapPeekDecisionItem,
} from "./mapDecisionScenes";
import MapResultSurface from "./MapResultSurface";
import { curatedPhotoUrl } from "@/lib/integrations/wikimedia";
import styles from "./MapPeek.module.css";

type MapCardDetails = {
  slug: string;
  address?: string;
  city?: string;
  state?: string;
  postal_code?: string;
  google_photo_url?: string;
  hero_image?: string;
  google_photo_attribution?: GooglePhotoAttribution;
  google_maps_uri?: string;
  open_status?: OpenStatus;
  hours_updated_at?: string;
};

function isBundledPlacePhoto(source: PlaceCardPhotoSource): boolean {
  return source.kind === "owned" ||
    (source.kind === "curated" && Boolean(source.photo.localSrc?.startsWith("/")));
}

/** Only the selected-place identity is keyed. An unchanged local source keeps
 * its decoded bytes when fallback metadata arrives; changed source/credit
 * identities reset readiness without replacing the heading or actions.
 * Credits follow the heading row without overlapping its details hit target. */
export function MapPeekPhoto({
  plan, placeName, glyph, color,
  slug, photoPending = false, onOpenDetails, children,
}: {
  plan: PlaceCardPhotoPlan;
  placeName: string;
  glyph: string;
  color: string;
  slug?: string;
  photoPending?: boolean;
  onOpenDetails: (event: MouseEvent<HTMLButtonElement>) => void;
  children?: React.ReactNode;
}) {
  const [photo, setPhoto] = useState<PlaceCardPhotoState & { generation: number; plan: PlaceCardPhotoPlan }>(() => ({
    planKey: plan.key, failedSources: [], loadedSrc: null, generation: 0, plan,
  }));
  if (photo.planKey !== plan.key) {
    // A late fallback must not retry an exhausted URL. Only candidates in the
    // current approved plan survive; a removed local image cannot stay sticky.
    const failedSources = photo.failedSources.filter(src => plan.sources.some(source => source.src === src));
    const next = { ...photo, planKey: plan.key, failedSources, plan };
    const previousSource = selectedPlaceCardPhoto(photo.plan, photo);
    const nextSource = selectedPlaceCardPhoto(plan, next);
    const keepLocal = previousSource && isBundledPlacePhoto(previousSource) &&
      JSON.stringify(previousSource) === JSON.stringify(nextSource);
    // Changed credit, resources and A→B→A selections receive a new generation
    // so an old load/error callback cannot settle the replacement image.
    setPhoto({ ...next, loadedSrc: keepLocal ? photo.loadedSrc : null,
      generation: photo.generation + (keepLocal ? 0 : 1) });
  }
  const source = selectedPlaceCardPhoto(plan, photo);
  const ready = Boolean(source && photo.planKey === plan.key && photo.loadedSrc === source.src);
  const reportState = (result: "loaded" | "failed") => {
    if (!source) return;
    setPhoto(current => {
      if (current.generation !== photo.generation) return current;
      // Next Image can finish decode with a retained callback before its
      // callback ref updates. A new fallback plan must not strand the exact
      // same bundled image; changed sources, credits and generations stay out.
      if (current.planKey !== plan.key && !(isBundledPlacePhoto(source) &&
        JSON.stringify(selectedPlaceCardPhoto(current.plan, current)) === JSON.stringify(source))) return current;
      return { ...current, ...recordPlaceCardPhotoResult(current.plan, current, source.src, result) };
    });
  };
  return (
    <>
      <div className={`map-peek-body ${styles.body}`} data-map-place-slug={slug} data-has-photo={Boolean(source) || undefined} data-photo-kind={source?.kind}>
        <button
          type="button"
          className="map-peek-visual"
          data-press-target="control"
          data-loading={photoPending || Boolean(source && !ready) || undefined}
          onClick={onOpenDetails}
          aria-label={`Open details for ${placeName}`}
        >
          <span data-press-face className={styles.photoFace}>
          {source ? (
            <Image
              key={`${photo.generation}:${source.src}`}
              src={source.src}
              alt={ready ? source.alt || `Photo of ${placeName}` : ""}
              aria-hidden={!ready || undefined}
              data-map-peek-photo-state={ready ? "ready" : "loading"}
              data-map-peek-photo-source={source.kind}
              fill
              unoptimized={source.kind === "google"}
              sizes="(max-width: 520px) calc(100vw - 48px), 412px"
              placeholder="blur"
              blurDataURL={PAPER_CREAM_BLUR}
              className="absolute inset-0 h-full w-full object-cover"
              style={source.kind !== "google" ? { objectPosition: source.objectPosition } : undefined}
              onLoad={(event) => reportState(isPlacePhotoFailureSignal(event.currentTarget) ? "failed" : "loaded")}
              onError={() => reportState("failed")}
            />
          ) : (
            <span
              aria-hidden
              data-map-peek-photo-state={photo.planKey === plan.key && plan.sources.length > 0 ? "failed" : undefined}
              className="map-peek-category-mark"
              style={{ "--map-peek-color": color } as React.CSSProperties}
            >
              {glyph}
            </span>
          )}
          </span>
        </button>
        {children}
      </div>
      {ready && source && (source.kind !== "owned" || source.referenceContext === "appearance-unverified") && (
        <div className="map-peek-source-credit">
          <PlaceCardPhotoCredit source={source} loaded touchTarget discloseModifications />
        </div>
      )}
    </>
  );
}

function statusTone(status: OpenStatus): string {
  switch (status.state) {
    case "open":
      return "var(--state-open)";
    case "closing-soon":
      return "var(--state-closing)";
    default:
      return "var(--app-ink-3)";
  }
}

function decisionCueLabel(cue: MapPeekDecisionCue): string {
  if (cue.kind === "event") {
    return cue.eventState === "happening-now" ? "Happening now" : "Next here";
  }
  if (cue.kind === "utility") return "Closest useful point";
  return "Getting here";
}

function DecisionCueSource({ cue }: { cue: MapPeekDecisionCue }) {
  if (!cue.sourceLabel) return null;
  const sourceDate = mapDecisionFreshnessLabel(cue.observedAt);
  return (
    <p>
      <strong>Source</strong>{" "}
      {cue.sourceUrl ? (
        <a
          href={cue.sourceUrl}
          className="inline-flex min-h-11 items-center align-middle underline underline-offset-2"
          {...(cue.sourceUrl.startsWith("http")
            ? { target: "_blank", rel: "noreferrer" }
            : {})}
        >
          {cue.sourceLabel}
        </a>
      ) : cue.sourceLabel}
      {sourceDate ? ` · checked ${sourceDate}` : ""}
    </p>
  );
}

function DecisionCueAction({
  cue,
  outcome,
}: {
  cue: MapPeekDecisionItem;
  outcome: "action" | "fallback";
}) {
  if (!cue.href) return null;
  const label = cue.kind === "event" ? "View event" : "View details";
  return (
    <Link
      href={cue.href}
      className="ml-1 inline-flex min-h-11 items-center gap-0.5 align-middle font-semibold underline underline-offset-2"
      onClick={() => {
        logActivity(
          outcome === "action" ? "map_decision_action" : "map_decision_fallback",
          mapPeekDecisionTelemetry(cue),
        );
      }}
    >
      {label}
      <ArrowRight className="h-3.5 w-3.5" strokeWidth={2.2} aria-hidden />
    </Link>
  );
}

/**
 * A selected place should answer the first practical questions without
 * replacing the map. Heavy data is hydrated only for the one tapped pin:
 * authentic reviewed photo, street address, and the current hours verdict.
 * Secondary context stays behind one "Around here" disclosure.
 */
export default function MapPeek({
  place,
  hostedEvent = null,
  nearestGarage = null,
  nearbyUtilities = [],
  distanceOrigin,
  distanceOriginLabel,
  onClose,
  onDetails,
}: {
  place: MapPinPlace;
  hostedEvent?: EventPin | null;
  nearestGarage?: { name: string; distM: number; available: number | null } | null;
  nearbyUtilities?: NearbyUtility[];
  /** Device location when available. Without one, omit distance. */
  distanceOrigin: LngLat | null;
  distanceOriginLabel: "from you" | "from map center";
  onClose: () => void;
  onDetails: () => void;
}) {
  const cat = CATEGORY_BY_SLUG[place.category];
  const catColor = cat?.color ?? "var(--app-brand)";
  const saved = useIsFollowed(place.slug);
  const failureDescriptionRef = useRef<string | null>(null);
  const toggleSave = useToggleFollow(place.slug, "map_peek", (description) => { failureDescriptionRef.current = description; });
  const mutation = useFollowMutationState(place.slug);
  const saveBusyRef = useRef(false);
  const [saveIntent, setSaveIntent] = useState<boolean | null>(null);
  const saving = mutation === "saving" || mutation === "removing" || saveIntent !== null;
  const adding = saveIntent ?? mutation === "saving";
  const [details, setDetails] = useState<MapCardDetails | null>(null);
  const [detailsResolvedSlug, setDetailsResolvedSlug] = useState<string | null>(null);
  const [shareStatus, setShareStatus] = useState<"idle" | "copied">("idle");
  const exposedDecisionRef = useRef<string | null>(null);
  // A fixed card clock keeps ranking deterministic for the life of this peek
  // and avoids changing event copy between unrelated photo/details updates.
  const [decisionClock] = useState(() => new Date().toISOString());
  const activeDetails = details?.slug === place.slug ? details : null;
  const town = MUNICIPALITY_BY_SLUG[place.municipality]?.name;
  const status = activeDetails?.open_status ?? place.open_status;
  const hoursLine = formatHoursLine(status);
  const dist =
    distanceOrigin && place.geom
      ? formatDistance(haversineMeters(distanceOrigin, place.geom))
      : null;
  const address = activeDetails?.address?.trim();
  const locationLine = address || town;
  // Exact owned or locally bundled licensed images need no metadata trip. The
  // selected route remains the only Google URL/credit transport. One selected
  // image uses a bounded 360 CSS px target (at most 720 provider pixels),
  // without adding requests to browse lists or changing provider allowances.
  const selectedPhotoPlan = placeCardPhotoPlan({
    slug: place.slug,
    google_photo_url: activeDetails?.google_photo_url ?? activeDetails?.hero_image,
    google_photo_attribution: activeDetails?.google_photo_attribution,
  }, 360);
  // Avoid starting a remote Commons request before the selected route can
  // provide its preferred Google photo. Local reviewed bytes have no such wait.
  const eligibleSources = activeDetails || detailsResolvedSlug === place.slug
    ? selectedPhotoPlan.sources
    : selectedPhotoPlan.sources.filter(source => source.kind === "owned" ||
      (source.kind === "curated" && source.photo.localSrc));
  // Reuse only free files already admitted by the shared policy. Map can show
  // those exact bytes immediately without buying a replacement on metadata load.
  const photoSources = [
    ...eligibleSources.filter(isBundledPlacePhoto),
    ...eligibleSources.filter(source => !isBundledPlacePhoto(source)),
  ].map(source => source.kind === "curated"
    ? { ...source, src: curatedPhotoUrl(source.photo, 720) }
    : source);
  const photoPlan: PlaceCardPhotoPlan = {
    // Include every active source and its credit so policy/identity changes
    // reach the display boundary even when the first local URL is unchanged.
    key: JSON.stringify([place.slug, photoSources]),
    sources: photoSources,
  };
  const photoPending = photoPlan.sources.length === 0 && !activeDetails && detailsResolvedSlug !== place.slug;
  const dirHref = place.geom ? directionsHref(place.geom.lat, place.geom.lng) : "#";
  const nameId = useId();
  const descriptionId = useId();
  const decisionSurface = buildMapPeekDecisionSurface({
    place,
    hostedEvent,
    nearestGarage,
    nearbyUtilities,
    now: decisionClock,
  });
  const decisionCue = decisionSurface?.lead ?? null;
  const decisionAlternatives = decisionSurface?.alternatives ?? [];
  const decisionCandidateId = decisionCue?.candidateId ?? null;
  const decisionKind = decisionCue?.kind ?? null;
  const decisionReasonIds = decisionCue?.reasonIds.join(",") ?? "";
  const aroundCount = decisionCue ? 1 + decisionAlternatives.length : 0;

  useEffect(() => {
    trackDecision({
      stage: "impression",
      surface: "map",
      entityKind: "place",
      entityId: place.slug,
      position: "result",
    });
  }, [place.slug]);

  useEffect(() => {
    if (!decisionCandidateId || !decisionKind) return;
    const exposureKey = `${place.slug}:${decisionCandidateId}:${decisionReasonIds}`;
    if (exposedDecisionRef.current === exposureKey) return;
    exposedDecisionRef.current = exposureKey;
    logActivity("map_decision_exposure", {
      candidate_id: decisionCandidateId,
      candidate_kind: decisionKind,
      reason_ids: decisionReasonIds,
    });
  }, [
    decisionCandidateId,
    decisionKind,
    decisionReasonIds,
    place.slug,
  ]);

  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/places/map-card/${encodeURIComponent(place.slug)}`, {
      signal: controller.signal,
    })
      .then((response) => (response.ok ? response.json() : null))
      .then((body: { place?: MapCardDetails | null } | null) => {
        if (body?.place?.slug === place.slug) setDetails(body.place);
        setDetailsResolvedSlug(place.slug);
      })
      .catch((error: unknown) => {
        if ((error as { name?: string })?.name !== "AbortError") {
          // Pin data still provides the name, status, category, and actions.
          setDetailsResolvedSlug(place.slug);
        }
      });
    return () => controller.abort();
  }, [place.slug]);

  const sharePlace = async () => {
    const url = new URL(window.location.href);
    url.searchParams.set("place", place.slug);
    url.searchParams.delete("event");
    haptic("light");
    track("map_share", { surface: "place", slug: place.slug });
    trackDecision({
      stage: "action",
      surface: "map",
      entityKind: "place",
      entityId: place.slug,
      position: "result",
      action: "share",
    });
    try {
      if (navigator.share) {
        await navigator.share({
          title: place.name,
          text: `${place.name} on the Frederick Radius map.`,
          url: url.toString(),
        });
      } else {
        await navigator.clipboard.writeText(url.toString());
        setShareStatus("copied");
        window.setTimeout(() => setShareStatus("idle"), 2200);
      }
    } catch (error) {
      if ((error as { name?: string })?.name === "AbortError") return;
      try {
        await navigator.clipboard.writeText(url.toString());
        setShareStatus("copied");
        window.setTimeout(() => setShareStatus("idle"), 2200);
      } catch {
        // Leave the card intact when browser sharing is unavailable.
      }
    }
  };

  const openDetails = (event: MouseEvent<HTMLButtonElement>) => {
    // Safari pointer activation can blur a button before its click callback.
    // The sheet provider captures the current active element synchronously;
    // hand it this exact opener, without moving the map or scroll position.
    event.currentTarget.focus({ preventScroll: true });
    trackDecision({
      stage: "open",
      surface: "map",
      entityKind: "place",
      entityId: place.slug,
      position: "result",
      action: "open",
    });
    onDetails();
  };

  return (
    <MapResultSurface
      className={`map-peek ${styles.preview}`}
      labelledBy={nameId}
      describedBy={descriptionId}
      closeLabel={`Close ${place.name}`}
      onClose={onClose}
    >
      <MapPeekPhoto
        key={place.slug}
        plan={photoPlan}
        placeName={place.name}
        glyph={place.name.slice(0, 1)}
        color={catColor}
        slug={place.slug}
        photoPending={photoPending}
        onOpenDetails={openDetails}
      >
        <div className="map-peek-text">
          <div className={styles.heading}>
            <button type="button" className="map-peek-title-button" data-press-target="control" onClick={openDetails}>
              <span data-press-face id={nameId} className="map-peek-name">{place.name}</span>
            </button>
            <button type="button" className="map-peek-details-link" data-press-target="control" onClick={openDetails}>
              <span data-press-face className={styles.actionFace}>Details
                <ArrowRight className="h-3.5 w-3.5" strokeWidth={2.2} aria-hidden />
              </span>
            </button>
          </div>
          <span className="map-peek-meta">
            <span className={styles.status} data-map-place-status={status.state} style={{ color: statusTone(status) }}>{hoursLine}</span>
            {dist && (
              <>
                <span aria-hidden className="map-peek-dot">·</span>
                <span className="map-peek-dist">{dist} {distanceOriginLabel}</span>
              </>
            )}
          </span>
          {locationLine && <span className="map-peek-address">{locationLine}</span>}
        </div>
      </MapPeekPhoto>

      {aroundCount > 0 && (
        <details className="map-peek-around">
          <summary data-map-decision-lead={decisionCue?.candidateId}>
            {decisionCue?.headline ?? "Around here"}
            <span>{aroundCount}</span>
            <ChevronDown className="h-4 w-4" strokeWidth={2.2} aria-hidden />
          </summary>
          <div className="map-peek-around-body">
            {decisionCue && (
              <p data-map-decision-cue={decisionCue.kind}>
                <strong>{decisionCueLabel(decisionCue)}</strong> {decisionCue.detail}
                <DecisionCueAction cue={decisionCue} outcome="action" />
              </p>
            )}
            {decisionCue && <DecisionCueSource cue={decisionCue} />}
            {decisionAlternatives.length > 0 && (
              <div
                data-map-decision-alternatives
                className="grid gap-2 pt-1"
                style={{ borderTop: "1px solid var(--app-border)" }}
              >
                {decisionAlternatives.map((alternative) => (
                  <div
                    key={alternative.candidateId}
                    data-map-decision-alternative={alternative.candidateId}
                  >
                    <p>
                      <strong>{decisionCueLabel(alternative)}</strong> {alternative.detail}
                      <DecisionCueAction cue={alternative} outcome="fallback" />
                    </p>
                    <DecisionCueSource cue={alternative} />
                  </div>
                ))}
              </div>
            )}
          </div>
        </details>
      )}

      <span id={descriptionId} className="sr-only">
        {cat?.name ?? place.category}. {hoursLine}.
        {locationLine ? ` ${locationLine}.` : ""}
        {dist ? ` ${dist} ${distanceOriginLabel}.` : ""}
        Open details, save, share, or get directions.
      </span>

      <div className="map-peek-acts">
        <a
          href={dirHref}
          target="_blank"
          rel="noopener noreferrer"
          className="map-peek-act map-peek-act-go"
          data-press-target="control"
          style={{ "--press-ack-color": "var(--app-on-brand)", "--press-focus-color": "var(--app-on-brand)" } as React.CSSProperties}
          onClick={() => {
            haptic("light");
            track("map_peek", { pick: "directions" });
            trackDecision({
              stage: "action",
              surface: "map",
              entityKind: "place",
              entityId: place.slug,
              position: "result",
              action: "directions",
            });
          }}
        >
          <span data-press-face className={styles.actionFace}>
            <CornerUpRight className="h-4 w-4" strokeWidth={2} aria-hidden />
            Directions
          </span>
        </a>
        <button
          type="button"
          className="map-peek-act"
          data-press-target="control"
          data-on={saved || undefined}
          aria-pressed={saved}
          disabled={saving}
          aria-busy={saving}
          onClick={async () => {
            if (saveBusyRef.current) return;
            saveBusyRef.current = true;
            setSaveIntent(!saved);
            failureDescriptionRef.current = null;
            try {
              const nowSaved = await toggleSave(!saved);
              if (failureDescriptionRef.current !== null || nowSaved === saved) throw new Error("Save state did not change");
              haptic("light");
              track("map_peek", { pick: nowSaved ? "save" : "unsave" });
              if (nowSaved) {
                trackDecision({
                  stage: "action",
                  surface: "map",
                  entityKind: "place",
                  entityId: place.slug,
                  position: "result",
                  action: "save",
                });
              }
            } catch {
              toast.error(saved ? "Could not remove from Saved" : "Could not save this place", {
                description: failureDescriptionRef.current ?? "We could not confirm this change. Please try again.",
              });
            } finally {
              setSaveIntent(null);
              saveBusyRef.current = false;
            }
          }}
        >
          <span data-press-face className={styles.actionFace}>
          <Bookmark
            className="h-4 w-4"
            strokeWidth={2}
            fill={saved ? "currentColor" : "none"}
            aria-hidden
          />
          {saving ? adding ? "Saving…" : "Removing…" : saved ? "Saved" : "Save"}
          </span>
        </button>
        <button
          type="button"
          className="map-peek-act map-peek-act-share"
          data-press-target="control"
          onClick={() => void sharePlace()}
          aria-label={shareStatus === "copied" ? "Link copied" : `Share ${place.name}`}
        >
          <span data-press-face className={styles.actionFace}>
          {shareStatus === "copied"
            ? <Check className="h-4 w-4" strokeWidth={2} aria-hidden />
            : <Share2 className="h-4 w-4" strokeWidth={2} aria-hidden />}
          <span>{shareStatus === "copied" ? "Copied" : "Share"}</span>
          </span>
        </button>
      </div>
    </MapResultSurface>
  );
}
