"use client";

import {
  Accessibility,
  Building2,
  BusFront,
  ChevronDown,
  CircleParking,
  DoorOpen,
  ExternalLink,
  LocateFixed,
  MapPin,
  MessageSquareWarning,
  Megaphone,
  Navigation,
  PawPrint,
  Scan,
  Search,
  Share2,
  Toilet,
  TicketCheck,
  X,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";
import MapCanvas, {
  AttributionControl,
  Layer,
  Marker,
  NavigationControl,
  Source,
  type MapRef,
} from "react-map-gl/maplibre";
import "maplibre-gl/dist/maplibre-gl.css";

import { hasWebGL } from "@/components/map/mapCameraHelpers";
import { isFatalMapboxError } from "@/components/map/mapboxFailure";
import { useFrederickFlavorStyle } from "@/components/map/useFrederickFlavorStyle";
import {
  greatFrederickFair2026MapAdditions,
  greatFrederickFair2026MapPatches,
} from "@/data/fair/great-frederick-fair-2026-map-overlays";
import { readSavedFairCar, type SavedFairCar } from "@/lib/fair/car-memory";
import {
  FAIR_GROUNDS_MAP_URL,
  enrichFairGroundsMap,
  fairGroundsFeatureMatchesFilter,
  fairGroundsFeatureMatchesPlace,
  fairGroundsMapKindLabel,
  parseFairGroundsMap,
  type FairGroundsMap,
  type FairGroundsMapFeature,
  type FairGroundsMapFilter,
  type FairGroundsMapKind,
} from "@/lib/fair/grounds-map";
import {
  FAIR_MAP_SELECTION_HISTORY_KEY,
  isFairMapSelectionHistoryState,
} from "@/lib/fair/map-selection-history";
import { groupCollidingMobileMarkers } from "@/lib/fair/mobile-marker-layout";
import { OPEN_FEEDBACK_EVENT } from "@/lib/feedback-ui";
import { haptic } from "@/lib/haptics";
import { FAIR_DAY_PATH } from "@/lib/fair/plan-status";
import { directionsHref } from "@/lib/map/directionsHref";
import { mapCameraDuration } from "@/lib/motion";
import { MAP_LABEL_FONT_MEDIUM } from "@/lib/map/frederickFlavorStyle";

import FairGroundsMapLoading from "./FairGroundsMapLoading";
import FairGroundsMapMasthead from "./FairGroundsMapMasthead";
import FairMapCanvasBoundary from "./FairMapCanvasBoundary";
import FairLiveTransit from "./FairLiveTransit";
import FairAerialLayer, { FAIR_AERIAL_ATTRIBUTION, useFairAerialStatus } from "./FairAerialLayer";

export type FairGroundsMapSavedStop = {
  id: string;
  title: string;
  placeLabel: string;
};

export type FairGroundsMapProgramItem = {
  id: string;
  title: string;
  timeLabel: string;
  placeLabel: string;
};

export type FairGroundsMapFocusRequest = {
  programItemId: string;
  requestId: number;
};

export type FairGroundsMapProps = {
  savedStops: FairGroundsMapSavedStop[];
  programItems: FairGroundsMapProgramItem[];
  focusRequest?: FairGroundsMapFocusRequest | null;
  onBrowseProgram: () => void;
  onFocusRequestHandled?: (requestId: number) => void;
  onOpenProgramItem?: (itemId: string) => void;
};

type FairGroundsMapView = FairGroundsMapFilter | "program";

type FairMapSnapshotStatus = "loading" | "failed" | "retrying" | "ready";

type FairGroundsMarkerGroup = {
  id: string;
  features: FairGroundsMapFeature[];
  representative: FairGroundsMapFeature;
};

function fairMapSelectionUrl(featureId: string | null): string {
  const url = new URL(window.location.href);
  if (featureId) url.searchParams.set("meet", featureId);
  else url.searchParams.delete("meet");
  url.hash = "fair-map";
  return `${url.pathname}${url.search}${url.hash}`;
}

const FAIR_VIEW = {
  longitude: -77.3943,
  latitude: 39.4125,
  zoom: 16.25,
};
const FAIR_NEARBY_BOUNDS: [number, number, number, number] = [
  -77.4045, 39.4065, -77.385, 39.4205,
];
// A portrait canvas is taller than the old grounds-focused camera bounds.
// Give the camera enough Frederick context to zoom out and include the two
// official edge transit stops without widening the separate location check.
const FAIR_CAMERA_BOUNDS: [number, number, number, number] = [
  -77.405, 39.395, -77.3825, 39.43,
];
const FAIR_GROUNDS_BOUNDS: [number, number, number, number] = [
  -77.398595, 39.4101944, -77.391291, 39.4152037,
];
const MAP_LOAD_WATCHDOG_MS = 18_000;

type FairMapRuntime = "checking" | "interactive" | "unsupported" | "failed";
// The reviewed arrival layer reaches the official transit stops on both sides
// of the grounds. Narrow phones need this floor for the initial fit to include
// those stops instead of clipping them at the previous grounds-only zoom.
const FAIR_ARRIVAL_MIN_ZOOM = 13.5;

const FILTERS: Array<{
  id: FairGroundsMapView;
  label: string;
  compactLabel: string;
  tone: string;
}> = [
  {
    id: "arrival",
    label: "Arrive and enter",
    compactLabel: "Arrive",
    tone: "var(--app-cool)",
  },
  {
    id: "program",
    label: "On this day",
    compactLabel: "Program places",
    tone: "var(--app-accent)",
  },
  {
    id: "essentials",
    label: "Entry + essentials",
    compactLabel: "Essentials",
    tone: "var(--app-brand-press)",
  },
  {
    id: "animals",
    label: "Animals",
    compactLabel: "Animals",
    tone: "var(--app-brand-2)",
  },
  {
    id: "buildings",
    label: "Buildings",
    compactLabel: "Buildings",
    tone: "var(--app-warning-press)",
  },
];

// FairDayWorkspace conditionally mounts the map as visitors move between its
// four modes. Remember the chosen lens for that client-side journey only;
// a document reload evaluates this module again and restores Essentials.
let rememberedFairGroundsMapFilter: FairGroundsMapView | null = null;

function readRememberedFairGroundsMapFilter(): FairGroundsMapView | null {
  return rememberedFairGroundsMapFilter;
}

function rememberFairGroundsMapFilter(filter: FairGroundsMapView): void {
  rememberedFairGroundsMapFilter = filter;
}

const ACCESSIBLE_PLACE_GROUPS: Array<{
  id: "arrive" | "essentials" | "explore";
  label: string;
  detail: string;
  kinds: readonly FairGroundsMapKind[];
}> = [
  {
    id: "arrive",
    label: "Arrive and enter",
    detail: "Parking, transit, and gates",
    kinds: ["parking", "transit", "gate"],
  },
  {
    id: "essentials",
    label: "Find essentials",
    detail: "Restrooms, tickets, and guest services",
    kinds: ["restroom", "ticket", "service"],
  },
  {
    id: "explore",
    label: "Explore the grounds",
    detail: "Buildings, animals, and show areas",
    kinds: ["building", "animal", "stage"],
  },
];

const MARKER_THEME: Record<
  Exclude<FairGroundsMapKind, "fairgrounds">,
  { color: string; background: string }
> = {
  gate: { color: "var(--app-brand-press)", background: "var(--app-brand-tint-6)" },
  ticket: { color: "var(--app-brand-press)", background: "var(--app-brand-tint-6)" },
  restroom: { color: "var(--app-cool)", background: "var(--app-bg-elevated-solid)" },
  building: { color: "var(--app-warning-press)", background: "var(--app-bg-elevated-solid)" },
  animal: { color: "var(--app-brand-2)", background: "var(--app-bg-elevated-solid)" },
  stage: { color: "var(--app-accent-press)", background: "var(--app-bg-elevated-solid)" },
  parking: { color: "var(--app-cool)", background: "var(--app-bg-elevated-solid)" },
  service: { color: "var(--app-cool)", background: "var(--app-bg-elevated-solid)" },
  transit: { color: "var(--app-cool)", background: "var(--app-bg-elevated-solid)" },
};

function markerTone(kind: FairGroundsMapKind): string {
  return kind === "fairgrounds"
    ? "var(--app-brand-press)"
    : MARKER_THEME[kind].color;
}

function markerIcon(kind: FairGroundsMapKind) {
  return {
    gate: DoorOpen,
    ticket: TicketCheck,
    restroom: Toilet,
    building: Building2,
    animal: PawPrint,
    stage: Megaphone,
    parking: CircleParking,
    service: Accessibility,
    transit: BusFront,
    fairgrounds: MapPin,
  }[kind];
}

const CLUSTER_KIND_LABELS: Record<
  Exclude<FairGroundsMapKind, "fairgrounds">,
  { singular: string; plural: string }
> = {
  gate: { singular: "gate", plural: "gates" },
  ticket: { singular: "ticket booth", plural: "ticket booths" },
  restroom: { singular: "restroom", plural: "restrooms" },
  building: { singular: "building", plural: "buildings" },
  animal: { singular: "animal area", plural: "animal areas" },
  stage: { singular: "show area", plural: "show areas" },
  parking: { singular: "parking area", plural: "parking areas" },
  service: { singular: "guest service", plural: "guest services" },
  transit: { singular: "transit stop", plural: "transit stops" },
};

const CLUSTER_KIND_PRIORITY: Array<Exclude<FairGroundsMapKind, "fairgrounds">> = [
  "gate",
  "parking",
  "transit",
  "ticket",
  "restroom",
  "service",
  "stage",
  "animal",
  "building",
];

function markerClusterSummary(features: FairGroundsMapFeature[]): {
  compact: string;
  detailed: string;
} {
  const counts = new Map<Exclude<FairGroundsMapKind, "fairgrounds">, number>();
  features.forEach((feature) => {
    if (feature.properties.kind === "fairgrounds") return;
    counts.set(
      feature.properties.kind,
      (counts.get(feature.properties.kind) ?? 0) + 1,
    );
  });
  const ranked = CLUSTER_KIND_PRIORITY.filter((kind) => counts.has(kind)).sort(
    (left, right) =>
      (counts.get(right) ?? 0) - (counts.get(left) ?? 0) ||
      CLUSTER_KIND_PRIORITY.indexOf(left) - CLUSTER_KIND_PRIORITY.indexOf(right),
  );
  const phrases = ranked.map((kind) => {
    const count = counts.get(kind) ?? 0;
    const label = CLUSTER_KIND_LABELS[kind];
    return `${count} ${count === 1 ? label.singular : label.plural}`;
  });
  const leadKind = ranked[0];
  const leadCount = leadKind ? (counts.get(leadKind) ?? 0) : features.length;
  const leadLabel = leadKind
    ? CLUSTER_KIND_LABELS[leadKind][leadCount === 1 ? "singular" : "plural"]
    : "places";
  return {
    compact: ranked.length > 1 ? `${leadLabel} + more` : leadLabel,
    detailed: phrases.join(", "),
  };
}

function fairGroundsMapPurposeLabel(feature: FairGroundsMapFeature): string {
  return {
    gate: "Fair gate",
    ticket: "Tickets and entry help",
    restroom: "Restroom",
    building: "Fair building",
    animal: "Animal area",
    stage: "Shows and performances",
    parking: "Fair parking",
    service: "Guest service",
    transit: "Transit stop",
    fairgrounds: "Fairgrounds",
  }[feature.properties.kind];
}

function fairGroundsMapFilterForFeature(
  feature: FairGroundsMapFeature,
): FairGroundsMapView {
  return feature.properties.kind === "animal"
    ? "animals"
    : feature.properties.kind === "building"
      ? "buildings"
      : feature.properties.kind === "parking" ||
          feature.properties.kind === "transit" ||
          feature.properties.filterIds?.includes("arrival")
        ? "arrival"
        : "essentials";
}

function locationPrecisionLabel(
  precision: FairGroundsMapFeature["properties"]["locationPrecision"],
): string | null {
  return {
    "mapped-feature": "Mapped place",
    "official-pin": "Official arrival pin",
    "published-area": "Published area; follow signs",
    "static-transit-stop": "Static county transit stop",
  }[precision ?? "mapped-feature"] ?? null;
}

function mappedFeatureName(
  feature: FairGroundsMapFeature,
  map: FairGroundsMap,
): string {
  const duplicates = map.features
    .filter(
      (candidate) =>
        candidate.properties.name === feature.properties.name &&
        candidate.properties.kind === feature.properties.kind,
    )
    .sort(
      (left, right) =>
        right.properties.anchor[1] - left.properties.anchor[1] ||
        left.properties.anchor[0] - right.properties.anchor[0],
    );
  if (duplicates.length < 2) return feature.properties.name;
  const markerNumber =
    duplicates.findIndex(
      (candidate) => candidate.properties.id === feature.properties.id,
    ) + 1;
  return `${feature.properties.name} · map marker ${markerNumber}`;
}

function isNearFair(longitude: number, latitude: number): boolean {
  return (
    longitude >= FAIR_NEARBY_BOUNDS[0] &&
    longitude <= FAIR_NEARBY_BOUNDS[2] &&
    latitude >= FAIR_NEARBY_BOUNDS[1] &&
    latitude <= FAIR_NEARBY_BOUNDS[3]
  );
}

function reportMapIssue(feature: FairGroundsMapFeature | null) {
  window.dispatchEvent(
    new CustomEvent(OPEN_FEEDBACK_EVENT, {
      detail: {
        fairIssue: "map_wrong",
        fairContext: feature
          ? `${feature.properties.name} · ${feature.properties.id}`
          : "Fair grounds map",
      },
    }),
  );
}

function FairMapCanvasFallback({
  map,
  reason,
  mapWasInteractive = false,
}: {
  map: FairGroundsMap;
  reason: Extract<FairMapRuntime, "unsupported" | "failed">;
  mapWasInteractive?: boolean;
}) {
  const browsePlaces = () => {
    const list = document.getElementById("fair-map-place-list");
    if (list instanceof HTMLDetailsElement) list.open = true;
    list?.scrollIntoView({ block: "start" });
    list?.querySelector<HTMLElement>("summary")?.focus({ preventScroll: true });
  };

  return (
    <div
      data-fair-map-canvas-fallback={reason}
      role="region"
      aria-labelledby="fair-map-fallback-heading"
      className="flex h-full min-h-[520px] items-start overflow-y-auto overscroll-contain px-4 pb-[calc(5rem+env(safe-area-inset-bottom,0px))] pt-16 lg:min-h-0 lg:items-center lg:justify-center lg:overflow-visible lg:p-8"
    >
      <div className="max-w-[34rem]">
        <span
          className="hidden h-11 w-11 place-items-center rounded-full border lg:grid"
          style={{
            color: "var(--app-cool)",
            borderColor: "var(--app-control-border)",
            background: "var(--app-bg-elevated-solid)",
          }}
          aria-hidden
        >
          <MapPin className="h-5 w-5" />
        </span>
        <p
          className="text-[11px] font-bold uppercase tracking-[0.11em] lg:mt-4"
          style={{ color: "var(--app-cool)" }}
        >
          Interactive map unavailable
        </p>
        <h2
          id="fair-map-fallback-heading"
          tabIndex={-1}
          className="mt-1 text-[24px] font-extrabold leading-tight tracking-[-0.03em] outline-none"
        >
          Use the searchable grounds guide.
        </h2>
        <p
          className="mt-2 text-[14px] leading-relaxed"
          style={{ color: "var(--app-ink-2)" }}
        >
          {mapWasInteractive
            ? "The interactive map stopped working. Search the reviewed places above or use the complete task list below. Directions and official source links still work."
            : "This browser could not start the interactive map. Search the reviewed places above or use the complete task list below. Directions and official source links still work."}
        </p>
        <p
          className="mt-2 text-[12px] leading-relaxed lg:mt-3"
          style={{ color: "var(--app-ink-3)" }}
        >
          Grounds geometry comes from {map.source.publisher} under{" "}
          {map.source.license}. Radius reviewed this map on {map.reviewedOn}.
          Follow current signs on the grounds.
        </p>
        <div className="mt-2 flex flex-wrap items-center gap-2 lg:mt-3">
          <button
            type="button"
            onClick={browsePlaces}
            className="tap-44 inline-flex min-h-11 items-center rounded-full px-4 text-[13px] font-bold"
            style={{
              color: "var(--app-ink-inverse)",
              background: "var(--app-cool)",
            }}
          >
            Browse all reviewed places
          </button>
          <a
            href={map.source.url}
            target="_blank"
            rel="noopener noreferrer"
            className="tap-44 inline-flex min-h-11 items-center gap-1.5 px-2 text-[13px] font-semibold"
            style={{ color: "var(--app-cool)" }}
          >
            Open the map source
            <ExternalLink className="h-3.5 w-3.5" aria-hidden />
          </a>
        </div>
      </div>
    </div>
  );
}

function keepFocusInsideDialog(event: ReactKeyboardEvent<HTMLElement>) {
  if (event.key !== "Tab") return;
  const focusable = Array.from(
    event.currentTarget.querySelectorAll<HTMLElement>(
      'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
    ),
  ).filter(
    (element) =>
      element.getClientRects().length > 0 &&
      window.getComputedStyle(element).visibility !== "hidden",
  );
  if (focusable.length === 0) {
    event.preventDefault();
    event.currentTarget.focus({ preventScroll: true });
    return;
  }

  const activeIndex = focusable.findIndex(
    (element) => element === document.activeElement,
  );
  if (activeIndex === -1) {
    event.preventDefault();
    focusable[event.shiftKey ? focusable.length - 1 : 0]?.focus({
      preventScroll: true,
    });
    return;
  }
  if (!event.shiftKey && activeIndex === focusable.length - 1) {
    event.preventDefault();
    focusable[0]?.focus({ preventScroll: true });
    return;
  }
  if (event.shiftKey && activeIndex === 0) {
    event.preventDefault();
    focusable[focusable.length - 1]?.focus({ preventScroll: true });
  }
}

function FairMapFeatureActions({
  feature,
  mode = "all",
}: {
  feature: FairGroundsMapFeature;
  mode?: "all" | "primary" | "secondary";
}) {
  const featureId = feature.properties.id;
  const [copiedFeatureId, setCopiedFeatureId] = useState<string | null>(null);
  const activeFeatureIdRef = useRef(featureId);
  const resetTimerRef = useRef<number | null>(null);
  activeFeatureIdRef.current = featureId;
  const meetLinkCopied = copiedFeatureId === featureId;
  const informationSource = feature.properties.informationSource;
  const mappedSourceIsInformationSource =
    informationSource?.url === feature.properties.sourceUrl;
  const mappedSourceLabel = feature.properties.id.startsWith("osm-")
    ? "Mapped source"
    : feature.properties.kind === "parking"
      ? "Official entrance pin"
      : null;

  useEffect(
    () => () => {
      if (resetTimerRef.current !== null) {
        window.clearTimeout(resetTimerRef.current);
      }
    },
    [],
  );

  const shareMeetingPlace = async () => {
    haptic("light");
    const placeName = feature.properties.name;
    const url = fairMeetHereUrl(window.location.origin, featureId);
    const shareData = {
      title: `Meet at ${placeName} · The Great Frederick Fair`,
      text: `Meet me at ${placeName}. This link opens the exact place on the Fairgrounds map.`,
      url,
    };

    if (typeof navigator.share === "function") {
      try {
        await navigator.share(shareData);
        return;
      } catch (error) {
        if ((error as { name?: string } | null)?.name === "AbortError") return;
      }
    }

    try {
      if (!navigator.clipboard?.writeText) throw new Error("Clipboard unavailable");
      await navigator.clipboard.writeText(url);
      if (activeFeatureIdRef.current !== featureId) return;
      haptic("success");
      setCopiedFeatureId(featureId);
      if (resetTimerRef.current !== null) {
        window.clearTimeout(resetTimerRef.current);
      }
      resetTimerRef.current = window.setTimeout(() => {
        setCopiedFeatureId(null);
        resetTimerRef.current = null;
      }, 2_000);
    } catch {
      window.prompt("Copy this meeting-place link:", url);
    }
  };

  return (
    <div className="mt-3 flex flex-wrap items-center gap-2">
      {mode !== "secondary" && feature.properties.directionsEnabled ? (
        <a
          href={directionsHref(
            feature.properties.anchor[1],
            feature.properties.anchor[0],
          )}
          target="_blank"
          rel="noopener noreferrer"
          className="tap-44 inline-flex min-h-11 items-center gap-2 rounded-full px-4 text-[13px] font-bold"
          style={{
            color: "var(--app-ink-inverse)",
            background: "var(--app-cool)",
          }}
        >
          <Navigation className="h-4 w-4" aria-hidden />
          Get directions
        </a>
      ) : null}
      {mode !== "secondary" ? (
        <>
          <button
            type="button"
            onClick={() => void shareMeetingPlace()}
            data-fair-meet-here
            className="tap-44 inline-flex min-h-11 items-center gap-2 rounded-full border px-4 text-[13px] font-bold"
            style={{
              borderColor: "color-mix(in srgb, var(--app-cool) 36%, var(--app-border))",
              color: meetLinkCopied ? "var(--app-positive)" : "var(--app-cool)",
              background: "var(--app-bg-elevated-solid)",
            }}
            aria-label={meetLinkCopied ? "Meeting-place link copied" : `Share ${feature.properties.name} as a meeting place`}
          >
            <Share2 className="h-4 w-4" aria-hidden />
            {meetLinkCopied ? "Link copied" : "Meet here"}
          </button>
          <span className="sr-only" role="status" aria-live="polite">
            {meetLinkCopied ? "Meeting-place link copied." : ""}
          </span>
        </>
      ) : null}
      {mode !== "primary" && informationSource ? (
        <a
          href={informationSource.url}
          target="_blank"
          rel="noopener noreferrer"
          className="tap-44 inline-flex min-h-11 items-center gap-1.5 px-2 text-[13px] font-bold"
          style={{ color: "var(--app-cool)" }}
        >
          Official details
          <span className="sr-only"> from {informationSource.publisher}</span>
          <ExternalLink className="h-3.5 w-3.5" aria-hidden />
        </a>
      ) : null}
      {mode !== "primary" &&
      mappedSourceLabel &&
      !mappedSourceIsInformationSource ? (
        <a
          href={feature.properties.sourceUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="tap-44 inline-flex min-h-11 items-center gap-1.5 px-2 text-[13px] font-semibold"
          style={{ color: "var(--app-ink-3)" }}
        >
          {mappedSourceLabel}
          <ExternalLink className="h-3.5 w-3.5" aria-hidden />
        </a>
      ) : null}
    </div>
  );
}

/** A shareable public place, never the visitor's live location or private plan. */
export function fairMeetHereUrl(origin: string, featureId: string): string {
  const url = new URL(FAIR_DAY_PATH, origin);
  url.searchParams.set("meet", featureId);
  url.hash = "fair-map";
  return url.toString();
}

export default function FairGroundsMapInner({
  savedStops,
  programItems,
  focusRequest,
  onBrowseProgram,
  onFocusRequestHandled,
  onOpenProgramItem,
}: FairGroundsMapProps) {
  const mapRef = useRef<MapRef | null>(null);
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const condensedSearchTriggerRef = useRef<HTMLButtonElement | null>(null);
  const mapViewSelectRef = useRef<HTMLSelectElement | null>(null);
  const clusterSelectionDialogRef = useRef<HTMLDialogElement | null>(null);
  const clusterSelectionHeadingRef = useRef<HTMLHeadingElement | null>(null);
  const mobileSelectionDialogRef = useRef<HTMLDialogElement | null>(null);
  const mobileSelectionHeadingRef = useRef<HTMLHeadingElement | null>(null);
  const mobileSelectionToggleRef = useRef<HTMLButtonElement | null>(null);
  const focusCollapsedSelectionRef = useRef(false);
  const desktopSelectionHeadingRef = useRef<HTMLHeadingElement | null>(null);
  const lastSelectionTriggerRef = useRef<HTMLElement | null>(null);
  const lastClosedFeatureRef = useRef<FairGroundsMapFeature | null>(null);
  const clusterOriginRef = useRef<{
    element: HTMLElement;
    memberIds: string[];
  } | null>(null);
  const focusedDeepLinkRef = useRef(false);
  const sharedMeetingPlaceHandledRef = useRef(false);
  const selectionHistoryEntryRef = useRef(false);
  const focusedProgramRequestRef = useRef<number | null>(null);
  const pendingProgramFocusRequestRef = useRef<{
    requestId: number;
    featureId: string;
  } | null>(null);
  const selectedFocusTimerRef = useRef<number | null>(null);
  const mapSnapshotRequestRef = useRef(0);
  const mapSnapshotAbortRef = useRef<AbortController | null>(null);
  const focusAfterMapSnapshotRetryRef = useRef(false);
  const mapLoadedRef = useRef(false);
  const locationRequestRef = useRef(0);
  const interactiveMapSurfaceRef = useRef<HTMLDivElement | null>(null);
  const mapCanvasShellRef = useRef<HTMLDivElement | null>(null);
  const mapStyle = useFrederickFlavorStyle();
  const [aerialEnabled, setAerialEnabled] = useState(true);
  const [mapRuntime, setMapRuntime] =
    useState<FairMapRuntime>("checking");
  const [mapLoaded, setMapLoaded] = useState(false);
  const [mapData, setMapData] = useState<FairGroundsMap | null>(null);
  const [mapSnapshotStatus, setMapSnapshotStatus] =
    useState<FairMapSnapshotStatus>("loading");
  const [filter, setFilterState] = useState<FairGroundsMapView>(() =>
    typeof window === "undefined"
      ? "essentials"
      : (readRememberedFairGroundsMapFilter() ?? "essentials"),
  );
  const [query, setQuery] = useState("");
  const [condensedMobileControls, setCondensedMobileControls] = useState(false);
  const [condensedSearchOpen, setCondensedSearchOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [clusterSelectionIds, setClusterSelectionIds] = useState<string[]>([]);
  const [selectionExpanded, setSelectionExpanded] = useState(false);
  const [markerGroups, setMarkerGroups] = useState<FairGroundsMarkerGroup[]>([]);
  const [mobileActionBarHeight, setMobileActionBarHeight] = useState<
    number | null
  >(null);
  const [mobileMapActionBarClearance, setMobileMapActionBarClearance] = useState<
    number | null
  >(null);
  const [locating, setLocating] = useState(false);
  const [locationStatus, setLocationStatus] = useState<string | null>(null);
  const [mapAnnouncement, setMapAnnouncement] = useState("");
  const [visitorLocation, setVisitorLocation] = useState<{
    longitude: number;
    latitude: number;
  } | null>(null);
  const [savedCar] = useState<SavedFairCar | null>(() => {
    if (typeof window === "undefined") return null;
    return readSavedFairCar(window.localStorage);
  });
  const latestFilterRef = useRef(filter);
  const interactiveMapAvailable = mapRuntime === "interactive";
  const aerialStatus = useFairAerialStatus(aerialEnabled && interactiveMapAvailable);
  const showAerial = aerialEnabled && aerialStatus === "ready";

  const handleMapFailure = useCallback(
    (context?: { focusWasInside?: boolean }) => {
      const activeElement = document.activeElement;
      const mapWasInteractive = mapLoadedRef.current;
      const liveFocusIsInsideRemovedMapUi =
        activeElement instanceof HTMLElement &&
        (interactiveMapSurfaceRef.current?.contains(activeElement) === true ||
          activeElement.closest(
            "[data-fair-map-runtime-control], [data-fair-map-high-text-controls], [data-fair-map-filter-rail], [data-fair-map-utility-controls], [data-fair-map-cluster-selection]",
          ) !== null);
      const focusWasInsideRemovedMapUi =
        context?.focusWasInside === true || liveFocusIsInsideRemovedMapUi;

      locationRequestRef.current += 1;
      setLocating(false);
      setVisitorLocation(null);
      setLocationStatus(null);
      clusterSelectionDialogRef.current?.close();
      setClusterSelectionIds([]);
      setSelectedId(null);
      setMarkerGroups([]);
      setMapRuntime("failed");
      setMapAnnouncement(
        mapWasInteractive
          ? "The interactive Fairgrounds map became unavailable. Search or browse the reviewed places instead."
          : "The interactive Fairgrounds map could not start. Search or browse the reviewed places instead.",
      );

      if (focusWasInsideRemovedMapUi) {
        window.requestAnimationFrame(() => {
          document.getElementById("fair-map-fallback-heading")?.focus({
            preventScroll: true,
          });
        });
      }
    },
    [],
  );

  useEffect(() => {
    const check = window.setTimeout(() => {
      setMapRuntime(hasWebGL() ? "interactive" : "unsupported");
    }, 0);
    return () => window.clearTimeout(check);
  }, []);

  useEffect(() => {
    if (!mapData || mapRuntime !== "interactive" || mapLoaded) return;
    const watchdog = window.setTimeout(() => {
      handleMapFailure();
    }, MAP_LOAD_WATCHDOG_MS);
    return () => window.clearTimeout(watchdog);
  }, [handleMapFailure, mapData, mapLoaded, mapRuntime]);

  useEffect(() => {
    latestFilterRef.current = filter;
  }, [filter]);

  useEffect(() => {
    let frame = 0;
    const measure = () => {
      const rootFontSize = Number.parseFloat(
        window.getComputedStyle(document.documentElement).fontSize,
      );
      const viewportWidth = Math.min(
        window.innerWidth,
        window.visualViewport?.width ?? window.innerWidth,
      );
      const shouldCondense = viewportWidth < 640 && rootFontSize >= 24;
      setCondensedMobileControls((current) =>
        current === shouldCondense ? current : shouldCondense,
      );
      if (!shouldCondense) setCondensedSearchOpen(false);
    };
    const scheduleMeasure = () => {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(measure);
    };

    measure();
    window.addEventListener("resize", scheduleMeasure);
    window.visualViewport?.addEventListener("resize", scheduleMeasure);
    const resizeObserver =
      typeof ResizeObserver === "undefined"
        ? null
        : new ResizeObserver(scheduleMeasure);
    resizeObserver?.observe(document.documentElement);
    const mutationObserver =
      typeof MutationObserver === "undefined"
        ? null
        : new MutationObserver(scheduleMeasure);
    mutationObserver?.observe(document.documentElement, { attributes: true });
    if (document.head && mutationObserver) {
      mutationObserver.observe(document.head, {
        childList: true,
        subtree: true,
      });
    }

    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("resize", scheduleMeasure);
      window.visualViewport?.removeEventListener("resize", scheduleMeasure);
      resizeObserver?.disconnect();
      mutationObserver?.disconnect();
    };
  }, []);

  useEffect(() => {
    if (!condensedMobileControls || !condensedSearchOpen) return;
    const frame = window.requestAnimationFrame(() =>
      searchInputRef.current?.focus({ preventScroll: true }),
    );
    return () => window.cancelAnimationFrame(frame);
  }, [condensedMobileControls, condensedSearchOpen]);

  useEffect(() => {
    const actionBar = document.querySelector<HTMLElement>(
      "[data-mobile-action-bar]",
    );
    if (!actionBar) return;

    let frame = 0;
    const measure = () => {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(() => {
        const actionBarBox = actionBar.getBoundingClientRect();
        const height = Math.ceil(actionBarBox.height);
        if (height > 0) {
          setMobileActionBarHeight((current) =>
            current === height ? current : height,
          );
        }
        const mapCanvasBox = mapCanvasShellRef.current?.getBoundingClientRect();
        const actionSurface =
          actionBar.querySelector<HTMLElement>("nav") ?? actionBar;
        const actionSurfaceBox = actionSurface.getBoundingClientRect();
        const clearance = mapCanvasBox
          ? Math.max(
              height,
              Math.ceil(mapCanvasBox.bottom - actionSurfaceBox.top),
            )
          : height;
        if (clearance > 0) {
          setMobileMapActionBarClearance((current) =>
            current === clearance ? current : clearance,
          );
        }
      });
    };
    const resizeObserver =
      typeof ResizeObserver === "undefined"
        ? null
        : new ResizeObserver(measure);
    resizeObserver?.observe(actionBar);
    if (mapCanvasShellRef.current) {
      resizeObserver?.observe(mapCanvasShellRef.current);
    }
    window.addEventListener("resize", measure);
    window.visualViewport?.addEventListener("resize", measure);
    measure();

    return () => {
      window.cancelAnimationFrame(frame);
      resizeObserver?.disconnect();
      window.removeEventListener("resize", measure);
      window.visualViewport?.removeEventListener("resize", measure);
    };
  }, [mapData]);

  const setFilter = (nextFilter: FairGroundsMapView) => {
    rememberFairGroundsMapFilter(nextFilter);
    setFilterState(nextFilter);
  };

  const loadMapSnapshot = useCallback(async (reason: "initial" | "retry") => {
    const requestId = mapSnapshotRequestRef.current + 1;
    mapSnapshotRequestRef.current = requestId;
    mapSnapshotAbortRef.current?.abort();
    const controller = new AbortController();
    mapSnapshotAbortRef.current = controller;

    if (reason === "retry") {
      setMapSnapshotStatus("retrying");
    }

    try {
      const response = await fetch(FAIR_GROUNDS_MAP_URL, {
        // The Fair map is corrected in place as official information changes.
        // Revalidate the same URL instead of trusting an old browser cache;
        // the service worker still owns the deliberate offline copy.
        cache: "no-cache",
        signal: controller.signal,
      });
      if (!response.ok) {
        throw new Error(`Fair map returned ${response.status}`);
      }
      const map = enrichFairGroundsMap(
        parseFairGroundsMap(await response.json()),
        greatFrederickFair2026MapPatches,
        greatFrederickFair2026MapAdditions,
      );
      if (
        controller.signal.aborted ||
        requestId !== mapSnapshotRequestRef.current
      ) {
        return;
      }
      if (reason === "retry") {
        focusAfterMapSnapshotRetryRef.current = true;
        setMapAnnouncement("The reviewed Fairgrounds map is ready.");
      }
      setMapData(map);
      setMapSnapshotStatus("ready");
    } catch {
      if (
        controller.signal.aborted ||
        requestId !== mapSnapshotRequestRef.current
      ) {
        return;
      }
      setMapSnapshotStatus("failed");
    } finally {
      if (requestId === mapSnapshotRequestRef.current) {
        mapSnapshotAbortRef.current = null;
      }
    }
  }, []);

  useEffect(() => {
    void loadMapSnapshot("initial");
    return () => {
      mapSnapshotRequestRef.current += 1;
      mapSnapshotAbortRef.current?.abort();
      mapSnapshotAbortRef.current = null;
    };
  }, [loadMapSnapshot]);

  useEffect(() => {
    if (!mapData || !focusAfterMapSnapshotRetryRef.current) return;
    focusAfterMapSnapshotRetryRef.current = false;
    const frame = window.requestAnimationFrame(() => {
      const target =
        searchInputRef.current ?? condensedSearchTriggerRef.current;
      target?.focus({ preventScroll: true });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [mapData]);

  useEffect(() => {
    if (
      !mapData ||
      focusedDeepLinkRef.current ||
      window.location.hash !== "#fair-map"
    ) {
      return;
    }
    focusedDeepLinkRef.current = true;
    const frame = window.requestAnimationFrame(() => {
      document.getElementById("fair-grounds-map-heading")?.focus({
        preventScroll: true,
      });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [mapData]);

  const savedStopMatches = useMemo(() => {
    if (!mapData) return new Map<string, FairGroundsMapSavedStop[]>();
    return new Map(
      mapData.features.flatMap((feature) => {
        const matches = savedStops.filter((stop) =>
          fairGroundsFeatureMatchesPlace(feature, stop.placeLabel),
        );
        return matches.length > 0
          ? ([[feature.properties.id, matches]] as const)
          : [];
      }),
    );
  }, [mapData, savedStops]);
  const programMatches = useMemo(() => {
    if (!mapData) return new Map<string, FairGroundsMapProgramItem[]>();
    return new Map(
      mapData.features.flatMap((feature) => {
        const matches = programItems.filter((item) =>
          fairGroundsFeatureMatchesPlace(feature, item.placeLabel),
        );
        return matches.length > 0
          ? ([[feature.properties.id, matches]] as const)
          : [];
      }),
    );
  }, [mapData, programItems]);

  const featureMatchesView = useCallback(
    (feature: FairGroundsMapFeature, view: FairGroundsMapView) =>
      view === "program"
        ? feature.properties.kind === "fairgrounds" ||
          programMatches.has(feature.properties.id)
        : fairGroundsFeatureMatchesFilter(feature, view),
    [programMatches],
  );

  const visibleFeatures = useMemo(
    () =>
      mapData?.features.filter(
        (feature) =>
          featureMatchesView(feature, filter) ||
          savedStopMatches.has(feature.properties.id),
      ) ?? [],
    [featureMatchesView, filter, mapData, savedStopMatches],
  );
  const visiblePolygons = useMemo(
    () => ({
      type: "FeatureCollection" as const,
      features: visibleFeatures.filter(
        (feature) => feature.geometry.type === "Polygon",
      ),
    }),
    [visibleFeatures],
  );
  const groundsContextPolygons = useMemo(
    () => ({
      type: "FeatureCollection" as const,
      features:
        mapData?.features.filter(
          (feature) =>
            feature.geometry.type === "Polygon" &&
            feature.properties.kind !== "fairgrounds",
        ) ?? [],
    }),
    [mapData],
  );
  const accessibleFeatures = useMemo(() => {
    const listFeatures = interactiveMapAvailable
      ? visibleFeatures
      : (mapData?.features ?? []);
    return listFeatures
        .filter((feature) => feature.properties.kind !== "fairgrounds")
        .slice()
        .sort(
          (left, right) =>
            fairGroundsMapKindLabel(left.properties.kind).localeCompare(
              fairGroundsMapKindLabel(right.properties.kind),
            ) || left.properties.name.localeCompare(right.properties.name),
        );
  }, [interactiveMapAvailable, mapData, visibleFeatures]);
  const groupedAccessibleFeatures = useMemo(
    () =>
      ACCESSIBLE_PLACE_GROUPS.map((group) => ({
        ...group,
        features: accessibleFeatures.filter((feature) =>
          group.kinds.includes(feature.properties.kind),
        ),
      })).filter(
        (group) =>
          group.features.length > 0 ||
          (group.id === "arrive" &&
            savedCar !== null &&
            savedCar?.longitude !== null &&
            savedCar?.latitude !== null),
      ),
    [accessibleFeatures, savedCar],
  );
  const selected =
    mapData?.features.find((feature) => feature.properties.id === selectedId) ??
    null;
  const clusterSelectionFeatures = clusterSelectionIds.flatMap((id) => {
    const feature = mapData?.features.find(
      (candidate) => candidate.properties.id === id,
    );
    return feature ? [feature] : [];
  });
  useEffect(() => {
    if (clusterSelectionFeatures.length <= 1 || selected) return;
    const dialog = clusterSelectionDialogRef.current;
    if (!dialog) return;
    if (!dialog.open) dialog.showModal();
    const frame = window.requestAnimationFrame(() =>
      clusterSelectionHeadingRef.current?.focus({ preventScroll: true }),
    );
    return () => window.cancelAnimationFrame(frame);
  }, [clusterSelectionFeatures.length, selected]);
  useEffect(() => {
    if (!selected) return;
    const dialog = mobileSelectionDialogRef.current;
    if (!dialog) return;
    const mobileViewport = window.matchMedia("(max-width: 1023.98px)");
    let frame = 0;
    let previousBodyOverflow: string | null = null;

    const lockBackgroundScroll = () => {
      if (previousBodyOverflow !== null) return;
      previousBodyOverflow = document.body.style.overflow;
      document.body.style.overflow = "hidden";
    };
    const unlockBackgroundScroll = () => {
      if (previousBodyOverflow === null) return;
      document.body.style.overflow = previousBodyOverflow;
      previousBodyOverflow = null;
    };
    const syncMobileSelectionMode = () => {
      window.cancelAnimationFrame(frame);
      const previousFocus = dialog.contains(document.activeElement)
        ? document.activeElement as HTMLElement
        : null;
      if (dialog.open) dialog.close();

      if (!mobileViewport.matches) {
        unlockBackgroundScroll();
        return;
      }

      if (selectionExpanded) {
        dialog.showModal();
        lockBackgroundScroll();
        frame = window.requestAnimationFrame(() =>
          mobileSelectionHeadingRef.current?.focus({ preventScroll: true }),
        );
        return;
      }

      dialog.show();
      unlockBackgroundScroll();
      if (focusCollapsedSelectionRef.current) {
        focusCollapsedSelectionRef.current = false;
        frame = window.requestAnimationFrame(() =>
          mobileSelectionToggleRef.current?.focus({ preventScroll: true }),
        );
      } else {
        // Reopening the native dialog after the one-shot map handoff must not
        // replace the selected-place heading with the first (close) button.
        frame = window.requestAnimationFrame(() => {
          const target = previousFocus?.isConnected
            ? previousFocus
            : mobileSelectionHeadingRef.current;
          target?.focus({ preventScroll: true });
        });
      }
    };

    syncMobileSelectionMode();
    mobileViewport.addEventListener("change", syncMobileSelectionMode);
    return () => {
      window.cancelAnimationFrame(frame);
      mobileViewport.removeEventListener("change", syncMobileSelectionMode);
      if (dialog.open) dialog.close();
      unlockBackgroundScroll();
    };
  }, [selected, selectionExpanded]);
  const selectedTone = selected
    ? markerTone(selected.properties.kind)
    : "var(--app-brand-press)";
  const restoreMapControlFocus = useCallback(
    (
      preferred: HTMLElement | null,
      preferredClusterMemberIds: readonly string[] = [],
    ) => {
      window.requestAnimationFrame(() => {
        const restoredCluster =
          preferredClusterMemberIds.length > 0
            ? Array.from(
                document.querySelectorAll<HTMLElement>(
                  "[data-fair-map-cluster-members]",
                ),
              ).find((candidate) => {
                const memberIds =
                  candidate.dataset.fairMapClusterMembers?.split(" ") ?? [];
                return preferredClusterMemberIds.every((id) =>
                  memberIds.includes(id),
                );
              })
            : null;
        const nextTarget = [
          restoredCluster,
          preferred,
          condensedSearchTriggerRef.current,
          searchInputRef.current,
          mapViewSelectRef.current,
        ].find(
          (candidate) =>
            candidate?.isConnected && candidate.getClientRects().length > 0,
        );
        nextTarget?.focus({ preventScroll: true });
      });
    },
    [],
  );
  const updateMarkerGroups = useCallback(() => {
    const features = visibleFeatures.filter(
      (feature) => feature.properties.kind !== "fairgrounds",
    );
    const map = mapRef.current?.getMap();
    if (!map) return;

    const points = features.map((feature) => {
      const point = map.project(feature.properties.anchor);
      return {
        id: feature.properties.id,
        item: feature,
        x: point.x,
        y: point.y,
      };
    });
    const groups =
      map.getCanvas().clientWidth < 640
        ? groupCollidingMobileMarkers(points)
        : points.map((point) => ({
            id: point.id,
            items: [point.item],
            representative: point,
          }));
    const nextGroups = groups.map((group) => ({
      id: group.id,
      features: group.items,
      representative: group.representative.item,
    }));
    setMarkerGroups(nextGroups);

    if (clusterSelectionIds.length > 1) {
      const activeIds = new Set(clusterSelectionIds);
      const stillMatchesRenderedCluster = nextGroups.some(
        (group) =>
          group.features.length === activeIds.size &&
          group.features.length > 1 &&
          group.features.every((feature) =>
            activeIds.has(feature.properties.id),
          ),
      );
      if (!stillMatchesRenderedCluster) {
        setClusterSelectionIds([]);
        setMapAnnouncement(
          "The map changed, so the nearby-place chooser closed.",
        );
        restoreMapControlFocus(lastSelectionTriggerRef.current);
      }
    }
  }, [clusterSelectionIds, restoreMapControlFocus, visibleFeatures]);

  useEffect(() => {
    if (!mapLoaded) return;
    const frame = window.requestAnimationFrame(updateMarkerGroups);
    return () => window.cancelAnimationFrame(frame);
  }, [mapLoaded, updateMarkerGroups]);
  const renderedMarkerGroups = useMemo(
    () =>
      markerGroups.map((group) => {
        const selectedFeature = group.features.find(
          (feature) => feature.properties.id === selectedId,
        );
        return selectedFeature
          ? {
              ...group,
              features: [selectedFeature],
              representative: selectedFeature,
            }
          : group;
      }),
    [markerGroups, selectedId],
  );
  const searchMatches = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase();
    if (!mapData || normalized.length < 2) return [];
    return mapData.features
      .filter((feature) => feature.properties.kind !== "fairgrounds")
      .filter((feature) =>
        [
          feature.properties.name,
          fairGroundsMapKindLabel(feature.properties.kind),
          ...feature.properties.scheduleAliases,
          ...(feature.properties.keywords ?? []),
          feature.properties.detail ?? "",
          feature.properties.informationSource?.title ?? "",
          ...(programMatches.get(feature.properties.id) ?? []).map(
            (item) => item.title,
          ),
        ]
          .join(" ")
          .toLocaleLowerCase()
          .includes(normalized),
      )
      .slice(0, 6);
  }, [mapData, programMatches, query]);
  const normalizedQuery = query.trim();
  const searchAnnouncement =
    normalizedQuery.length >= 2
      ? searchMatches.length > 0
        ? `${searchMatches.length} map ${searchMatches.length === 1 ? "result" : "results"} available. Tab to review them.`
        : "No reviewed map places match that search."
      : "";
  const selectedStops = selected
    ? (savedStopMatches.get(selected.properties.id) ?? [])
    : [];
  const selectedProgramItems = selected
    ? (programMatches.get(selected.properties.id) ?? [])
    : [];
  const mappedSavedStopIds = new Set(
    Array.from(savedStopMatches.values()).flatMap((stops) =>
      stops.map((stop) => stop.id),
    ),
  );
  const counts = useMemo(() => {
    if (!mapData) return new Map<FairGroundsMapKind, number>();
    const next = new Map<FairGroundsMapKind, number>();
    mapData.features.forEach((feature) =>
      next.set(
        feature.properties.kind,
        (next.get(feature.properties.kind) ?? 0) + 1,
      ),
    );
    return next;
  }, [mapData]);
  const filterCounts = useMemo(() => {
    if (!mapData) return new Map<FairGroundsMapView, number>();
    return new Map(
      FILTERS.map((option) => [
        option.id,
        mapData.features.filter(
          (feature) =>
            feature.properties.kind !== "fairgrounds" &&
            featureMatchesView(feature, option.id),
        ).length,
      ]),
    );
  }, [featureMatchesView, mapData]);

  const fairMapFitPadding = useCallback(() => {
    const map = mapRef.current?.getMap();
    if (!map || map.getCanvas().clientWidth >= 640) return 52;
    const mapBox = map.getCanvas().getBoundingClientRect();
    const markerRadius = 22;
    const markerGap = 8;
    const clearance = markerRadius + markerGap;
    const intersectsMap = (box: DOMRect) =>
      box.width > 0 &&
      box.height > 0 &&
      box.right > mapBox.left &&
      box.left < mapBox.right &&
      box.bottom > mapBox.top &&
      box.top < mapBox.bottom;
    const visibleBoxes = (selectors: readonly string[]) =>
      selectors.flatMap((selector) =>
        Array.from(document.querySelectorAll<HTMLElement>(selector)).flatMap(
          (element) => {
            const box = element.getBoundingClientRect();
            return intersectsMap(box) ? [box] : [];
          },
        ),
      );

    const topChrome = visibleBoxes([
      "[data-fair-transit-toggle]",
      "[data-fair-map-high-text-controls]",
      "[data-fair-map-search-rail]",
      "[data-fair-map-filter-rail]",
      "[data-fair-map-utility-controls]",
      "[data-fair-aerial-controls]",
    ]);
    const bottomChrome = visibleBoxes([
      ".fair-grounds-map-canvas .maplibregl-ctrl-attrib",
      "[data-fair-map-selection]",
      "[data-mobile-action-bar]",
    ]);
    const top = topChrome.reduce(
      (padding, box) =>
        Math.max(
          padding,
          Math.ceil(Math.min(box.bottom, mapBox.bottom) - mapBox.top) +
            clearance,
        ),
      clearance,
    );
    const bottom = bottomChrome.reduce(
      (padding, box) =>
        Math.max(
          padding,
          Math.ceil(mapBox.bottom - Math.max(box.top, mapBox.top)) +
            clearance,
        ),
      clearance,
    );

    return { top, right: clearance, bottom, left: clearance };
  }, []);

  const focusSelectedDetails = useCallback((onFocused?: () => void) => {
    if (selectedFocusTimerRef.current !== null) {
      window.clearTimeout(selectedFocusTimerRef.current);
      selectedFocusTimerRef.current = null;
    }
    const attemptFocus = () => {
      const desktop = window.matchMedia("(min-width: 1024px)").matches;
      const heading = desktop
        ? desktopSelectionHeadingRef.current
        : mobileSelectionHeadingRef.current;
      if (!heading?.isConnected || heading.closest('[aria-hidden="true"]')) {
        selectedFocusTimerRef.current = window.setTimeout(attemptFocus, 100);
        return;
      }
      heading.focus({ preventScroll: true });
      // MapLibre and the native <dialog> both finish work immediately after a
      // program-to-map transition. Confirm that neither stole focus before the
      // parent clears the one-shot request; otherwise a transient mount can
      // consume the handoff without leaving the visitor at the selected place.
      selectedFocusTimerRef.current = window.setTimeout(() => {
        if (document.activeElement !== heading) {
          attemptFocus();
          return;
        }
        selectedFocusTimerRef.current = null;
        onFocused?.();
      }, 50);
    };
    attemptFocus();
  }, []);

  const beginFairMapSelectionHistory = useCallback((featureId: string) => {
    const currentState =
      window.history.state && typeof window.history.state === "object"
        ? window.history.state
        : {};
    const nextState = {
      ...currentState,
      [FAIR_MAP_SELECTION_HISTORY_KEY]: true,
    };
    const nextUrl = fairMapSelectionUrl(featureId);
    if (
      selectionHistoryEntryRef.current ||
      isFairMapSelectionHistoryState(window.history.state)
    ) {
      window.history.replaceState(nextState, "", nextUrl);
    } else {
      window.history.pushState(nextState, "", nextUrl);
    }
    selectionHistoryEntryRef.current = true;
  }, []);

  const openMarkerCluster = (
    features: FairGroundsMapFeature[],
    trigger: HTMLElement,
  ) => {
    haptic("light");
    const memberIds = features.map((feature) => feature.properties.id);
    lastSelectionTriggerRef.current = trigger;
    clusterOriginRef.current = { element: trigger, memberIds };
    setSelectedId(null);
    setClusterSelectionIds(memberIds);
    setMapAnnouncement(
      `${features.length} nearby map places are ready to choose from.`,
    );
  };

  const closeMarkerCluster = () => {
    const origin = clusterOriginRef.current;
    const returnTarget = origin?.element ?? lastSelectionTriggerRef.current;
    clusterSelectionDialogRef.current?.close();
    setClusterSelectionIds([]);
    setMapAnnouncement("Nearby map places closed.");
    restoreMapControlFocus(returnTarget, origin?.memberIds);
    clusterOriginRef.current = null;
  };

  const chooseFeature = (
    feature: FairGroundsMapFeature,
    trigger?: HTMLElement,
    preserveClusterOrigin = false,
  ) => {
    haptic("light");
    if (preserveClusterOrigin && clusterOriginRef.current) {
      lastSelectionTriggerRef.current = clusterOriginRef.current.element;
    } else {
      clusterOriginRef.current = null;
      if (trigger) lastSelectionTriggerRef.current = trigger;
    }
    clusterSelectionDialogRef.current?.close();
    setClusterSelectionIds([]);
    setSelectionExpanded(false);
    beginFairMapSelectionHistory(feature.properties.id);
    setSelectedId(feature.properties.id);
    const selectedName = mapData
      ? mappedFeatureName(feature, mapData)
      : feature.properties.name;
    setMapAnnouncement(
      `${selectedName} selected. Details are open.`,
    );
  };

  useEffect(() => {
    if (!mapData || sharedMeetingPlaceHandledRef.current) return;
    sharedMeetingPlaceHandledRef.current = true;
    const sharedId = new URLSearchParams(window.location.search).get("meet");
    if (!sharedId) return;
    const feature = mapData.features.find(
      (candidate) => candidate.properties.id === sharedId,
    );
    if (!feature || feature.properties.kind === "fairgrounds") {
      setMapAnnouncement("That shared meeting place is not available on the reviewed Fair map.");
      return;
    }
    const nextFilter = fairGroundsMapFilterForFeature(feature);
    selectionHistoryEntryRef.current = isFairMapSelectionHistoryState(
      window.history.state,
    );
    setFilter(nextFilter);
    setQuery("");
    setClusterSelectionIds([]);
    setMarkerGroups([]);
    setSelectionExpanded(false);
    setSelectedId(feature.properties.id);
    setMapAnnouncement(
      `${mappedFeatureName(feature, mapData)} opened from a shared meeting-place link.`,
    );
  }, [mapData]);

  useEffect(() => {
    if (!mapData) return;
    const syncSelectionFromHistory = (event: PopStateEvent) => {
      const requestedId = new URLSearchParams(window.location.search).get(
        "meet",
      );
      const feature = requestedId
        ? (mapData.features.find(
            (candidate) => candidate.properties.id === requestedId,
          ) ?? null)
        : null;

      if (feature && feature.properties.kind !== "fairgrounds") {
        const nextFilter = fairGroundsMapFilterForFeature(feature);
        selectionHistoryEntryRef.current = isFairMapSelectionHistoryState(
          event.state,
        );
        rememberFairGroundsMapFilter(nextFilter);
        setFilterState(nextFilter);
        setQuery("");
        setCondensedSearchOpen(false);
        setClusterSelectionIds([]);
        setMarkerGroups([]);
        setSelectionExpanded(false);
        setSelectedId(feature.properties.id);
        setMapAnnouncement(
          `${mappedFeatureName(feature, mapData)} reopened from browser history.`,
        );
        return;
      }

      selectionHistoryEntryRef.current = false;
      mobileSelectionDialogRef.current?.close();
      setSelectionExpanded(false);
      setSelectedId(null);
      if (requestedId) {
        setMapAnnouncement(
          "That shared meeting place is not available on the reviewed Fair map.",
        );
      } else {
        setMapAnnouncement("Map place details closed.");
      }
      restoreMapControlFocus(lastSelectionTriggerRef.current);
    };

    window.addEventListener("popstate", syncSelectionFromHistory);
    return () =>
      window.removeEventListener("popstate", syncSelectionFromHistory);
  }, [mapData, restoreMapControlFocus]);

  useEffect(() => {
    if (
      !mapData ||
      !focusRequest ||
      focusedProgramRequestRef.current === focusRequest.requestId
    ) {
      return;
    }
    const requestId = focusRequest.requestId;
    const programItemId = focusRequest.programItemId;
    const frame = window.requestAnimationFrame(() => {
      focusedProgramRequestRef.current = requestId;
      const matchingFeatures = mapData.features.filter((feature) =>
        (programMatches.get(feature.properties.id) ?? []).some(
          (item) => item.id === programItemId,
        ),
      );
      if (matchingFeatures.length !== 1) {
        setMapAnnouncement(
          "That program place is not available on the reviewed Fair map.",
        );
        onFocusRequestHandled?.(requestId);
        return;
      }

      const feature = matchingFeatures[0];
      rememberFairGroundsMapFilter("program");
      setFilterState("program");
      setQuery("");
      setCondensedSearchOpen(false);
      setClusterSelectionIds([]);
      setMarkerGroups([]);
      setSelectionExpanded(false);
      beginFairMapSelectionHistory(feature.properties.id);
      setSelectedId(feature.properties.id);
      setMapAnnouncement(
        `${mappedFeatureName(feature, mapData)} selected for this program item. Details are open.`,
      );
      // Keep the request alive until the map is interactive and the selected
      // place heading has mounted and retained focus. If this lazy map remounts
      // during startup, the parent can therefore deliver the same request to
      // the replacement instance instead of silently losing the destination.
      pendingProgramFocusRequestRef.current = {
        requestId,
        featureId: feature.properties.id,
      };
    });
    return () => window.cancelAnimationFrame(frame);
  }, [
    beginFairMapSelectionHistory,
    focusRequest,
    mapData,
    onFocusRequestHandled,
    programMatches,
  ]);

  useEffect(() => {
    if (!selected || mapRuntime !== "interactive" || !mapLoaded) return;

    // The mobile place sheet is mounted by this selection. Wait until it has
    // real bounds before computing camera padding so the chosen marker stays
    // above the sheet instead of being centered underneath it.
    const frame = window.requestAnimationFrame(() => {
      const map = mapRef.current?.getMap();
      if (!map) return;
      // A cluster choice already starts inside a deliberately framed group.
      // Preserve that camera so closing details can restore the exact cluster
      // trigger instead of returning visitors to an unrelated map control.
      if (!clusterOriginRef.current) {
        map.easeTo({
          center: selected.properties.anchor,
          zoom: Math.max(map.getZoom(), 17),
          duration: mapCameraDuration("focus"),
          padding: fairMapFitPadding(),
        });
      }
      focusSelectedDetails(() => {
        const pending = pendingProgramFocusRequestRef.current;
        if (!pending || pending.featureId !== selected.properties.id) return;
        pendingProgramFocusRequestRef.current = null;
        onFocusRequestHandled?.(pending.requestId);
      });
    });

    return () => {
      window.cancelAnimationFrame(frame);
      if (selectedFocusTimerRef.current !== null) {
        window.clearTimeout(selectedFocusTimerRef.current);
        selectedFocusTimerRef.current = null;
      }
    };
  }, [
    fairMapFitPadding,
    focusSelectedDetails,
    mapLoaded,
    mapRuntime,
    onFocusRequestHandled,
    selected,
  ]);

  useEffect(
    () => () => {
      if (selectedFocusTimerRef.current !== null) {
        window.clearTimeout(selectedFocusTimerRef.current);
      }
    },
    [],
  );

  useEffect(() => {
    if (selected || mapRuntime !== "interactive") return;
    const closedFeature = lastClosedFeatureRef.current;
    if (!closedFeature) return;
    lastClosedFeatureRef.current = null;

    // The contextual controls have returned in this render. Reframe around
    // their real bounds; cleanup cancels this if another place is selected.
    const frame = window.requestAnimationFrame(() => {
      const map = mapRef.current?.getMap();
      if (!map) return;
      map.easeTo({
        center: closedFeature.properties.anchor,
        zoom: Math.max(map.getZoom(), 17),
        duration: mapCameraDuration("focus"),
        padding: fairMapFitPadding(),
      });
    });

    return () => window.cancelAnimationFrame(frame);
  }, [fairMapFitPadding, mapRuntime, selected]);

  const afterFairMapSelectionCloses = (next: () => void) => {
    const closesHistoryLayer =
      selectionHistoryEntryRef.current ||
      isFairMapSelectionHistoryState(window.history.state);
    if (closesHistoryLayer) {
      selectionHistoryEntryRef.current = false;
      window.addEventListener(
        "popstate",
        () => window.setTimeout(next, 0),
        { once: true },
      );
      window.history.back();
      return;
    }
    if (new URLSearchParams(window.location.search).has("meet")) {
      window.history.replaceState(
        window.history.state,
        "",
        fairMapSelectionUrl(null),
      );
    }
    next();
  };

  const closeSelection = () => {
    const origin = clusterOriginRef.current;
    const returnTarget = origin?.element ?? lastSelectionTriggerRef.current;
    // Keep a cluster-origin camera stable so its exact trigger can receive
    // focus again. Search/list selections need a reframe when controls return.
    lastClosedFeatureRef.current = origin ? null : selected;
    focusCollapsedSelectionRef.current = false;
    setSelectionExpanded(false);
    setSelectedId(null);
    setMapAnnouncement("Map place details closed.");
    restoreMapControlFocus(returnTarget, origin?.memberIds);
    clusterOriginRef.current = null;
    afterFairMapSelectionCloses(() => {});
  };

  const closeCondensedSearch = () => {
    setQuery("");
    setCondensedSearchOpen(false);
    setMapAnnouncement("Map search closed.");
    restoreMapControlFocus(null);
  };

  const reportMobileMapIssue = () => {
    if (!selected) return;
    const reportedFeature = selected;
    // A native modal makes the rest of the document inert. Leave it before
    // opening the shared feedback sheet so that second dialog can receive
    // focus and return the visitor to the map search when it closes.
    mobileSelectionDialogRef.current?.close();
    setSelectionExpanded(false);
    setSelectedId(null);
    afterFairMapSelectionCloses(() =>
      window.requestAnimationFrame(() => reportMapIssue(reportedFeature)),
    );
  };

  const browseProgram = () => {
    mobileSelectionDialogRef.current?.close();
    setSelectionExpanded(false);
    setSelectedId(null);
    afterFairMapSelectionCloses(() => {
      onBrowseProgram();
      window.requestAnimationFrame(() => {
        document.getElementById("fair-find-heading")?.focus({
          preventScroll: true,
        });
      });
    });
  };

  const openProgramItemFromMap = (itemId: string) => {
    mobileSelectionDialogRef.current?.close();
    setSelectionExpanded(false);
    setSelectedId(null);
    afterFairMapSelectionCloses(() => {
      window.requestAnimationFrame(() => {
        onOpenProgramItem?.(itemId);
      });
    });
  };

  const fitFeatures = useCallback((features: FairGroundsMapFeature[]) => {
    const anchors = features
      .filter((feature) => feature.properties.kind !== "fairgrounds")
      .map((feature) => feature.properties.anchor);
    const map = mapRef.current?.getMap();
    if (!map || anchors.length === 0) return;
    if (anchors.length === 1) {
      map.easeTo({
        center: anchors[0],
        zoom: 17.25,
        duration: mapCameraDuration("focus"),
        padding: fairMapFitPadding(),
      });
      return;
    }
    const longitudes = anchors.map(([longitude]) => longitude);
    const latitudes = anchors.map(([, latitude]) => latitude);
    map.fitBounds(
      [
        [Math.min(...longitudes), Math.min(...latitudes)],
        [Math.max(...longitudes), Math.max(...latitudes)],
      ],
      {
        padding: fairMapFitPadding(),
        maxZoom: 17.25,
        duration: mapCameraDuration("focus"),
      },
    );
  }, [fairMapFitPadding]);

  const fitFilter = useCallback((nextFilter: FairGroundsMapView) => {
    if (!mapData) return;
    fitFeatures(
      mapData.features.filter((feature) =>
        featureMatchesView(feature, nextFilter),
      ),
    );
  }, [featureMatchesView, fitFeatures, mapData]);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      const map = mapRef.current?.getMap();
      if (!map) return;
      map.resize();
      fitFilter(latestFilterRef.current);
    });
    return () => window.cancelAnimationFrame(frame);
  }, [aerialStatus, mapLoaded, condensedMobileControls, fitFilter, mobileActionBarHeight]);

  const activateMapFilter = (nextFilter: FairGroundsMapView) => {
    haptic("light");
    const count = filterCounts.get(nextFilter) ?? 0;
    const option = FILTERS.find((candidate) => candidate.id === nextFilter);
    const applyFilter = () => {
      setFilter(nextFilter);
      setSelectionExpanded(false);
      setSelectedId(null);
      setClusterSelectionIds([]);
      setMarkerGroups([]);
      setMapAnnouncement(
        `${option?.label ?? "Selected"} map layer selected. ${count} ${count === 1 ? "place" : "places"} shown.`,
      );
      fitFilter(nextFilter);
    };
    if (
      selectedId ||
      new URLSearchParams(window.location.search).has("meet") ||
      isFairMapSelectionHistoryState(window.history.state)
    ) {
      afterFairMapSelectionCloses(applyFilter);
      return;
    }
    applyFilter();
  };

  const showWholeGrounds = () => {
    mapRef.current?.getMap().fitBounds(
      [
        [FAIR_GROUNDS_BOUNDS[0], FAIR_GROUNDS_BOUNDS[1]],
        [FAIR_GROUNDS_BOUNDS[2], FAIR_GROUNDS_BOUNDS[3]],
      ],
      {
        padding: fairMapFitPadding(),
        maxZoom: 17.15,
        duration: mapCameraDuration("focus"),
      },
    );
  };

  const handleMapLoad = () => {
    mapLoadedRef.current = true;
    setMapLoaded(true);
    fitFilter(filter);
    updateMarkerGroups();
    const canvas = mapRef.current?.getMap().getCanvas();
    canvas?.setAttribute("role", "region");
    canvas?.setAttribute("aria-label", "Interactive Fairgrounds map");
    canvas?.setAttribute("aria-describedby", "fair-map-instructions");
  };

  const chooseSearchResult = (
    feature: FairGroundsMapFeature,
    trigger: HTMLElement,
  ) => {
    const nextFilter: FairGroundsMapView =
      feature.properties.kind === "animal"
        ? "animals"
        : feature.properties.kind === "building"
          ? "buildings"
          : feature.properties.kind === "parking" ||
              feature.properties.kind === "transit" ||
              feature.properties.filterIds?.includes("arrival")
            ? "arrival"
            : "essentials";
    setFilter(nextFilter);
    setClusterSelectionIds([]);
    setMarkerGroups([]);
    setQuery("");
    setCondensedSearchOpen(false);
    chooseFeature(feature, trigger);
  };

  const showSavedCar = (trigger: HTMLElement) => {
    if (
      !savedCar ||
      savedCar.longitude === null ||
      savedCar.latitude === null
    ) {
      return;
    }
    lastSelectionTriggerRef.current = trigger;
    setSelectedId(null);
    const label = savedCar.lotLabel
      ? `Saved car in ${savedCar.lotLabel}`
      : "Saved car location";
    if (!interactiveMapAvailable) {
      updateLocationStatus(
        `${label} is still saved. The interactive map is unavailable on this device.`,
      );
      return;
    }
    setLocationStatus(`${label} is centered on the map.`);
    setMapAnnouncement(`${label} is centered on the map.`);
    mapRef.current?.getMap().easeTo({
      center: [savedCar.longitude, savedCar.latitude],
      zoom: 17.4,
      duration: mapCameraDuration("focus"),
    });
  };

  const updateLocationStatus = (message: string) => {
    setLocationStatus(message);
    setMapAnnouncement(message);
  };

  const locate = () => {
    if (!("geolocation" in navigator)) {
      updateLocationStatus("Location is not available on this device.");
      return;
    }
    const requestId = locationRequestRef.current + 1;
    locationRequestRef.current = requestId;
    setLocating(true);
    setLocationStatus(null);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        if (requestId !== locationRequestRef.current) return;
        setLocating(false);
        const longitude = position.coords.longitude;
        const latitude = position.coords.latitude;
        if (!isNearFair(longitude, latitude)) {
          setVisitorLocation(null);
          updateLocationStatus(
            "You appear to be outside the mapped Fair area. The map stayed centered on the grounds.",
          );
          return;
        }
        const approximateFeet = Math.max(
          10,
          Math.round((position.coords.accuracy * 3.28084) / 10) * 10,
        );
        if (position.coords.accuracy > 60) {
          setVisitorLocation(null);
          updateLocationStatus(
            `Your location reading is too broad to place safely on this map (within about ${approximateFeet} feet). Try again in a more open area.`,
          );
          return;
        }
        setVisitorLocation({ longitude, latitude });
        updateLocationStatus(
          `Your position is shown within about ${approximateFeet} feet for this visit only.`,
        );
        mapRef.current?.getMap().easeTo({
          center: [longitude, latitude],
          zoom: 17.4,
          duration: mapCameraDuration("focus"),
        });
      },
      () => {
        if (requestId !== locationRequestRef.current) return;
        setLocating(false);
        updateLocationStatus(
          "Radius could not get your position. You can still use gates and landmarks.",
        );
      },
      { enableHighAccuracy: true, timeout: 9_000, maximumAge: 0 },
    );
  };

  if (
    mapSnapshotStatus === "failed" ||
    mapSnapshotStatus === "retrying"
  ) {
    const retryingMapSnapshot = mapSnapshotStatus === "retrying";
    return (
      <div
        data-fair-map-snapshot-fallback
        className="mt-5 rounded-[var(--app-radius-xl)] border p-5"
        style={{
          borderColor: "var(--app-border-strong)",
          background: "var(--app-bg-elevated)",
        }}
        role="region"
        aria-labelledby="fair-map-snapshot-fallback-heading"
      >
        <p
          id="fair-map-snapshot-fallback-heading"
          className="text-[18px] font-bold"
        >
          The grounds map could not open.
        </p>
        <p
          className="mt-2 text-[13px] leading-relaxed"
          style={{ color: "var(--app-ink-2)" }}
          role="status"
          aria-live="polite"
          aria-atomic="true"
        >
          {retryingMapSnapshot
            ? "Radius is retrying the reviewed map now."
            : "Your plan is still here. Try the reviewed map again, or browse the program without it."}
        </p>
        <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2">
          <button
            type="button"
            onClick={() => {
              if (retryingMapSnapshot) return;
              void loadMapSnapshot("retry");
            }}
            disabled={retryingMapSnapshot}
            className="tap-44 inline-flex min-h-11 items-center rounded-full px-4 font-bold disabled:cursor-wait disabled:opacity-65"
            style={{
              color: "var(--app-bg)",
              background: "var(--app-brand-press)",
            }}
          >
            {retryingMapSnapshot ? "Retrying…" : "Retry grounds map"}
          </button>
          <button
            type="button"
            onClick={onBrowseProgram}
            className="tap-44 inline-flex min-h-11 items-center font-semibold"
            style={{ color: "var(--app-brand-press)" }}
          >
            Browse the program
          </button>
        </div>
      </div>
    );
  }

  if (!mapData) {
    return <FairGroundsMapLoading />;
  }

  const renderSearchResults = () =>
    normalizedQuery.length >= 2 ? (
      <div
        id="fair-map-search-results"
        className="absolute left-0 right-0 top-[calc(100%+0.4rem)] z-30 max-h-[min(18rem,50dvh)] overflow-y-auto overscroll-contain rounded-[var(--app-radius-lg)] border p-1"
        style={{
          borderColor: "var(--app-border-strong)",
          background: "var(--app-bg-elevated-solid)",
          boxShadow: "var(--app-elev-3)",
        }}
      >
        {searchMatches.length > 0 ? (
          <ul aria-label="Fair map search results">
            {searchMatches.map((feature) => (
              <li key={feature.properties.id}>
                <button
                  type="button"
                  onClick={(event) =>
                    chooseSearchResult(feature, event.currentTarget)
                  }
                  className="tap-44 flex min-h-12 w-full items-center justify-between gap-3 rounded-[calc(var(--app-radius-lg)-5px)] px-3 py-2 text-left hover:bg-[var(--app-bg-sunken)] focus-visible:bg-[var(--app-bg-sunken)]"
                >
                  <span className="min-w-0">
                    <span className="block truncate text-[14px] font-bold">
                      {mappedFeatureName(feature, mapData)}
                    </span>
                    <span
                      className="block text-[12px] font-semibold"
                      style={{ color: "var(--app-ink-3)" }}
                    >
                      {fairGroundsMapKindLabel(feature.properties.kind)}
                    </span>
                  </span>
                  <MapPin
                    className="h-4 w-4 shrink-0"
                    style={{ color: markerTone(feature.properties.kind) }}
                    aria-hidden
                  />
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p
            className="px-3 py-3 text-[13px] font-semibold"
            style={{ color: "var(--app-ink-2)" }}
          >
            No reviewed map place matches that yet.
          </p>
        )}
      </div>
    ) : null;

  return (
    <section
      className="relative lg:mt-5"
      aria-labelledby="fair-grounds-map-heading"
      data-fair-grounds-map
      style={
        {
          "--fair-map-action-bar-height":
            mobileActionBarHeight === null
              ? undefined
              : `${mobileActionBarHeight}px`,
          "--fair-map-action-bar-clearance":
            mobileMapActionBarClearance === null
              ? undefined
              : `${mobileMapActionBarClearance}px`,
        } as CSSProperties
      }
    >
      <div className="hidden lg:block">
        <FairGroundsMapMasthead checkedOn={mapData.reviewedOn} />
      </div>
      <p className="sr-only" role="status" aria-live="polite" aria-atomic="true">
        {mapAnnouncement}
      </p>
      <p
        id="fair-map-search-status"
        className="sr-only"
        role="status"
        aria-live="polite"
        aria-atomic="true"
      >
        {searchAnnouncement}
      </p>
      <p id="fair-map-instructions" className="sr-only">
        On a phone, pinch or double-tap the map to zoom. When the map is
        focused, use keyboard plus and minus to zoom. Every shown place is also
        available in the complete task-grouped list below. Grounds geometry
        comes from reviewed OpenStreetMap data. Official
        arrival pins and published transit stops identify their sources. Follow
        current signs on the grounds.
        The optional 2025 aerial is from the State of Maryland. It is not a
        live image or a map of this year’s temporary booths and rides.
      </p>

      {condensedMobileControls && interactiveMapAvailable ? (
        <div
          data-fair-map-high-text-controls
          data-fair-map-runtime-control
          className={`absolute inset-x-[12px] top-[12px] z-30 ${selected ? "hidden" : ""}`}
        >
          {condensedSearchOpen ? (
            <div
              data-fair-map-search-rail
              className="relative flex h-[44px] w-full items-stretch"
            >
              <label htmlFor="fair-map-search" className="sr-only">
                Find a place or program event on the Fair grounds map
              </label>
              <Search
                className="pointer-events-none absolute left-[14px] top-1/2 z-10 h-[16px] w-[16px] -translate-y-1/2"
                style={{ color: "var(--app-ink-3)" }}
                aria-hidden
              />
              <input
                ref={searchInputRef}
                id="fair-map-search"
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Find a place or event"
                autoComplete="off"
                aria-controls={
                  normalizedQuery.length >= 2
                    ? "fair-map-search-results"
                    : undefined
                }
                aria-describedby="fair-map-search-status"
                onKeyDown={(event) => {
                  if (event.key !== "Escape") return;
                  event.preventDefault();
                  closeCondensedSearch();
                }}
                className="tap-44 h-[44px] min-w-0 flex-1 rounded-l-full border border-r-0 bg-[var(--app-bg-elevated-solid)] py-0 pl-[42px] pr-[10px] text-[clamp(16px,0.75rem,20px)] font-semibold outline-none placeholder:font-medium focus-visible:border-[var(--app-brand-press)] focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--app-brand-press)]"
                style={{
                  borderColor: "var(--app-control-border)",
                  color: "var(--app-ink)",
                  boxShadow: "var(--app-elev-1)",
                }}
              />
              <button
                type="button"
                onClick={() => {
                  if (!query) {
                    closeCondensedSearch();
                    return;
                  }
                  setQuery("");
                  window.requestAnimationFrame(() =>
                    searchInputRef.current?.focus({ preventScroll: true }),
                  );
                }}
                className="tap-44 grid h-[44px] w-[44px] shrink-0 place-items-center rounded-r-full border bg-[var(--app-bg-elevated-solid)]"
                style={{
                  borderColor: "var(--app-control-border)",
                  color: "var(--app-ink)",
                }}
                aria-label={query ? "Clear search" : "Close map search"}
              >
                <X className="h-[18px] w-[18px]" aria-hidden />
              </button>
              {renderSearchResults()}
            </div>
          ) : (
            <div
              className="flex h-[44px] w-full items-stretch gap-[6px]"
              role="group"
              aria-label="Fair map controls"
            >
              <button
                ref={condensedSearchTriggerRef}
                type="button"
                onClick={() => setCondensedSearchOpen(true)}
                className="tap-44 grid h-[44px] w-[44px] shrink-0 place-items-center rounded-full border"
                style={{
                  color: "var(--app-ink)",
                  background: "var(--app-bg-elevated-solid)",
                  borderColor: "var(--app-control-border)",
                  boxShadow: "var(--app-elev-1)",
                }}
                aria-label="Search the Fair map"
              >
                <Search className="h-[18px] w-[18px]" aria-hidden />
              </button>
              <div
                className="relative h-[44px] min-w-0 flex-1 rounded-full"
              >
                <label htmlFor="fair-map-view" className="sr-only">
                  Map view
                </label>
                <select
                  ref={mapViewSelectRef}
                  id="fair-map-view"
                  data-fair-map-filter-select
                  value={filter}
                  onChange={(event) =>
                    activateMapFilter(
                      event.target.value as FairGroundsMapView,
                    )
                  }
                  aria-describedby="fair-map-filter-status"
                  className="block h-[44px] w-full appearance-none rounded-full border bg-[var(--app-bg-elevated-solid)] py-0 pl-[10px] pr-[24px] text-[clamp(14px,0.625rem,18px)] font-bold outline-none focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[var(--app-brand-press)]"
                  style={{
                    color: "var(--app-ink)",
                    borderColor: "var(--app-control-border)",
                    boxShadow: "var(--app-elev-1)",
                  }}
                >
                  {FILTERS.map((option) => (
                    <option key={option.id} value={option.id}>
                      {option.compactLabel} · {filterCounts.get(option.id) ?? 0}
                    </option>
                  ))}
                </select>
                <ChevronDown
                  className="pointer-events-none absolute right-[7px] top-1/2 h-[16px] w-[16px] -translate-y-1/2"
                  style={{ color: "var(--app-ink-3)" }}
                  aria-hidden
                />
              </div>
              <button
                type="button"
                data-fair-map-runtime-control
                onClick={locate}
                disabled={locating}
                className="tap-44 grid h-[44px] w-[44px] shrink-0 place-items-center rounded-full border disabled:opacity-60"
                style={{
                  color: "var(--app-ink)",
                  background: "var(--app-bg-elevated-solid)",
                  borderColor: "var(--app-control-border)",
                  boxShadow: "var(--app-elev-1)",
                }}
                aria-label={locating ? "Finding location" : "Show my location"}
              >
                <LocateFixed className="h-[18px] w-[18px]" aria-hidden />
              </button>
              <button
                type="button"
                onClick={showWholeGrounds}
                className="tap-44 grid h-[44px] w-[44px] shrink-0 place-items-center rounded-full border"
                style={{
                  color: "var(--app-ink)",
                  background: "var(--app-bg-elevated-solid)",
                  borderColor: "var(--app-control-border)",
                  boxShadow: "var(--app-elev-1)",
                }}
                aria-label="Whole grounds"
              >
                <Scan className="h-[18px] w-[18px]" aria-hidden />
              </button>
            </div>
          )}
          <p
            id="fair-map-filter-status"
            className="sr-only"
            aria-live="polite"
          >
            This map view shows{" "}
            {FILTERS.find((option) => option.id === filter)?.label ??
              "the selected places"}
            : {filterCounts.get(filter) ?? 0}{" "}
            {(filterCounts.get(filter) ?? 0) === 1 ? "place" : "places"}.
          </p>
        </div>
      ) : (
        <div
          data-fair-map-standard-controls
          className={selected ? "hidden lg:contents" : "contents"}
        >
          <div
            data-fair-map-search-rail
            className="absolute inset-x-3 top-3 z-30 lg:relative lg:inset-auto lg:top-auto lg:z-auto lg:mt-3"
          >
            <label htmlFor="fair-map-search" className="sr-only">
              Find a place or program event on the Fair grounds map
            </label>
            <Search
              className="pointer-events-none absolute left-4 top-1/2 z-10 h-4 w-4 -translate-y-1/2"
              style={{ color: "var(--app-ink-3)" }}
              aria-hidden
            />
            <input
              ref={searchInputRef}
              id="fair-map-search"
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Find a place or event"
              autoComplete="off"
              aria-controls={
                normalizedQuery.length >= 2
                  ? "fair-map-search-results"
                  : undefined
              }
              aria-describedby="fair-map-search-status"
              onKeyDown={(event) => {
                if (event.key === "Escape" && query) {
                  event.preventDefault();
                  setQuery("");
                }
              }}
              className="tap-44 min-h-12 w-full rounded-[var(--app-radius-lg)] border bg-[var(--app-bg-elevated-solid)] py-3 pl-11 pr-11 text-base font-semibold outline-none placeholder:font-medium focus-visible:border-[var(--app-brand-press)] focus-visible:ring-2 focus-visible:ring-[color:color-mix(in_srgb,var(--app-brand)_22%,transparent)]"
              style={{
                borderColor: "var(--app-control-border)",
                color: "var(--app-ink)",
                boxShadow: "var(--app-elev-1)",
              }}
            />
            {query ? (
              <button
                type="button"
                onClick={() => {
                  setQuery("");
                  window.requestAnimationFrame(() =>
                    searchInputRef.current?.focus(),
                  );
                }}
                className="tap-44 absolute right-1 top-1/2 grid h-11 w-11 -translate-y-1/2 place-items-center rounded-full"
                aria-label="Clear map search"
              >
                <X className="h-4 w-4" aria-hidden />
              </button>
            ) : null}
            {renderSearchResults()}
          </div>

          {interactiveMapAvailable ? (
            <div
              data-fair-map-filter-rail
              data-fair-map-runtime-control
              className="absolute inset-x-0 top-[4.15rem] z-20 lg:relative lg:inset-auto lg:top-auto lg:z-auto"
            >
            <div className="px-3 pb-1 sm:hidden">
              <div
                className="flex h-11 overflow-hidden rounded-full border"
                style={{
                  borderColor: "var(--app-control-border)",
                  background: "var(--app-bg-elevated-solid)",
                  boxShadow:
                    "inset 0 1px 0 color-mix(in srgb, white 65%, transparent)",
                }}
              >
                <label
                  htmlFor="fair-map-view"
                  className="flex shrink-0 items-center px-3 text-[11px] font-bold uppercase tracking-[0.08em]"
                  style={{ color: "var(--app-ink-3)" }}
                >
                  Map view
                </label>
                <span
                  className="relative min-w-0 flex-1 border-l"
                  style={{ borderColor: "var(--app-control-border)" }}
                >
                  <select
                    ref={mapViewSelectRef}
                    id="fair-map-view"
                    data-fair-map-filter-select
                    value={filter}
                    onChange={(event) =>
                      activateMapFilter(
                        event.target.value as FairGroundsMapView,
                      )
                    }
                    aria-describedby="fair-map-filter-status"
                    className="h-11 w-full appearance-none bg-transparent py-0 pl-3 pr-9 text-[13px] font-bold outline-none focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[var(--app-brand-press)]"
                    style={{ color: "var(--app-ink)" }}
                  >
                    {FILTERS.map((option) => (
                      <option key={option.id} value={option.id}>
                        {option.compactLabel} ·{" "}
                        {filterCounts.get(option.id) ?? 0}
                      </option>
                    ))}
                  </select>
                  <ChevronDown
                    className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2"
                    style={{ color: "var(--app-ink-3)" }}
                    aria-hidden
                  />
                </span>
              </div>
              <p
                id="fair-map-filter-status"
                className="sr-only"
                aria-live="polite"
              >
                This map view shows{" "}
                {FILTERS.find((option) => option.id === filter)?.label ??
                  "the selected places"}
                : {filterCounts.get(filter) ?? 0}{" "}
                {(filterCounts.get(filter) ?? 0) === 1 ? "place" : "places"}.
              </p>
            </div>
            <div
              className="scrollbar-none hidden gap-2 overflow-x-auto px-3 pb-1 sm:flex lg:-mx-6 lg:mt-4 lg:px-6"
              role="group"
              aria-label="Choose what the Fair map shows"
            >
              {FILTERS.map((option) => {
                const active = option.id === filter;
                const count = filterCounts.get(option.id) ?? 0;
                return (
                  <button
                    key={option.id}
                    type="button"
                    aria-pressed={active}
                    onClick={() => activateMapFilter(option.id)}
                    className="tap-44 min-h-11 shrink-0 rounded-full border px-3 text-[13px] font-semibold"
                    style={{
                      borderColor: active
                        ? option.tone
                        : "var(--app-control-border)",
                      color: active
                        ? "var(--app-ink-inverse)"
                        : "var(--app-ink-2)",
                      background: active
                        ? option.tone
                        : "var(--app-bg-elevated-solid)",
                      boxShadow: active
                        ? "0 6px 16px -12px var(--app-ink)"
                        : "inset 0 1px 0 color-mix(in srgb, white 65%, transparent)",
                    }}
                  >
                    {option.label} · {count}
                  </button>
                );
              })}
            </div>
            </div>
          ) : null}
        </div>
      )}

      <div className="mt-0 lg:mt-3 lg:grid lg:grid-cols-[minmax(0,1fr)_20rem] lg:gap-4">
        <div
          ref={mapCanvasShellRef}
          className="fair-grounds-map-canvas relative h-[calc(100dvh-8rem)] min-h-[520px] overflow-hidden border-y lg:h-[620px] lg:min-h-0 lg:rounded-[var(--app-radius-xl)] lg:border"
          style={{
            borderColor: "var(--app-control-border)",
            background: "var(--app-bg-sunken)",
            boxShadow: "0 18px 40px -34px var(--app-ink), inset 0 0 0 1px color-mix(in srgb, var(--app-bg-elevated-solid) 72%, transparent)",
          }}
        >
          {interactiveMapAvailable ? (
            <div
              ref={interactiveMapSurfaceRef}
              className="absolute inset-0"
            >
              <FairMapCanvasBoundary
                captureFocus={() =>
                  interactiveMapSurfaceRef.current?.contains(
                    document.activeElement,
                  ) === true
                }
                fallback={
                  <FairMapCanvasFallback
                    map={mapData}
                    reason="failed"
                    mapWasInteractive={mapLoaded}
                  />
                }
                onFailure={(_error, context) => handleMapFailure(context)}
              >
                <MapCanvas
                  ref={mapRef}
                  initialViewState={FAIR_VIEW}
                  mapStyle={mapStyle}
                  style={{ position: "absolute", inset: 0 }}
                  maxBounds={FAIR_CAMERA_BOUNDS}
                  minZoom={FAIR_ARRIVAL_MIN_ZOOM}
                  maxZoom={19}
                  reuseMaps
                  attributionControl={false}
                  dragRotate={false}
                  touchPitch={false}
                  cooperativeGestures
                  keyboard
                  onLoad={handleMapLoad}
                  onMoveEnd={updateMarkerGroups}
                  onResize={() => {
                    updateMarkerGroups();
                    // A restored map can first fit at its previous canvas
                    // size. Reframe after the actual phone size is applied.
                    if (mapLoadedRef.current && !selected) fitFilter(latestFilterRef.current);
                  }}
                  onError={(event) => {
                    const message = String(
                      event?.error?.message ?? "",
                    ).toLowerCase();
                    if (isFatalMapboxError(message, mapLoadedRef.current)) {
                      handleMapFailure();
                    }
                  }}
                  onClick={() => {
                    setSelectedId(null);
                    setClusterSelectionIds([]);
                  }}
                >
                  {mapLoaded ? (
                    <>
            <AttributionControl compact position="bottom-right" customAttribution={showAerial ? FAIR_AERIAL_ATTRIBUTION : undefined} />
            <NavigationControl position="top-right" showCompass={false} />
            <FairLiveTransit condensed={condensedMobileControls} hidden={Boolean(selected)} />
            {showAerial ? (
              <FairAerialLayer beforeId={mapStyle.layers?.find((layer) => layer.type === "symbol")?.id} />
            ) : null}
            <Source
              id="fair-grounds-context"
              type="geojson"
              data={groundsContextPolygons}
            >
              <Layer
                id="fair-grounds-context-shadow"
                type="line"
                paint={{
                  "line-color": "#221C15",
                  "line-opacity": 0.14,
                  "line-width": [
                    "interpolate",
                    ["linear"],
                    ["zoom"],
                    14,
                    1.5,
                    18,
                    5,
                  ],
                  "line-blur": 2.5,
                  "line-translate": [2.5, 3.5],
                  "line-translate-anchor": "viewport",
                }}
              />
              <Layer
                id="fair-grounds-context-fill"
                type="fill"
                paint={{
                  "fill-color": [
                    "match",
                    ["get", "kind"],
                    "animal",
                    "#BCD1C2",
                    "stage",
                    "#D5AFCC",
                    "parking",
                    "#B8D2DC",
                    "restroom",
                    "#D5E2E7",
                    "ticket",
                    "#E8C9BD",
                    "#E7D1A7",
                  ],
                  "fill-opacity": showAerial ? 0.1 : [
                    "interpolate",
                    ["linear"],
                    ["zoom"],
                    14,
                    0.34,
                    18,
                    0.72,
                  ],
                }}
              />
              <Layer
                id="fair-grounds-context-outline"
                type="line"
                paint={{
                  "line-color": [
                    "match",
                    ["get", "kind"],
                    "animal",
                    "#315A43",
                    "stage",
                    "#7E2C6F",
                    "parking",
                    "#285D73",
                    "restroom",
                    "#285D73",
                    "ticket",
                    "#B5462B",
                    "#925E16",
                  ],
                  "line-opacity": 0.62,
                  "line-width": [
                    "interpolate",
                    ["linear"],
                    ["zoom"],
                    14,
                    0.7,
                    18,
                    1.5,
                  ],
                }}
              />
              <Layer
                id="fair-grounds-context-highlight"
                type="line"
                paint={{
                  "line-color": "#FFFDF8",
                  "line-opacity": 0.58,
                  "line-width": [
                    "interpolate",
                    ["linear"],
                    ["zoom"],
                    14,
                    0.4,
                    18,
                    1,
                  ],
                  "line-translate": [-0.8, -0.8],
                  "line-translate-anchor": "viewport",
                }}
              />
              <Layer
                id="fair-landmark-labels"
                type="symbol"
                minzoom={15.5}
                filter={["in", ["get", "kind"], ["literal", ["building", "stage"]]]}
                layout={{
                  "text-field": ["get", "name"],
                  "text-font": MAP_LABEL_FONT_MEDIUM,
                  "text-size": 12,
                  "text-max-width": 10,
                  "text-padding": 12,
                  "text-offset": [0, 1.6],
                  "text-anchor": "top",
                }}
                paint={{
                  "text-color": "#221C15",
                  "text-halo-color": "#FFFDF8",
                  "text-halo-width": 2,
                }}
              />
            </Source>
            <Source id="fair-reviewed-geometry" type="geojson" data={visiblePolygons}>
              <Layer
                id="fair-reviewed-fill"
                type="fill"
                paint={{
                  "fill-color": [
                    "match",
                    ["get", "kind"],
                    "fairgrounds",
                    "#B5462B",
                    "animal",
                    "#315A43",
                    "stage",
                    "#7E2C6F",
                    "parking",
                    "#285D73",
                    "#C58A32",
                  ],
                  "fill-opacity": [
                    "case",
                    ["==", ["get", "kind"], "fairgrounds"],
                    showAerial ? 0 : 0.07,
                    showAerial ? 0.12 : 0.48,
                  ],
                }}
              />
              <Layer
                id="fair-reviewed-outline"
                type="line"
                paint={{
                  "line-color": [
                    "match",
                    ["get", "kind"],
                    "fairgrounds",
                    "#B5462B",
                    "animal",
                    "#315A43",
                    "stage",
                    "#7E2C6F",
                    "parking",
                    "#285D73",
                    "#925E16",
                  ],
                  "line-width": [
                    "case",
                    ["==", ["get", "kind"], "fairgrounds"],
                    2.5,
                    1.6,
                  ],
                }}
              />
            </Source>

            {renderedMarkerGroups.map((group) => {
              const feature = group.representative;
              const clustered = group.features.length > 1;
              const clusterSummary = clustered
                ? markerClusterSummary(group.features)
                : null;
              const clusterExpanded =
                clustered &&
                clusterSelectionIds.length === group.features.length &&
                group.features.every((candidate) =>
                  clusterSelectionIds.includes(candidate.properties.id),
                );
              const kind = feature.properties.kind as Exclude<
                FairGroundsMapKind,
                "fairgrounds"
              >;
              const theme = MARKER_THEME[kind];
              const Icon = markerIcon(kind);
              const savedMatches =
                savedStopMatches.get(feature.properties.id) ?? [];
              const scheduledHere =
                programMatches.get(feature.properties.id) ?? [];
              const selectedMarker = selectedId === feature.properties.id;
              const mappedName = mappedFeatureName(feature, mapData);
              const savedDescription =
                savedMatches.length > 0
                  ? `Saved in My Day as ${savedMatches.map((stop) => stop.title).join(", ")}.`
                  : "";
              const scheduleDescription =
                scheduledHere.length > 0
                  ? `${scheduledHere.length} ${scheduledHere.length === 1 ? "program item" : "program items"} here on your selected day.`
                  : "";
              const gateLabel =
                kind === "gate"
                  ? (feature.properties.name.match(/\b\d+A?\b/)?.[0] ?? "LM")
                  : null;
              return (
                <Marker
                  key={group.id}
                  longitude={feature.properties.anchor[0]}
                  latitude={feature.properties.anchor[1]}
                  anchor="center"
                >
                  {clustered ? (
                    <button
                      type="button"
                      data-fair-map-marker-group
                      data-fair-map-cluster
                      data-fair-map-marker-count={group.features.length}
                      data-fair-map-cluster-members={group.features
                        .map((candidate) => candidate.properties.id)
                        .join(" ")}
                      className="fair-grounds-map-marker tap-44 relative grid h-[44px] w-[44px] place-items-center rounded-full border-2 text-[14px] font-extrabold tabular-nums"
                      style={{
                        color: "var(--app-ink-inverse)",
                        background: "var(--app-cool)",
                        borderColor: clusterExpanded
                          ? "var(--app-amber)"
                          : "var(--app-ink-inverse)",
                        boxShadow: clusterExpanded
                          ? "0 0 0 3px var(--app-amber), 0 6px 16px rgba(34, 28, 21, 0.3)"
                          : "0 3px 12px rgba(34, 28, 21, 0.3)",
                      }}
                      aria-label={`${group.features.length} nearby map places: ${clusterSummary?.detailed ?? "mixed places"}. Open the list to choose one.`}
                      aria-expanded={clusterExpanded}
                      aria-controls={
                        clusterExpanded
                          ? "fair-map-cluster-selection"
                          : undefined
                      }
                      onClick={(event) => {
                        event.stopPropagation();
                        openMarkerCluster(
                          group.features,
                          event.currentTarget,
                        );
                      }}
                    >
                      {group.features.length}
                      <span
                        data-fair-map-cluster-summary
                        className="pointer-events-none absolute left-1/2 top-[40px] max-w-[94px] -translate-x-1/2 whitespace-nowrap rounded-full border px-1.5 py-0.5 text-[10px] font-bold leading-none normal-case tracking-normal"
                        style={{
                          color: "var(--app-ink)",
                          background: "color-mix(in srgb, var(--app-bg-elevated-solid) 94%, transparent)",
                          borderColor: "var(--app-control-border)",
                          boxShadow: "0 2px 7px rgba(34, 28, 21, 0.18)",
                        }}
                        aria-hidden
                      >
                        {clusterSummary?.compact ?? "Nearby places"}
                      </span>
                    </button>
                  ) : (
                    <button
                      type="button"
                      data-fair-map-marker-group
                      data-fair-map-marker-count="1"
                      data-fair-map-cluster-members={feature.properties.id}
                      className="fair-grounds-map-marker tap-44 relative grid h-[44px] w-[44px] place-items-center rounded-full"
                      aria-label={`${mappedName}. ${fairGroundsMapKindLabel(kind)}. ${savedDescription} ${scheduleDescription}`.trim()}
                      aria-expanded={selectedMarker}
                      aria-controls={
                        selectedMarker
                          ? "fair-map-selection-mobile fair-map-selection-desktop"
                          : undefined
                      }
                      onClick={(event) => {
                        event.stopPropagation();
                        chooseFeature(feature, event.currentTarget);
                      }}
                    >
                      <span
                        className="grid h-[36px] w-[36px] place-items-center rounded-full border-2"
                        style={{
                          color: selectedMarker
                            ? "var(--app-ink-inverse)"
                            : theme.color,
                          background: selectedMarker
                            ? theme.color
                            : theme.background,
                          borderColor: selectedMarker
                            ? "var(--app-ink-inverse)"
                            : theme.color,
                          boxShadow: selectedMarker
                            ? "0 0 0 3px var(--app-amber), 0 6px 16px rgba(34, 28, 21, 0.3)"
                            : "0 3px 10px rgba(34, 28, 21, 0.24)",
                        }}
                      >
                        {gateLabel ? (
                          <span
                            className="text-[12px] font-extrabold leading-none tabular-nums"
                            aria-hidden
                          >
                            {gateLabel}
                          </span>
                        ) : (
                          <Icon
                            className="h-[18px] w-[18px]"
                            strokeWidth={2.25}
                            aria-hidden
                          />
                        )}
                      </span>
                      {savedMatches.length > 0 ? (
                        <span
                          className="absolute right-0 top-0 grid h-[20px] min-w-[20px] place-items-center rounded-full border px-1 text-[12px] font-bold tabular-nums"
                          style={{
                            color: "var(--app-on-brand)",
                            background: "var(--app-brand-press)",
                            borderColor: "var(--app-ink-inverse)",
                          }}
                          aria-hidden
                        >
                          {savedStops.findIndex(
                            (stop) => stop.id === savedMatches[0].id,
                          ) + 1}
                        </span>
                      ) : null}
                      {scheduledHere.length > 0 ? (
                        <span
                          className="absolute bottom-0 left-0 grid h-[20px] min-w-[20px] place-items-center rounded-full border px-1 text-[12px] font-bold tabular-nums"
                          style={{
                            color: "var(--app-ink)",
                            background: "var(--app-amber)",
                            borderColor: "var(--app-bg-elevated-solid)",
                          }}
                          aria-hidden
                        >
                          {scheduledHere.length}
                        </span>
                      ) : null}
                    </button>
                  )}
                </Marker>
              );
            })}

            {savedCar &&
            savedCar.longitude !== null &&
            savedCar.latitude !== null ? (
              <Marker
                longitude={savedCar.longitude}
                latitude={savedCar.latitude}
                anchor="bottom"
              >
                <button
                  type="button"
                  data-fair-saved-car
                  className="fair-grounds-map-marker tap-44 grid h-[44px] w-[44px] place-items-center rounded-full"
                  aria-label={`Show saved car location${savedCar.lotLabel ? `, ${savedCar.lotLabel}` : ""}${savedCar.note ? `, note: ${savedCar.note}` : ""}`}
                  onClick={(event) => {
                    event.stopPropagation();
                    showSavedCar(event.currentTarget);
                  }}
                >
                  <span
                    className="grid h-[40px] w-[40px] place-items-center rounded-full border-2"
                    style={{
                      color: "var(--app-ink-inverse)",
                      background: "var(--app-cool)",
                      borderColor: "var(--app-ink-inverse)",
                      boxShadow: "0 3px 12px rgba(34, 28, 21, 0.3)",
                    }}
                    aria-hidden
                  >
                    <CircleParking className="h-5 w-5" aria-hidden />
                  </span>
                </button>
              </Marker>
            ) : null}

            {visitorLocation ? (
              <Marker longitude={visitorLocation.longitude} latitude={visitorLocation.latitude} anchor="center">
                <span
                  data-fair-visitor-location
                  className="block h-4 w-4 rounded-full border-[3px]"
                  style={{
                    background: "var(--app-cool)",
                    borderColor: "var(--app-ink-inverse)",
                    boxShadow: "0 0 0 5px color-mix(in srgb, var(--app-cool) 22%, transparent)",
                  }}
                  aria-hidden
                />
              </Marker>
            ) : null}
              </>
            ) : null}
              </MapCanvas>
              </FairMapCanvasBoundary>
            </div>
          ) : mapRuntime === "unsupported" || mapRuntime === "failed" ? (
            <FairMapCanvasFallback
              map={mapData}
              reason={mapRuntime}
              mapWasInteractive={mapLoaded}
            />
          ) : null}

          {interactiveMapAvailable && mapLoaded && !selected ? (
            <div
              data-fair-aerial-controls
              className={`absolute z-10 rounded-full border bg-[var(--app-bg-elevated-solid)] shadow-sm ${condensedMobileControls ? "left-[12px] top-[64px]" : "left-[116px] top-[124px] sm:left-[12px] sm:top-[176px]"}`}
              style={{ borderColor: "var(--app-control-border)" }}
            >
              <button
                type="button"
                data-fair-map-runtime-control
                aria-label="Aerial background"
                aria-pressed={aerialEnabled}
                title="Switch between the 2025 aerial and the clear map"
                onClick={() => setAerialEnabled((current) => !current)}
                className="tap-44 min-h-[44px] rounded-full px-[8px] text-[12px] font-bold"
                style={{
                  background: aerialEnabled ? "var(--app-cool)" : "transparent",
                  color: aerialEnabled ? "var(--app-ink-inverse)" : "var(--app-ink)",
                }}
              >
                {aerialEnabled && aerialStatus === "unavailable" ? "No aerial" : aerialEnabled && aerialStatus === "loading" ? "Loading…" : "Aerial 2025"}
              </button>
              <p role="status" className="sr-only">
                {aerialEnabled
                  ? aerialStatus === "unavailable"
                    ? "The aerial is unavailable, so the clear map is shown."
                    : aerialStatus === "loading"
                      ? "The 2025 aerial is loading."
                      : "This is a 2025 aerial, and the event layout may differ."
                  : "The map shows reviewed places without an aerial background."}
              </p>
            </div>
          ) : null}

          {interactiveMapAvailable && mapLoaded && !condensedMobileControls ? (
            <div
              data-fair-map-utility-controls
              className={`absolute left-3 top-[7.75rem] z-10 items-start gap-2 lg:top-3 lg:flex lg:flex-col ${selected ? "hidden" : "flex"}`}
            >
            <button
              type="button"
              data-fair-map-runtime-control
              onClick={locate}
              disabled={locating}
              className="tap-44 inline-flex h-[44px] w-[44px] items-center justify-center gap-2 rounded-full border px-0 text-[13px] font-bold disabled:opacity-60 sm:w-auto sm:px-3"
              style={{
                color: "var(--app-ink)",
                background: "var(--app-bg-elevated-solid)",
                borderColor: "var(--app-control-border)",
                boxShadow: "var(--app-elev-1)",
              }}
            >
              <LocateFixed className="h-4 w-4" aria-hidden />
              <span className="sr-only">
                {locating ? "Finding location" : "Show my location"}
              </span>
              <span className="hidden sm:inline" aria-hidden="true">
                {locating ? "Finding location" : "Show my location"}
              </span>
            </button>

            <button
              type="button"
              onClick={showWholeGrounds}
              className="tap-44 inline-flex h-[44px] w-[44px] items-center justify-center gap-2 rounded-full border px-0 text-[13px] font-bold sm:w-auto sm:px-3"
              style={{
                color: "var(--app-ink)",
                background: "var(--app-bg-elevated-solid)",
                borderColor: "var(--app-control-border)",
                boxShadow: "var(--app-elev-1)",
              }}
            >
              <Scan className="h-4 w-4" aria-hidden />
              <span className="sr-only">Whole grounds</span>
              <span className="hidden sm:inline" aria-hidden="true">
                Whole grounds
              </span>
            </button>
            </div>
          ) : null}

          {interactiveMapAvailable && mapLoaded && clusterSelectionFeatures.length > 1 && !selected ? (
            <dialog
              ref={clusterSelectionDialogRef}
              id="fair-map-cluster-selection"
              data-fair-map-cluster-selection
              className="fair-map-mobile-sheet fair-map-cluster-dialog fixed left-3 right-3 mx-auto max-w-[30rem] overflow-y-auto overscroll-contain rounded-[var(--app-radius-lg)] border p-0 lg:absolute lg:bottom-3 lg:left-3 lg:right-auto lg:max-h-[calc(100%-1.5rem)] lg:w-[22rem]"
              style={{
                zIndex: "var(--z-overlay)",
                borderColor: "var(--app-control-border)",
                borderTopColor: "var(--app-cool)",
                borderTopWidth: "4px",
                background: "var(--app-bg-elevated-solid)",
                boxShadow: "var(--app-elev-3), var(--app-edge), var(--app-hi)",
              }}
              role="dialog"
              aria-modal="true"
              aria-labelledby="fair-map-cluster-selection-heading"
              onCancel={(event) => {
                event.preventDefault();
                closeMarkerCluster();
              }}
              onClick={(event) => {
                const bounds = event.currentTarget.getBoundingClientRect();
                const clickedBackdrop =
                  event.clientX < bounds.left ||
                  event.clientX > bounds.right ||
                  event.clientY < bounds.top ||
                  event.clientY > bounds.bottom;
                if (event.target !== event.currentTarget && !clickedBackdrop) {
                  return;
                }
                event.preventDefault();
                event.stopPropagation();
                closeMarkerCluster();
              }}
              onKeyDown={keepFocusInsideDialog}
            >
              <div className="relative p-3">
              <button
                type="button"
                onClick={closeMarkerCluster}
                className="tap-44 absolute right-1 top-1 grid h-11 w-11 place-items-center rounded-full"
                aria-label="Close nearby map places"
              >
                <X className="h-4 w-4" aria-hidden />
              </button>
              <p
                className="pr-11 text-[12px] font-bold uppercase tracking-[0.1em]"
                style={{ color: "var(--app-cool)" }}
              >
                Nearby on the map
              </p>
              <h3
                id="fair-map-cluster-selection-heading"
                ref={clusterSelectionHeadingRef}
                tabIndex={-1}
                className="mt-1 pr-11 text-[21px] font-extrabold leading-tight tracking-[-0.03em] outline-none"
              >
                Choose from {clusterSelectionFeatures.length} places
              </h3>
              <p
                className="mt-1 text-[13px] leading-relaxed"
                style={{ color: "var(--app-ink-2)" }}
              >
                {markerClusterSummary(clusterSelectionFeatures).detailed}. Choose
                a place to open its details.
              </p>
              <ul className="mt-2 grid gap-1" aria-label="Nearby map places">
                {clusterSelectionFeatures.map((feature) => {
                  const Icon = markerIcon(feature.properties.kind);
                  return (
                    <li key={feature.properties.id}>
                      <button
                        type="button"
                        onClick={(event) =>
                          chooseFeature(feature, event.currentTarget, true)
                        }
                        className="tap-44 flex min-h-12 w-full items-center gap-3 rounded-[var(--app-radius-md)] px-2 py-2 text-left hover:bg-[var(--app-bg-sunken)] focus-visible:bg-[var(--app-bg-sunken)]"
                      >
                        <span
                          className="grid h-9 w-9 shrink-0 place-items-center rounded-full border"
                          style={{
                            color: markerTone(feature.properties.kind),
                            borderColor: markerTone(feature.properties.kind),
                            background: "var(--app-bg-elevated-solid)",
                          }}
                          aria-hidden
                        >
                          <Icon className="h-4 w-4" aria-hidden />
                        </span>
                        <span className="min-w-0">
                          <span className="block text-[14px] font-bold leading-snug">
                            {mappedFeatureName(feature, mapData)}
                          </span>
                          <span
                            className="block text-[12px] font-semibold"
                            style={{ color: "var(--app-ink-3)" }}
                          >
                            {fairGroundsMapKindLabel(feature.properties.kind)}
                          </span>
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
              </div>
            </dialog>
          ) : null}

          {selected ? (
            <dialog
              ref={mobileSelectionDialogRef}
              id="fair-map-selection-mobile"
              data-fair-map-selection
              className="fair-map-mobile-sheet fair-map-place-dialog fixed left-3 right-3 mx-auto max-w-[30rem] overflow-y-auto overscroll-contain rounded-[var(--app-radius-lg)] border p-4 lg:hidden"
              style={{
                zIndex: selectionExpanded
                  ? "var(--z-overlay)"
                  : "calc(var(--z-sticky) + 1)",
                borderColor: "var(--app-control-border)",
                borderTopColor: selectedTone,
                borderTopWidth: "4px",
                background: "var(--app-bg-elevated-solid)",
                boxShadow:
                  "var(--app-elev-3), var(--app-edge), var(--app-hi)",
              }}
              role={selectionExpanded ? "dialog" : "region"}
              aria-modal={selectionExpanded ? "true" : undefined}
              aria-labelledby="fair-map-selection-mobile-heading"
              onCancel={(event) => {
                event.preventDefault();
                closeSelection();
              }}
              onKeyDown={(event) => {
                if (selectionExpanded) {
                  keepFocusInsideDialog(event);
                  return;
                }
                if (event.key === "Escape") {
                  event.preventDefault();
                  closeSelection();
                }
              }}
            >
              <button
                type="button"
                onClick={closeSelection}
                className="tap-44 absolute right-1 top-1 grid h-11 w-11 place-items-center rounded-full"
                aria-label="Close selected map place"
              >
                <X className="h-4 w-4" aria-hidden />
              </button>
              <p
                className="pr-10 text-[12px] font-bold uppercase tracking-[0.1em]"
                style={{ color: selectedTone }}
              >
                {fairGroundsMapKindLabel(selected.properties.kind)}
              </p>
              <h3
                id="fair-map-selection-mobile-heading"
                ref={mobileSelectionHeadingRef}
                tabIndex={-1}
                className="mt-1 pr-10 text-[22px] font-extrabold leading-tight tracking-[-0.03em] outline-none"
              >
                <span className="sr-only">Selected map place: </span>
                {mappedFeatureName(selected, mapData)}
              </h3>
              <p className="mt-1 text-[13px] font-semibold" style={{ color: "var(--app-ink-3)" }}>
                {selectedProgramItems.length > 0
                  ? `${selectedProgramItems.length} ${selectedProgramItems.length === 1 ? "event" : "events"} here on your day`
                  : fairGroundsMapPurposeLabel(selected)}
                {selectedProgramItems.length === 0 ? (
                  <span className="font-normal">
                    {" "}·{" "}
                    {locationPrecisionLabel(
                      selected.properties.locationPrecision,
                    ) ?? "Reviewed Fair map place"}
                  </span>
                ) : null}
              </p>
              {selected.properties.detail ? (
                <p
                  className={`mt-1.5 text-[13px] leading-relaxed ${selectionExpanded ? "" : "line-clamp-2"}`}
                  style={{ color: "var(--app-ink-2)" }}
                >
                  {selected.properties.detail}
                </p>
              ) : null}
              <FairMapFeatureActions feature={selected} mode="primary" />
              <button
                ref={mobileSelectionToggleRef}
                type="button"
                aria-expanded={selectionExpanded}
                aria-controls="fair-map-selection-mobile-details"
                onClick={() => {
                  if (selectionExpanded) {
                    focusCollapsedSelectionRef.current = true;
                  }
                  setSelectionExpanded((current) => !current);
                }}
                className="tap-44 mt-1 inline-flex min-h-11 items-center gap-1 text-[13px] font-bold"
                style={{ color: selectedTone }}
              >
                {selectionExpanded ? "Show less" : "More details"}
                <ChevronDown
                  className={`h-4 w-4 transition-transform motion-reduce:transition-none ${selectionExpanded ? "rotate-180" : ""}`}
                  aria-hidden
                />
              </button>
              <div
                id="fair-map-selection-mobile-details"
                className={selectionExpanded ? "block" : "hidden"}
              >
              <FairMapFeatureActions feature={selected} mode="secondary" />
              {selectedStops.length > 0 ? (
                <p
                  className="mt-2 text-[14px] font-semibold"
                  style={{ color: "var(--app-ink-2)" }}
                >
                  Saved in My Day: {selectedStops.map((stop) => stop.title).join(", ")}
                </p>
              ) : null}
              {selectedProgramItems.length > 0 ? (
                <div
                  className="mt-3 border-l-2 pl-3"
                  style={{ borderColor: "var(--app-amber)" }}
                >
                  <p
                    className="text-[13px] font-bold uppercase tracking-[0.09em]"
                    style={{ color: "var(--app-warning-press)" }}
                  >
                    On your selected day
                  </p>
                  {selectedProgramItems.slice(0, 2).map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => openProgramItemFromMap(item.id)}
                      className="tap-44 -ml-2 mt-0.5 flex min-h-11 w-[calc(100%+0.5rem)] items-center rounded-[var(--app-radius-sm)] px-2 text-left text-[14px] font-semibold leading-snug hover:bg-[var(--app-bg-sunken)] focus-visible:bg-[var(--app-bg-sunken)]"
                      aria-label={`Open program details for ${item.title}`}
                    >
                      <span>
                        <span className="tabular-nums" style={{ color: "var(--app-brand-press)" }}>
                          {item.timeLabel}
                        </span>{" "}
                        · {item.title}
                      </span>
                    </button>
                  ))}
                  {selectedProgramItems.length > 2 ? (
                    <button
                      type="button"
                      onClick={browseProgram}
                      className="tap-44 mt-1 inline-flex min-h-11 items-center text-[13px] font-bold"
                      style={{ color: "var(--app-cool)" }}
                    >
                      See {selectedProgramItems.length - 2} more in Program
                    </button>
                  ) : null}
                </div>
              ) : null}
                <div
                  className="mt-3 flex flex-wrap items-center gap-3 border-t pt-2"
                  style={{ borderColor: "var(--app-border)" }}
                >
                <button
                  type="button"
                  onClick={reportMobileMapIssue}
                  className="tap-44 inline-flex min-h-11 items-center gap-1.5 text-[13px] font-bold"
                  style={{ color: "var(--app-brand-press)" }}
                >
                    <MessageSquareWarning className="h-4 w-4" aria-hidden />
                    Report issue
                  </button>
                </div>
              </div>
            </dialog>
          ) : null}
        </div>

        <aside
          id={selected ? "fair-map-selection-desktop" : undefined}
          data-fair-map-selection={selected ? "" : undefined}
          className="relative z-10 mx-2 -mt-4 hidden rounded-[var(--app-radius-xl)] border p-4 lg:mx-0 lg:mt-0 lg:flex lg:min-h-[620px] lg:flex-col lg:p-5"
          style={{
            borderColor: "var(--app-control-border)",
            borderTopColor: selected ? selectedTone : "var(--app-brand-press)",
            borderTopWidth: "4px",
            background: "var(--app-bg-elevated-solid)",
            boxShadow: "var(--app-elev-2), var(--app-edge), var(--app-hi)",
          }}
          aria-labelledby={
            selected
              ? "fair-map-selection-desktop-heading"
              : "fair-map-guidance-heading"
          }
          onKeyDown={(event) => {
            if (!selected || event.key !== "Escape") return;
            event.preventDefault();
            closeSelection();
          }}
        >
          {selected ? (
            <>
              <button
                type="button"
                onClick={closeSelection}
                className="tap-44 absolute right-2 top-2 grid h-11 w-11 place-items-center rounded-full"
                aria-label="Close selected map place"
              >
                <X className="h-4 w-4" aria-hidden />
              </button>
              <p className="pr-11 text-[13px] font-bold uppercase tracking-[0.1em]" style={{ color: selectedTone }}>
                {fairGroundsMapKindLabel(selected.properties.kind)}
              </p>
              <h3
                id="fair-map-selection-desktop-heading"
                ref={desktopSelectionHeadingRef}
                tabIndex={-1}
                className="mt-1 pr-11 text-[22px] font-extrabold leading-tight tracking-[-0.035em] outline-none"
              >
                <span className="sr-only">Selected map place: </span>
                {mappedFeatureName(selected, mapData)}
              </h3>
              <p
                className="mt-2 text-[14px] font-bold leading-snug"
                style={{ color: selectedTone }}
              >
                {selectedProgramItems.length > 0
                  ? `${selectedProgramItems.length} ${selectedProgramItems.length === 1 ? "event" : "events"} here on your day`
                  : fairGroundsMapPurposeLabel(selected)}
              </p>
              <p
                className="mt-3 text-[14px] leading-relaxed"
                style={{ color: "var(--app-ink-2)" }}
              >
                {selected.properties.detail ??
                  "Use this mapped landmark to orient yourself. Radius does not infer an indoor entrance or walking route."}
              </p>
              <p
                className="mt-2 text-[11px] font-bold uppercase tracking-[0.08em]"
                style={{ color: "var(--app-ink-3)" }}
              >
                {locationPrecisionLabel(
                  selected.properties.locationPrecision,
                ) ?? "Reviewed Fair map place"}
              </p>
              <FairMapFeatureActions feature={selected} />
              {selectedStops.length > 0 ? (
                <div className="mt-4 border-l-2 pl-3" style={{ borderColor: "var(--app-brand)" }}>
                  <p className="text-[13px] font-bold uppercase tracking-[0.08em]" style={{ color: "var(--app-brand-press)" }}>
                    In My Day
                  </p>
                  {selectedStops.map((stop) => (
                    <p key={stop.id} className="mt-1 text-[14px] font-semibold leading-snug">
                      {stop.title}
                    </p>
                  ))}
                </div>
              ) : null}
              {selectedProgramItems.length > 0 ? (
                <div
                  className="mt-4 border-l-2 pl-3"
                  style={{ borderColor: "var(--app-amber)" }}
                >
                  <p
                    className="text-[13px] font-bold uppercase tracking-[0.09em]"
                    style={{ color: "var(--app-warning-press)" }}
                  >
                    On your selected day
                  </p>
                  {selectedProgramItems.slice(0, 3).map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => openProgramItemFromMap(item.id)}
                      className="tap-44 -ml-2 mt-1 flex min-h-11 w-[calc(100%+0.5rem)] items-center rounded-[var(--app-radius-sm)] px-2 text-left text-[14px] font-semibold leading-snug hover:bg-[var(--app-bg-sunken)] focus-visible:bg-[var(--app-bg-sunken)]"
                      aria-label={`Open program details for ${item.title}`}
                    >
                      <span>
                        <span className="tabular-nums" style={{ color: "var(--app-brand-press)" }}>
                          {item.timeLabel}
                        </span>{" "}
                        · {item.title}
                      </span>
                    </button>
                  ))}
                  {selectedProgramItems.length > 3 ? (
                    <button
                      type="button"
                      onClick={browseProgram}
                      className="tap-44 mt-2 inline-flex min-h-11 items-center text-[13px] font-bold"
                      style={{ color: "var(--app-cool)" }}
                    >
                      See {selectedProgramItems.length - 3} more in Program
                    </button>
                  ) : null}
                </div>
              ) : null}
            </>
          ) : (
            <>
              <p className="text-[13px] font-bold uppercase tracking-[0.1em]" style={{ color: "var(--app-brand-press)" }}>
                Your bearings
              </p>
              <h3 id="fair-map-guidance-heading" className="mt-1 text-[22px] font-extrabold leading-tight tracking-[-0.035em]">
                {interactiveMapAvailable
                  ? "Find your way around"
                  : "Search or browse by task."}
              </h3>
              <p className="mt-3 text-[14px] leading-relaxed" style={{ color: "var(--app-ink-2)" }}>
                {interactiveMapAvailable
                  ? "Start with gates, restrooms, and show areas. Switch the layer when you want animals, buildings, parking, or published transit stops."
                  : "Every reviewed place remains available below, including gates, restrooms, buildings, animals, parking, and published transit stops."}
              </p>
              <div className="mt-4 grid grid-cols-2 gap-2">
                <div className="rounded-[var(--app-radius-md)] bg-[var(--app-bg-sunken)] p-3">
                  <p className="text-[22px] font-extrabold tabular-nums">{counts.get("gate") ?? 0}</p>
                  <p className="text-[12px] font-semibold" style={{ color: "var(--app-ink-3)" }}>mapped gates</p>
                </div>
                <div className="rounded-[var(--app-radius-md)] bg-[var(--app-bg-sunken)] p-3">
                  <p className="text-[22px] font-extrabold tabular-nums">{counts.get("restroom") ?? 0}</p>
                  <p className="text-[12px] font-semibold" style={{ color: "var(--app-ink-3)" }}>restroom points</p>
                </div>
              </div>
            </>
          )}

          {savedStops.length > 0 ? (
            <p className="mt-4 text-[14px] font-semibold leading-relaxed" style={{ color: "var(--app-ink-2)" }}>
              {mappedSavedStopIds.size} of {savedStops.length} saved {savedStops.length === 1 ? "stop has" : "stops have"} reviewed map geometry. Radius leaves the rest unpinned rather than guessing.
            </p>
          ) : null}

          {savedCar && savedCar.latitude === null ? (
            <p className="mt-3 text-[14px] leading-relaxed" style={{ color: "var(--app-ink-2)" }}>
              Saved car: {savedCar.lotLabel ?? "note only"}. Save a precise location in Travel to place it on this map.
            </p>
          ) : null}

          <div className="mt-4 border-t pt-3 lg:mt-auto" style={{ borderColor: "var(--app-border)" }}>
            <button
              type="button"
              onClick={() => reportMapIssue(selected)}
              className="tap-44 inline-flex min-h-11 items-center gap-2 text-[13px] font-bold"
              style={{ color: "var(--app-brand-press)" }}
            >
              <MessageSquareWarning className="h-4 w-4" aria-hidden />
              Report a map issue
            </button>
            <p
              className="mt-2 text-[12px] leading-relaxed"
              style={{ color: "var(--app-ink-3)" }}
            >
              Grounds geometry: {" "}
              <a
                href={mapData.source.url}
                target="_blank"
                rel="noopener noreferrer"
                className="underline underline-offset-2"
              >
                {mapData.source.publisher}, {mapData.source.license}
              </a>
              . Official arrival and transit details link to their own sources.
              Follow current on-site signs.
            </p>
            {interactiveMapAvailable ? (
              <p className="mt-2 text-[12px] leading-relaxed" style={{ color: "var(--app-ink-2)" }}>
                Aerial imagery: State of Maryland, 2025. Buildings and paths may help you orient yourself; this year’s temporary rides and booths may differ.
              </p>
            ) : null}
          </div>
        </aside>
      </div>

      {locationStatus ? (
        <p
          className="mt-3 border-l-2 py-1 pl-3 text-[14px] font-semibold leading-relaxed"
          style={{ borderColor: "var(--app-cool)", color: "var(--app-ink-2)" }}
        >
          {locationStatus}
        </p>
      ) : null}

      <details
        id="fair-map-place-list"
        open={
          mapRuntime === "unsupported" || mapRuntime === "failed"
            ? true
            : undefined
        }
        className="mt-4 overflow-hidden rounded-[var(--app-radius-lg)] border"
        style={{
          borderColor: "var(--app-control-border)",
          background: "var(--app-bg-elevated-solid)",
        }}
      >
        <summary className="tap-44 flex min-h-12 cursor-pointer items-center justify-between gap-3 px-4 py-2 text-[14px] font-bold">
          <span>Find places by task</span>
          <span
            className="tabular-nums"
            style={{ color: "var(--app-ink-3)" }}
            aria-label={`${accessibleFeatures.length + (savedCar !== null && savedCar.latitude !== null && savedCar.longitude !== null ? 1 : 0)} places`}
          >
            {accessibleFeatures.length +
              (savedCar !== null &&
              savedCar.latitude !== null &&
              savedCar.longitude !== null
                ? 1
                : 0)}
          </span>
        </summary>
        <ul
          className="border-t"
          style={{ borderColor: "var(--app-border)" }}
          aria-label="Mapped places grouped by task"
        >
          {groupedAccessibleFeatures.map((group) => (
            <li
              key={group.id}
              className="border-b p-2 last:border-b-0"
              style={{ borderColor: "var(--app-border)" }}
            >
              <section aria-labelledby={`fair-map-list-${group.id}`}>
                <div className="px-3 pb-1.5 pt-2">
                  <div className="flex items-baseline justify-between gap-3">
                    <h3
                      id={`fair-map-list-${group.id}`}
                      className="text-[14px] font-bold"
                    >
                      {group.label}
                    </h3>
                    <span
                      className="text-[12px] font-semibold tabular-nums"
                      style={{ color: "var(--app-ink-3)" }}
                      aria-hidden="true"
                    >
                      {group.features.length +
                        (group.id === "arrive" &&
                        savedCar !== null &&
                        savedCar?.longitude !== null &&
                        savedCar?.latitude !== null
                          ? 1
                          : 0)}
                    </span>
                  </div>
                  <p
                    className="mt-0.5 text-[12px] leading-snug"
                    style={{ color: "var(--app-ink-3)" }}
                  >
                    {group.detail}
                  </p>
                </div>
                <ul className="grid gap-1 sm:grid-cols-2">
                  {group.id === "arrive" &&
                  savedCar &&
                  savedCar.longitude !== null &&
                  savedCar.latitude !== null ? (
                    <li>
                      <button
                        type="button"
                        onClick={(event) => showSavedCar(event.currentTarget)}
                        className="tap-44 flex min-h-12 w-full items-center gap-3 rounded-[var(--app-radius-md)] px-3 py-2 text-left hover:bg-[var(--app-bg-sunken)] focus-visible:bg-[var(--app-bg-sunken)]"
                      >
                        <CircleParking
                          className="h-5 w-5 shrink-0"
                          style={{ color: "var(--app-cool)" }}
                          aria-hidden
                        />
                        <span>
                          <span className="block text-[14px] font-bold">
                            Saved car
                          </span>
                          <span
                            className="block text-[12px] font-semibold"
                            style={{ color: "var(--app-ink-3)" }}
                          >
                            {savedCar.lotLabel ?? "Saved location"}
                          </span>
                        </span>
                      </button>
                    </li>
                  ) : null}
                  {group.features.map((feature) => {
                    const savedHere =
                      savedStopMatches.get(feature.properties.id) ?? [];
                    const scheduledHere =
                      programMatches.get(feature.properties.id) ?? [];
                    const selectedHere = selectedId === feature.properties.id;
                    return (
                      <li key={`list-${feature.properties.id}`}>
                        <button
                          type="button"
                          aria-pressed={selectedHere}
                          aria-controls={
                            selectedHere
                              ? "fair-map-selection-mobile fair-map-selection-desktop"
                              : undefined
                          }
                          onClick={(event) =>
                            chooseFeature(feature, event.currentTarget)
                          }
                          className="tap-44 min-h-12 w-full rounded-[var(--app-radius-md)] px-3 py-2 text-left hover:bg-[var(--app-bg-sunken)] focus-visible:bg-[var(--app-bg-sunken)]"
                          style={{
                            background: selectedHere
                              ? "var(--app-brand-tint-6)"
                              : "transparent",
                          }}
                        >
                          <span className="block text-[14px] font-bold">
                            {mappedFeatureName(feature, mapData)}
                          </span>
                          <span
                            className="block text-[12px] font-semibold leading-snug"
                            style={{ color: "var(--app-ink-3)" }}
                          >
                            {fairGroundsMapKindLabel(feature.properties.kind)}
                            {savedHere.length > 0
                              ? ` · ${savedHere.length} saved ${savedHere.length === 1 ? "stop" : "stops"}`
                              : ""}
                            {scheduledHere.length > 0
                              ? ` · ${scheduledHere.length} ${scheduledHere.length === 1 ? "program item" : "program items"}`
                              : ""}
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </section>
            </li>
          ))}
        </ul>
      </details>
    </section>
  );
}
