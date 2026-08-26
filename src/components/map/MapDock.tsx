"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Armchair, Baby, Beer, Bike, BusFront, Check, ChevronDown, ChevronLeft, ChevronRight, Church, Clock, CloudSun, Coffee, Construction, Dog, Droplets, Gauge, Heart, History, Hotel, Landmark, Layers3, LoaderCircle, LocateFixed, MapPin, MoreHorizontal, Music, NotebookPen, Palette, PlugZap, Search as SearchIcon, Share2, ShieldPlus, ShoppingBag, Tag, TimerReset, Trash2, Trees, Utensils, Waves, Waypoints, Wifi, Wine, X, Zap, type LucideIcon } from "lucide-react";
import RestroomMark from "@/components/icons/RestroomMark";
import { INTENTS } from "@/data/intents";
import { MUNICIPALITIES } from "@/data/municipalities";
import { AMENITY_GROUPS } from "./constants";
import { OVERLAYS, type OverlayKey } from "@/lib/overlays";
import type { BrowseDockInfo, MapPinPlace } from "./types";
import { formatDistance, type LngLat } from "@/lib/geo";
import type { SearchResult } from "@/lib/search/index";
import TimeScrubber from "./TimeScrubber";
import { haptic } from "@/lib/haptics";
import {
  getScope,
  parseScope,
  scopeTownSlug,
  setScope,
  subscribeScopeChange,
  SCOPE_PARAM,
  type Scope,
} from "@/lib/scope";
import { track } from "@/lib/track";
import { consumeFindRequest } from "@/lib/findBridge";
import {
  TIME_WINDOWS,
  countLine,
  dockDirty,
  layerStatusLine,
  layersCaption,
  whatCaption,
  whenCaption,
} from "./dockCaption";
import type { MapDiscovery } from "./mapDiscoveries";
import { mapContentsSummary } from "./mapContent";
import type { LiveLayerHealth } from "@/lib/live-layer-health";
import { normalizeMapReturnTo } from "@/lib/map-return";
import { replaceMapUrl } from "@/lib/map-url-state";
import { mapSearchResultLimit } from "./mapSearchVisibility";
import {
  radiusSceneStatusLabel,
  type RadiusSceneId,
  type ResolvedRadiusScene,
} from "./radiusScenes";
import type { LiveBusLayerSnapshot } from "./LiveBuses";
import { shouldOfferMapLocationForUrl } from "./mapLocationIntro";
import { focusMapBeforeDockDismiss } from "./mapDockFocus";
import type {
  MapLayerGroup,
  MapLayerSourceHealth,
} from "./deferredBrowseLayers";

export type TransitAlertSnapshot = {
  status: "loading" | "ready" | "empty" | "stale" | "error";
  count: number;
};
import MapInViewPlacesDisclosure from "./MapInViewPlacesDisclosure";

type SetState<T> = (updater: T | ((prev: T) => T)) => void;

/** One Lucide component per intent icon key, so the Places grid renders an
 *  icon per category straight from the shared INTENTS registry. */
const CATEGORY_ICONS: Record<string, LucideIcon> = {
  Coffee, Utensils, Wine, Beer, Trees, Baby, Palette, Heart, Landmark, ShoppingBag, Hotel, Church,
};

const ESSENTIAL_ICONS: Record<string, LucideIcon> = {
  restroom: RestroomMark,
  water: Droplets,
  trash: Trash2,
  dog: Dog,
  wifi: Wifi,
  ev: Zap,
  outlet: PlugZap,
  bike: Bike,
  seating: Armchair,
  play: Baby,
  water_access: Waves,
  river_gauge: Gauge,
  safety: ShieldPlus,
  other: MoreHorizontal,
};

/** The 12 intents, grouped the way a resident thinks about them, so the Places
 *  pane shows the whole guide at a glance without a second navigation layer.
 *  Order/keys mirror @/data/intents; a new intent must be added to a family
 *  here (a missing key just won't appear in the grid). */
const CATEGORY_FAMILIES: ReadonlyArray<{ label: string; keys: string[] }> = [
  { label: "Food & drink", keys: ["coffee", "eat", "breweries", "wineries"] },
  { label: "Outdoors & active", keys: ["outdoor", "family"] },
  { label: "Culture & community", keys: ["arts", "faith"] },
  { label: "Everyday & services", keys: ["wellness", "shop", "civic", "stay"] },
];

// Community reports are time-sensitive map context, not a public amenity like
// water or a restroom. Keep them out of the Places catalog and give them an
// honest home beside incidents, parking, transit, and radar.
const PUBLIC_AMENITY_GROUPS = AMENITY_GROUPS.filter(
  (group) => !group.comingSoon && group.key !== "community",
);

/** The map begins as an observation surface. These controls are revealed only
 *  after a person opens Browse; none compete with the county on load. */
type Pane = "contents" | "what" | "amenities" | "when" | "where" | "discover" | "layers" | "conditions" | "localLayers";
type PlaceReveal = "categories";

function sourceGroupsForPane(pane: Pane | null): readonly MapLayerGroup[] {
  switch (pane) {
    case "what":
    case "where":
    case "discover":
      return ["context"];
    case "amenities":
      return ["amenities", "context"];
    case "when":
      return ["events"];
    case "layers":
      return ["transit", "parking"];
    case "conditions":
      return ["signals", "roads"];
    case "localLayers":
      return ["outdoors", "boundaries"];
    default:
      return [];
  }
}

/** Where the camera is pointed, per the user's own choice in the Where
 *  pane. Camera moves only — Where NEVER filters what's on the map. */
type WhereSel =
  | { kind: "county" }
  | { kind: "nearme" }
  | { kind: "town"; slug: string; name: string };

const TOWN_ZOOM = 13.4;
const SEARCH_RESULTS_ID = "map-search-results";
const SEARCH_FEEDBACK_ID = "map-search-feedback";

function searchOptionId(index: number): string {
  return `map-search-option-${index}`;
}

function whereSelectionForScope(
  nextScope: Scope | null,
): WhereSel {
  if (nextScope === "nearme") {
    return { kind: "nearme" };
  }
  const slug = scopeTownSlug(nextScope);
  const town = slug ? MUNICIPALITIES.find((m) => m.slug === slug) : null;
  return town
    ? { kind: "town", slug: town.slug, name: town.name }
    : { kind: "county" };
}

/**
 * MapDock — the calm control surface for /map. Search and Browse are the
 * primary cold controls. A deliberate Browse tap reveals the deeper choices,
 * including live buses, in a compact tray or desktop inspector while the map
 * remains visible.
 *
 *   - Places and amenities are stable catalogs, never reordered predictions.
 *   - Events remain absent until a person chooses a time.
 *   - Towns move the camera; an explicit Near me choice uses the one-mile Radius.
 *   - Layers and source-backed connections live behind Browse.
 *
 * State split:
 *   - URL params (?intent/?sub/?open/?t) are written here via
 *     router.replace and interpreted by BrowseMapClient.
 *   - Layer toggles / lenses / scrub hour stay owned by AppMap (they
 *     persist via mapLayerPrefs and ?layers exactly as before); the
 *     dock is a presentational surface over their setters.
 *   - Where is dock-local: it only ever moves the camera.
 */
export type MapDockProps = {
  browse: BrowseDockInfo;

  /** What's actually drawn (drives the living count line). */
  placeCount: number;
  eventCount: number;
  closingSoonCount: number;
  /** Keyboard/screen-reader alternative to hunting points in the WebGL canvas. */
  placesInView: readonly MapPinPlace[];
  placesInViewOrigin: LngLat | null;
  selectedPlaceSlug?: string | null;
  onPickPlaceInView: (place: MapPinPlace) => void;

  // ── Search, folded into the dock's top row (the map's ONE search). ──
  q: string;
  setQ: SetState<string>;
  searchMatches: SearchResult[];
  searchPending: boolean;
  searchUnavailable: boolean;
  retrySearch: () => void;
  searchOpeningId: string | null;
  pickSearch: (r: SearchResult) => void;
  /** Honest origin attached to map-search distances. */
  searchDistanceOriginLabel: "from you" | "from map center";

  /** Hook point for the server-side verified-hours coverage gate. */
  openNowAvailable?: boolean;
  openNowUnavailableLabel?: string;

  // ── Layers pane: lenses + overlays ──
  savedCount: number;
  showSavedOnly: boolean;
  setShowSavedOnly: SetState<boolean>;
  fieldNotesCount: number;
  fieldNotesOnly: boolean;
  setFieldNotesOnly: SetState<boolean>;

  amenityCount: number;
  /** Current points per public-amenity group. Zero-count choices stay out of
   * the picker instead of opening a selected layer with nothing on the map. */
  amenityGroupCounts: Record<string, number>;
  communityReportCount: number;
  amenityGroups: Set<string>;
  setAmenityGroups: SetState<Set<string>>;
  focusNearestAmenity?: (groupKey: string) => void;

  civicAvailable: boolean;
  showCivic: boolean;
  setShowCivic: SetState<boolean>;
  transitHealth: LiveLayerHealth;
  showTransit: boolean;
  setShowTransit: SetState<boolean>;
  /** Current vehicle-feed state while Transit is visible. Kept separate from
   * the static route health so the interface never calls a route line live. */
  liveBusSnapshot: LiveBusLayerSnapshot | null;
  /** Provider-published service bulletins. Empty is not presented as a
   * blanket promise that the network is running normally. */
  transitAlertSnapshot: TransitAlertSnapshot | null;
  trailCount: number;
  showTrails: boolean;
  setShowTrails: SetState<boolean>;
  aerialCount: number;
  showAerial: boolean;
  setShowAerial: SetState<boolean>;
  aerialSeasons: ReadonlyArray<{ key: string; label: string; color: string; count: number }>;
  aerialSeason: string;
  onAerialSeason: (key: string) => void;
  cemeteryCount: number;
  showCemeteries: boolean;
  setShowCemeteries: SetState<boolean>;
  parkingCount: number;
  /** The browse map can request currently-unloaded provider layers on tap.
   * Keeps the controls discoverable without prefetching every provider. */
  providerLayersAvailable?: boolean;
  /** Provider health attached to deferred data. A missing provider must not
   * be presented as proof that Frederick has no matching features. */
  mapLayerSourceHealth?: Partial<
    Record<MapLayerGroup, MapLayerSourceHealth>
  >;
  retryMapLayerGroups?: (groups: readonly MapLayerGroup[]) => void;
  showParking: boolean;
  setShowParking: SetState<boolean>;
  showRadar: boolean;
  setShowRadar: SetState<boolean>;
  radarHealth: LiveLayerHealth;
  /** One task-level roads mode: official roadwork and County context plus
   *  Radius's privacy-filtered public incident view. `roadsNowActive` keeps an existing
   *  individual/deep-linked layer visible in the summary, while
   *  `roadsNowFullyOn` prevents the master control from erasing a mixed state
   *  on its first tap. */
  roadsNowActive: boolean;
  roadsNowFullyOn: boolean;
  setShowRoadsNow: (show: boolean) => void;
  showTraffic: boolean;
  setShowTraffic: SetState<boolean>;
  /** Static County high-water/reference features attached to Roads now. */
  floodContextCount: number;
  /** County SnowCommand routes with a report from the current 12-hour window. */
  snowRouteCount: number;
  /** Newest radar frame's unix seconds — stamps "radar as of 9:42 PM" so
   *  minutes-old tiles are never mistaken for real time. */
  radarFrameEpoch: number | null;
  showIncidents: boolean;
  setShowIncidents: SetState<boolean>;
  incidentHealth: LiveLayerHealth;
  showRotorcraft: boolean;
  setShowRotorcraft: SetState<boolean>;
  showCameras: boolean;
  setShowCameras: SetState<boolean>;
  cameraHealth: LiveLayerHealth;
  activeOverlays: OverlayKey[];
  toggleOverlay: (k: OverlayKey) => void;

  // ── When pane ──
  scrubHour: number | null;
  setScrubHour: (h: number | null) => void;

  // ── Where pane ──
  userLoc: LngLat | null;
  showLocationIntro: boolean;
  dismissLocationIntro: () => void;
  locating: boolean;
  geoMsg: string | null;
  goNearMe: () => void;
  flyTo: (center: [number, number], zoom: number) => void;
  fitCounty: () => void;
  /** Camera read directly from Mapbox at share time. The address bar may
   * still hold the last committed result area while a person is panning. */
  shareCameraParam: () => string | null;

  // ── Highlights: evidence-backed connections already in the viewport. ──
  discoveries: MapDiscovery[];
  selectedDiscoveryId: string | null;
  onSelectDiscovery: (id: string) => void;

  /** Lets AppMap dim the map chrome + mark the host while a pane is open. */
  onPaneOpenChange: (open: boolean) => void;

  /** A selected result, unsettled viewport, or cold map owns the upper HUD. */
  suppressContextRail?: boolean;

  /** Layers the smart default switched on by itself (map program phase 1).
   *  They look like refinements to the counter below but nobody chose them,
   *  so they must not be treated as evidence that the visitor has started
   *  filtering. Goes to zero once the suggestion is dismissed, because from
   *  then on any layer still lit is one the visitor decided to keep. */
  smartSeededLayerCount?: number;

  /** Task-shaped map views. Scenes compose existing layers and evidence; the
   * dock only presents and activates the resolved plans. */
  radiusScenes: readonly ResolvedRadiusScene[];
  activeRadiusSceneId: RadiusSceneId | null;
  onRadiusScene: (id: RadiusSceneId) => void;
  onExitRadiusScene: () => void;
};

/** A dock chip: color-dotted pill with an optional mono count. ≥44px
 *  effective target via the vertical extender (rows are horizontal). */
function Chip({
  on,
  color,
  inkOnFill = false,
  title,
  onClick,
  children,
  count,
}: {
  on: boolean;
  color?: string;
  /** Gold-family fills need ink text, not white (AA). */
  inkOnFill?: boolean;
  title?: string;
  onClick: () => void;
  children: ReactNode;
  count?: number | null;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      aria-pressed={on}
      className="dock-chip tap-44-y"
      data-on={on || undefined}
      data-ink={inkOnFill || undefined}
      style={{ "--c": color } as React.CSSProperties}
    >
      {color && <span aria-hidden className="dock-chip-dot" />}
      {children}
      {typeof count === "number" && (
        <span className="dock-chip-n">{count.toLocaleString("en-US")}</span>
      )}
    </button>
  );
}

/** The one nested-row pattern (running head): sub-intents, amenity
 *  kinds, and aerial seasons all use it, so "a chip opened a row of
 *  words" reads the same everywhere. */
function HeadRow({
  color,
  ariaLabel,
  items,
  onPick,
}: {
  color: string;
  ariaLabel: string;
  items: ReadonlyArray<{
    key: string;
    label: string;
    count?: number;
    on: boolean;
  }>;
  onPick: (key: string) => void;
}) {
  return (
    <div className="dock-subrow" role="group" aria-label={ariaLabel} style={{ "--c": color } as React.CSSProperties}>
      {items.map((it) => (
        <button
          key={it.key}
          type="button"
          onClick={() => onPick(it.key)}
          aria-pressed={it.on}
          data-on={it.on || undefined}
        >
          {it.label}
          {typeof it.count === "number" && <span className="dock-chip-n">{it.count}</span>}
        </button>
      ))}
    </div>
  );
}

function Sect({ children }: { children: ReactNode }) {
  return <div className="dock-sect">{children}</div>;
}

const SCENE_ICONS: Record<RadiusSceneId, LucideIcon> = {
  "buses-now": BusFront,
  "roads-now": Construction,
  "outside-now": Trees,
  "what-changed": History,
  "within-15-minutes": TimerReset,
};

function formatLayerUpdate(timestamp: string | null): string | null {
  if (!timestamp) return null;
  const parsed = new Date(timestamp);
  if (!Number.isFinite(parsed.getTime())) return null;
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(parsed);
}

export default function MapDock(props: MapDockProps) {
  const { dismissLocationIntro, showLocationIntro } = props;
  const { browse, onPaneOpenChange } = props;
  const publicAmenityGroups = PUBLIC_AMENITY_GROUPS.filter(
    (group) => (props.amenityGroupCounts[group.key] ?? 0) > 0,
  );
  const router = useRouter();
  const sp = useSearchParams();
  const locationOfferVisible =
    showLocationIntro && shouldOfferMapLocationForUrl(sp);
  const initialScope = parseScope(sp.get(SCOPE_PARAM)) ?? getScope() ?? "county";

  const [pane, setPane] = useState<Pane | null>(null);
  const [placeReveal, setPlaceReveal] = useState<PlaceReveal | null>(null);
  const [essentialsQuick, setEssentialsQuick] = useState(false);
  const [searchPanelOpen, setSearchPanelOpen] = useState(false);
  const [searchKeyboardOpen, setSearchKeyboardOpen] = useState(false);
  const [searchSelection, setSearchSelection] = useState({
    query: props.q,
    index: -1,
  });
  const [searchResultLimit, setSearchResultLimit] = useState<3 | 4>(4);
  const [shareStatus, setShareStatus] = useState<"idle" | "copied">("idle");
  const [whereSel, setWhereSel] = useState<WhereSel>(() =>
    whereSelectionForScope(initialScope),
  );
  const [nearMeRequested, setNearMeRequested] = useState(
    initialScope === "nearme",
  );
  // Focus management for the disclosure panel: focus lands inside it when it
  // opens, and the Browse trigger is restored when it closes.
  const paneRef = useRef<HTMLDivElement>(null);
  const paneScrollRef = useRef<HTMLDivElement>(null);
  const dockRef = useRef<HTMLDivElement>(null);
  const optionsButtonRef = useRef<HTMLButtonElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const searchWrapRef = useRef<HTMLDivElement>(null);
  const restoreRef = useRef<HTMLElement | null>(null);
  const searchUrlTimerRef = useRef<number | null>(null);
  const pendingSearchUrlValueRef = useRef(props.q);
  const scopeActionsRef = useRef({
    userLoc: props.userLoc,
    goNearMe: props.goNearMe,
    flyTo: props.flyTo,
    fitCounty: props.fitCounty,
  });

  useEffect(() => {
    scopeActionsRef.current = {
      userLoc: props.userLoc,
      goNearMe: props.goNearMe,
      flyTo: props.flyTo,
      fitCounty: props.fitCounty,
    };
  }, [props.fitCounty, props.flyTo, props.goNearMe, props.userLoc]);

  const closeSearchPanel = useCallback(() => {
    setSearchPanelOpen(false);
    setSearchSelection({ query: "", index: -1 });
  }, []);

  const clearPaneState = useCallback(() => {
    setPane(null);
    setPlaceReveal(null);
    setEssentialsQuick(false);
    closeSearchPanel();
  }, [closeSearchPanel, setEssentialsQuick, setPane, setPlaceReveal]);

  const closePane = useCallback(() => {
    const restoreTarget = restoreRef.current;
    if (showLocationIntro) dismissLocationIntro();
    clearPaneState();
    // The trigger stays inert until React commits the closed state. Restore
    // focus on the following frame so browsers do not discard the focus call.
    window.requestAnimationFrame(() => restoreTarget?.focus?.());
  }, [
    clearPaneState,
    dismissLocationIntro,
    showLocationIntro,
  ]);

  // Size the one explicit control sheet against the map canvas. On a phone it
  // may use a little more than half the map while it is being operated; the
  // closed state is one compact bar and touching the exposed map dismisses it.
  useEffect(() => {
    const dockElement = dockRef.current;
    const host = dockElement?.closest<HTMLElement>(".dock-host");
    if (!dockElement || !host) return;

    const sizePane = () => {
      const mapHeight = host.getBoundingClientRect().height;
      const available = Math.max(148, mapHeight - 96);
      const minimum = mapHeight < 320 ? 148 : 280;
      // 0.62 left only ~196px of clean map at 375x812 — configuring the map
      // hid the map, which is the thing being configured (mobile audit
      // 2026-08-18). At 0.52 the canvas keeps its majority and every pane
      // still scrolls to its full content; short panes are unaffected either
      // way, since this is a max-height and they already fit to content.
      const cap = Math.min(available, Math.max(minimum, Math.floor(mapHeight * 0.52)));
      dockElement.style.setProperty("--map-pane-cap", `${cap}px`);
    };
    sizePane();
    const observer = new ResizeObserver(sizePane);
    observer.observe(host);
    return () => observer.disconnect();
  }, []);

  // Keep the thumb-positioned search stable through the initiating tap. Move
  // it to the top shelf only after the visual viewport confirms that a
  // software keyboard actually reduced the usable screen.
  useEffect(() => {
    const viewport = window.visualViewport;
    if (!viewport) return;
    let baselineHeight = viewport.height;
    const updateKeyboardState = () => {
      const searchFocused =
        searchWrapRef.current?.contains(document.activeElement) ?? false;
      if (!searchFocused) {
        baselineHeight = Math.max(baselineHeight, viewport.height);
        setSearchKeyboardOpen(false);
        return;
      }
      setSearchKeyboardOpen(baselineHeight - viewport.height > 120);
    };
    viewport.addEventListener("resize", updateKeyboardState);
    viewport.addEventListener("scroll", updateKeyboardState);
    window.addEventListener("orientationchange", updateKeyboardState);
    return () => {
      viewport.removeEventListener("resize", updateKeyboardState);
      viewport.removeEventListener("scroll", updateKeyboardState);
      window.removeEventListener("orientationchange", updateKeyboardState);
    };
  }, []);

  useEffect(() => {
    const updateLimit = () => {
      setSearchResultLimit(mapSearchResultLimit(window.innerWidth));
    };
    updateLimit();
    window.addEventListener("resize", updateLimit, { passive: true });
    window.addEventListener("orientationchange", updateLimit, { passive: true });
    return () => {
      window.removeEventListener("resize", updateLimit);
      window.removeEventListener("orientationchange", updateLimit);
    };
  }, []);

  // Keep later scope changes in sync with the camera and readout. The explicit
  // URL scope already seeds local state above; this subscription handles
  // changes made elsewhere in the app without capturing first-render actions.
  useEffect(() => {
    return subscribeScopeChange((nextScope) => {
      const actions = scopeActionsRef.current;
      setNearMeRequested(nextScope === "nearme");
      setWhereSel(whereSelectionForScope(nextScope));
      if (nextScope === "nearme") {
        // The shared header owns its own explicit permission request. If a fix
        // already exists, recenter immediately; otherwise useMapLocation will
        // fit the map when that one shared request lands.
        if (actions.userLoc) actions.goNearMe();
        return;
      }
      const slug = scopeTownSlug(nextScope);
      const town = slug ? MUNICIPALITIES.find((m) => m.slug === slug) : null;
      if (town) actions.flyTo([town.centroid.lng, town.centroid.lat], TOWN_ZOOM);
      else actions.fitCounty();
    });
  }, []);

  const searchOverlayOpen =
    pane === null && searchPanelOpen && props.q.trim().length >= 2;

  useEffect(() => {
    // AppMap owns the other bottom surfaces (selected results, map tools, and
    // the result-area action). Treat search results and Browse as one shared
    // control layer so only one bottom overlay can be active at a time.
    onPaneOpenChange(pane !== null || searchOverlayOpen);
  }, [onPaneOpenChange, pane, searchOverlayOpen]);
  // A panel should never make the map feel captured. Touching the uncovered
  // canvas dismisses the panel before the pan continues; there is no scrim or
  // separate close step between the person and the map.
  useEffect(() => {
    const dismissForMapGesture = () => {
      // Do this synchronously, before the state update makes the focused pane
      // hidden/inert. A map gesture owns focus now; unlike Done or Escape it
      // must not bounce focus back to the Browse trigger on the next frame.
      focusMapBeforeDockDismiss(dockRef.current);
      if (showLocationIntro) dismissLocationIntro();
      clearPaneState();
    };
    window.addEventListener("fr:map-gesture", dismissForMapGesture);
    return () => window.removeEventListener("fr:map-gesture", dismissForMapGesture);
  }, [clearPaneState, dismissLocationIntro, showLocationIntro]);
  useEffect(() => {
    if (!searchPanelOpen) return;
    const dismissSearchOutside = (event: PointerEvent | WheelEvent) => {
      const target = event.target;
      // The Browse button belongs to the same command instrument. Let its
      // own click close search and open the sheet; closing during capture
      // would move the bottom dock before the click lands on touch devices.
      if (target instanceof Node && dockRef.current?.contains(target)) return;
      closeSearchPanel();
    };
    document.addEventListener("pointerdown", dismissSearchOutside, true);
    document.addEventListener("wheel", dismissSearchOutside, true);
    return () => {
      document.removeEventListener("pointerdown", dismissSearchOutside, true);
      document.removeEventListener("wheel", dismissSearchOutside, true);
    };
  }, [closeSearchPanel, searchPanelOpen]);
  useEffect(() => {
    if (pane === null) return;
    if (paneScrollRef.current) paneScrollRef.current.scrollTop = 0;
    window.requestAnimationFrame(() => paneRef.current?.focus());
  }, [pane]);

  useEffect(() => {
    if (pane === null) return;
    const closeFromAnywhere = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopPropagation();
      closePane();
    };
    window.addEventListener("keydown", closeFromAnywhere, true);
    return () => window.removeEventListener("keydown", closeFromAnywhere, true);
  }, [closePane, pane]);

  useEffect(() => {
    const focusMapSearch = () => {
      consumeFindRequest("map");
      // A person who deliberately starts a search has already chosen their
      // task. Retire the first-use location offer before it can arrive late
      // from the asynchronous permission check and interrupt that task.
      dismissLocationIntro();
      setPane(null);
      setPlaceReveal(null);
      setSearchSelection({ query: "", index: -1 });
      setSearchPanelOpen(true);
      if (window.location.hash === "#map-search-input") {
        const url = new URL(window.location.href);
        url.hash = "";
        window.history.replaceState({}, "", url);
      }
      window.requestAnimationFrame(() => {
        searchInputRef.current?.focus();
        searchInputRef.current?.select();
      });
    };
    const focusMapSearchHash = () => {
      if (window.location.hash === "#map-search-input") focusMapSearch();
    };
    window.addEventListener("fr:focus-map-search", focusMapSearch);
    window.addEventListener("hashchange", focusMapSearchHash);
    if (consumeFindRequest("map") || window.location.hash === "#map-search-input") {
      window.requestAnimationFrame(focusMapSearch);
    }
    return () => {
      window.removeEventListener("fr:focus-map-search", focusMapSearch);
      window.removeEventListener("hashchange", focusMapSearchHash);
    };
  }, [dismissLocationIntro]);

  // The location dot is more useful as an immediate need control than as a
  // passive marker. AppMap dispatches this event from the dot's 44px target;
  // the same Nearby essentials pane then owns the choices, counts, and focus
  // behavior instead of introducing another map menu.
  useEffect(() => {
    const openEssentialsFromLocation = () => {
      const active = document.activeElement;
      restoreRef.current = active instanceof HTMLElement
        ? active
        : optionsButtonRef.current;
      closeSearchPanel();
      setPlaceReveal(null);
      setEssentialsQuick(true);
      setPane("amenities");
      track("map_dock", { pane: "amenities", pick: "location-dot" });
    };
    window.addEventListener(
      "fr:open-map-essentials",
      openEssentialsFromLocation,
    );
    return () =>
      window.removeEventListener(
        "fr:open-map-essentials",
        openEssentialsFromLocation,
      );
  }, [closeSearchPanel]);

  // URL state written by the map is more current than this component's last
  // render. Mutate the live address bar so a time/category tap cannot drop a
  // camera, layer, selection, or typed query that landed a moment earlier.
  const setParams = (mutate: (q: URLSearchParams) => void) => {
    replaceMapUrl(mutate);
  };

  const persistMapSearchUrl = useCallback((value: string) => {
    try {
      const url = new URL(window.location.href);
      const trimmed = value.trim();
      if (trimmed) url.searchParams.set("q", trimmed);
      else url.searchParams.delete("q");
      window.history.replaceState(window.history.state, "", url.toString());
    } catch {
      // URL persistence is an enhancement; search itself still works.
    }
  }, []);

  const flushMapSearchUrl = useCallback(() => {
    if (searchUrlTimerRef.current !== null) {
      window.clearTimeout(searchUrlTimerRef.current);
      searchUrlTimerRef.current = null;
    }
    persistMapSearchUrl(pendingSearchUrlValueRef.current);
  }, [persistMapSearchUrl]);

  useEffect(() => {
    // AppMap clears or restores the query after a result selection. Cancel a
    // pending typed write so an older value cannot reappear in the address bar.
    if (props.q === pendingSearchUrlValueRef.current) return;
    pendingSearchUrlValueRef.current = props.q;
    flushMapSearchUrl();
  }, [flushMapSearchUrl, props.q]);

  useEffect(
    () => () => {
      if (searchUrlTimerRef.current !== null) {
        window.clearTimeout(searchUrlTimerRef.current);
        searchUrlTimerRef.current = null;
      }
    },
    [],
  );

  /** Keep local typing immediate while debouncing its shareable URL. Writing
   * native history for every character wakes every `useSearchParams` reader,
   * including the county-wide filtering work behind the map. */
  const updateMapSearch = (value: string) => {
    props.setQ(value);
    setSearchSelection({ query: value, index: -1 });
    pendingSearchUrlValueRef.current = value;
    if (searchUrlTimerRef.current !== null) {
      window.clearTimeout(searchUrlTimerRef.current);
      searchUrlTimerRef.current = null;
    }
    if (!value.trim()) {
      persistMapSearchUrl("");
      return;
    }
    searchUrlTimerRef.current = window.setTimeout(() => {
      searchUrlTimerRef.current = null;
      persistMapSearchUrl(pendingSearchUrlValueRef.current);
    }, 240);
  };

  /** Clear shareable layer state synchronously before React state changes.
   * AppMap mirrors GIS overlays into the current URL in an effect. Without
   * this first write, that effect can read the old address while Next's
   * router.replace is still settling and resurrect amenity/show on reload. */
  const clearLayerParamsImmediately = () => {
    const url = new URL(window.location.href);
    url.searchParams.delete("amenity");
    url.searchParams.delete("show");
    url.searchParams.delete("layers");
    url.searchParams.delete("scene");
    window.history.replaceState(window.history.state, "", url.toString());
  };

  const pickIntent = (key: string | null) => {
    haptic("light");
    props.onExitRadiusScene();
    track("map_dock", { pane: "what", pick: key ?? "everything" });
    setParams((q) => {
      q.delete("sub");
      if (key && browse.intentKey !== key) q.set("intent", key);
      else q.delete("intent");
    });
    closePane();
  };
  const pickSub = (key: string | null) => {
    haptic("light");
    props.onExitRadiusScene();
    setParams((q) => {
      if (key && browse.subKey !== key) q.set("sub", key);
      else q.delete("sub");
    });
    closePane();
  };
  const toggleOpenNow = () => {
    if (props.openNowAvailable === false) return;
    haptic("light");
    props.onExitRadiusScene();
    track("map_dock", { pane: "when", pick: browse.openNow ? "open-off" : "open-now" });
    setParams((q) => {
      if (browse.openNow) q.delete("open");
      else q.set("open", "now");
    });
  };
  const toggleDealsToday = () => {
    haptic("light");
    props.onExitRadiusScene();
    track("map_dock", { pane: "when", pick: browse.dealsOn ? "deals-off" : "deals-today" });
    setParams((q) => {
      if (browse.dealsOn) q.delete("deals");
      else q.set("deals", "today");
    });
  };
  const toggleMusicTonight = () => {
    haptic("light");
    props.onExitRadiusScene();
    track("map_dock", { pane: "when", pick: browse.musicTonight ? "music-off" : "music-tonight" });
    setParams((q) => {
      if (browse.musicTonight) {
        q.delete("music");
      } else {
        q.delete("t");
        q.set("music", "tonight");
      }
    });
  };
  const pickWindow = (k: string) => {
    haptic("light");
    props.onExitRadiusScene();
    setParams((q) => {
      // A general event window and the narrower live-music lens are mutually
      // exclusive. Never leave a hidden `t` value waiting to reappear later.
      q.delete("music");
      // If a malformed/shared URL carried both filters, the music lens forced
      // the computed mode to Tonight even though `t` held another value. A
      // tap on Tonight is then a real switch, not a request to clear both.
      if (
        !browse.musicTonight &&
        browse.timeModeExplicit &&
        browse.timeMode === k
      ) {
        q.delete("t");
      } else {
        q.set("t", k);
      }
    });
  };

  // Where picks write to the global lens; the subscription above updates both
  // this readout and the camera, including changes made from the top-bar chip.
  const goTown = (slug: string, name: string) => {
    haptic("light");
    props.onExitRadiusScene();
    setNearMeRequested(false);
    setWhereSel({ kind: "town", slug, name });
    setScope(`town:${slug}`);
    setParams((q) => q.set(SCOPE_PARAM, slug));
  };
  const goCounty = () => {
    haptic("light");
    props.onExitRadiusScene();
    setNearMeRequested(false);
    setWhereSel({ kind: "county" });
    setScope("county");
    setParams((q) => q.delete(SCOPE_PARAM));
  };
  // Explicit near-me tap (not the automatic fix-landed relabel, which must
  // not clobber a chosen town scope on every map mount): set the lens, then
  // run the map's own locate.
  const pickNearMe = () => {
    props.onExitRadiusScene();
    setNearMeRequested(true);
    setWhereSel({ kind: "nearme" });
    props.goNearMe();
  };

  const applyNearbyOutcome = () => {
    haptic("light");
    track("map_dock", { pane: "contents", pick: "nearby" });
    props.onExitRadiusScene();
    clearMapLayersForOutcome();
    props.setScrubHour(null);
    setParams((params) => {
      for (const key of ["intent", "sub", "open", "deals", "music", "t", "scene"]) {
        params.delete(key);
      }
    });
    props.goNearMe();
    setPlaceReveal(null);
    setEssentialsQuick(false);
    setPane("what");
  };

  // A successful location update naturally re-renders this component. Derive
  // the truthful "Near me" readout from that new prop instead of repairing
  // local state during render or synchronously setting state in an effect.
  const activeWhereSel: WhereSel =
    nearMeRequested &&
    props.userLoc &&
    whereSel.kind === "county"
      ? { kind: "nearme" }
      : whereSel;

  // ── Derived caption state ──
  const intent = browse.intentKey ? INTENTS.find((i) => i.key === browse.intentKey) : undefined;
  const sub = intent?.subIntents?.find((s) => s.key === browse.subKey);
  const communityReportsOn = props.amenityGroups.has("community");
  const publicAmenityCount = [...props.amenityGroups].filter((key) => key !== "community").length;

  // Layer drapes, in a stable order (drapes first, then personal lenses) so
  // the Layers readout's lead word doesn't jump as toggles flip.
  const layerBits: string[] = [];
  if (publicAmenityCount > 0) layerBits.push("Amenities");
  if (communityReportsOn) layerBits.push("Community reports");
  if (props.roadsNowActive) layerBits.push("Roads now");
  if (props.showTransit) layerBits.push("Transit");
  if (props.showTrails) layerBits.push("Trails");
  if (props.showAerial) layerBits.push("Aerial photos");
  if (props.showCemeteries) layerBits.push("Cemeteries");
  if (props.showParking) layerBits.push("Parking");
  if (props.showRadar) layerBits.push("Radar");
  if (props.showRotorcraft) layerBits.push("Helicopter activity");
  if (props.showCameras) layerBits.push("Cameras");
  for (const k of props.activeOverlays) {
    const o = OVERLAYS.find((x) => x.key === k);
    if (o) layerBits.push(o.label);
  }
  const lensLabels: string[] = [];
  if (props.showSavedOnly) lensLabels.push("Saved");
  if (props.fieldNotesOnly) lensLabels.push("Field notes");

  const layerCount =
    props.amenityGroups.size +
    props.activeOverlays.length +
    (props.roadsNowActive ? 1 : 0) +
    (props.showTransit ? 1 : 0) +
    (props.showTrails ? 1 : 0) +
    (props.showAerial ? 1 : 0) +
    (props.showCemeteries ? 1 : 0) +
    (props.showParking ? 1 : 0) +
    (props.showRadar ? 1 : 0) +
    (props.showRotorcraft ? 1 : 0) +
    (props.showCameras ? 1 : 0);
  const visibleLayerCount = layerCount + lensLabels.length;

  // What = kinds of places only (no lens, no drapes any more).
  const what = whatCaption({
    intentLabel: intent?.label,
    subLabel: sub?.label,
    layerCount: 0,
  });
  const when = whenCaption({
    scrubHour: props.scrubHour,
    openNow: browse.openNow,
    dealsOn: browse.dealsOn,
    musicTonight: browse.musicTonight,
    // BrowseMapClient still computes the nearest useful event window so the
    // Events pane can offer it, but an inferred window is not visible state.
    timeMode: browse.timeModeExplicit || browse.musicTonight ? browse.timeMode : "all",
  });
  const whereText =
    activeWhereSel.kind === "county" ? "County"
    : activeWhereSel.kind === "nearme" ? "Near me"
    : activeWhereSel.name;
  // Layers = the drapes + the personal and fieldwork lenses, tallied for the
  // spoken summary.
  const layers = layersCaption([...layerBits, ...lensLabels]);

  const dirty = dockDirty({
    intentActive: Boolean(intent),
    openNow: browse.openNow,
    dealsOn: browse.dealsOn,
    musicTonight: browse.musicTonight,
    timeModeExplicit: browse.timeModeExplicit,
    scrubActive: props.scrubHour != null,
    lensActive: lensLabels.length > 0,
    layerCount,
    whereAway: activeWhereSel.kind !== "county",
  });

  const timeActive = browse.openNow || browse.dealsOn || browse.musicTonight
    || browse.timeModeExplicit || props.scrubHour != null;
  const activeRadiusScene = props.activeRadiusSceneId
    ? props.radiusScenes.find(
        (scene) => scene.definition.id === props.activeRadiusSceneId,
      ) ?? null
    : null;
  const firstAmenityLabel = [...props.amenityGroups]
    .map((key) => PUBLIC_AMENITY_GROUPS.find((group) => group.key === key)?.label)
    .find((label): label is string => Boolean(label));
  const firstAmenityKey = [...props.amenityGroups].find((key) => key !== "community");
  const firstAmenityCount = firstAmenityKey
    ? props.amenityGroupCounts[firstAmenityKey] ?? 0
    : 0;
  const contentsSummary = activeRadiusScene
    ? activeRadiusScene.definition.label
    : mapContentsSummary({
        area: whereText,
        amenity: firstAmenityLabel,
        intent: intent?.label,
        time: timeActive ? when.text : undefined,
        layer: layerBits[0] ?? lensLabels[0],
      });
  const activeSceneCaution =
    activeRadiusScene?.availability.status === "caution"
      ? activeRadiusScene.availability.reason
      : null;
  const activeContextDetail = activeSceneCaution
    ?? (firstAmenityLabel
      ? props.userLoc
        ? `${firstAmenityCount.toLocaleString("en-US")} mapped. The closest result opens first.`
        : `${firstAmenityCount.toLocaleString("en-US")} mapped. Use Near me for the closest result.`
      : null);
  const refinementCount =
    (intent ? 1 : 0) +
    (browse.openNow ? 1 : 0) +
    (browse.dealsOn ? 1 : 0) +
    (browse.musicTonight ? 1 : 0) +
    (browse.timeModeExplicit ? 1 : 0) +
    (props.scrubHour != null ? 1 : 0) +
    (activeWhereSel.kind !== "county" ? 1 : 0) +
    visibleLayerCount;
  const activeOptionCount =
    refinementCount +
    (props.selectedDiscoveryId ? 1 : 0) +
    (activeRadiusScene ? 1 : 0);
  // What the VISITOR has chosen, which is what decides whether the map is
  // still at rest. Subtracting the smart seeds matters because the two
  // features otherwise cancel: the smart default lights a layer on exactly
  // the clean arrival the resting state line is written for (parking on a
  // Friday evening, radar during an alert), so the line only ever appeared
  // on a quiet afternoon when the map had nothing to say.
  const chosenOptionCount = Math.max(
    0,
    activeOptionCount - (props.smartSeededLayerCount ?? 0),
  );

  const line = props.locating && nearMeRequested && !props.userLoc
    ? "Finding places near you…"
    : countLine({
        places: props.placeCount,
        events: props.eventCount,
        closingSoon: props.closingSoonCount,
        scrubHour: props.scrubHour,
      });

  const clearMapLayersForOutcome = () => {
    clearLayerParamsImmediately();
    props.setAmenityGroups(new Set());
    props.setShowCivic(false);
    props.setShowTransit(false);
    props.setShowTrails(false);
    props.setShowAerial(false);
    props.setShowCemeteries(false);
    props.setShowParking(false);
    props.setShowTraffic(false);
    props.setShowRadar(false);
    props.setShowRoadsNow(false);
    props.setShowIncidents(false);
    props.setShowRotorcraft(false);
    props.setShowCameras(false);
    props.setShowSavedOnly(false);
    props.setFieldNotesOnly(false);
    props.onAerialSeason("all");
    for (const key of [...props.activeOverlays]) props.toggleOverlay(key);
  };

  const clearAll = () => {
    haptic("light");
    track("map_dock", { pane: "clear", pick: "all" });
    updateMapSearch("");
    props.onExitRadiusScene();
    clearMapLayersForOutcome();
    props.setScrubHour(null);
    setNearMeRequested(false);
    setWhereSel({ kind: "county" });
    setScope("county");
    props.fitCounty();
    closePane();
    // Clear filters without throwing away the user's map/list presentation.
    // The deep focus target goes too, because the camera has just returned to
    // the whole county and a shared URL must reopen in that same state.
    setParams((q) => {
      for (const key of ["intent", "sub", "open", "deals", "music", "t", "amenity", "show", "layers", "scene", "at", "place", SCOPE_PARAM]) {
        q.delete(key);
      }
    });
  };

  const clearLayers = () => {
    haptic("light");
    track("map_dock", { pane: "layers", pick: "clear" });
    props.onExitRadiusScene();
    clearMapLayersForOutcome();
    setParams((q) => {
      q.delete("amenity");
      q.delete("show");
      q.delete("layers");
      q.delete("scene");
    });
  };

  const togglePane = (next: Pane) => {
    haptic("light");
    closeSearchPanel();
    if (pane === next) {
      closePane();
      return;
    }
    if (pane === null) restoreRef.current = optionsButtonRef.current;
    setPane(next);
  };
  const openContentsPane = (
    next: Exclude<Pane, "contents">,
    reveal: PlaceReveal | null = null,
  ) => {
    haptic("light");
    setPlaceReveal(reveal);
    setPane(next);
  };
  // This is a non-modal disclosure over the map. Escape closes it, while Tab
  // follows the ordinary page order instead of being trapped in a hybrid
  // pseudo-dialog.
  const onPaneKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      e.stopPropagation();
      closePane();
      e.preventDefault();
    }
  };

  // "Radar as of 9:42 PM" — the newest frame's Eastern clock time. Radar
  // tiles are minutes old; the stamp keeps the layer honest about it.
  const radarClock =
    props.showRadar && props.radarFrameEpoch != null
      ? new Intl.DateTimeFormat("en-US", {
          timeZone: "America/New_York",
          hour: "numeric",
          minute: "2-digit",
        }).format(new Date(props.radarFrameEpoch * 1000))
      : null;
  const radarUpdate = formatLayerUpdate(props.radarHealth.timestamp);
  const incidentUpdate = formatLayerUpdate(props.incidentHealth.timestamp);
  const cameraUpdate = formatLayerUpdate(props.cameraHealth.timestamp);
  const transitContextKicker = props.showTransit
    ? props.liveBusSnapshot?.status === "ready"
      ? `${props.liveBusSnapshot.count} ${props.liveBusSnapshot.count === 1 ? "bus" : "buses"} live · current`
      : props.liveBusSnapshot?.status === "degraded"
        ? `${props.liveBusSnapshot.count} ${props.liveBusSnapshot.count === 1 ? "bus" : "buses"} live · arrivals limited`
      : props.liveBusSnapshot?.status === "stale"
        ? "Bus feed delayed"
        : props.liveBusSnapshot?.status === "empty"
          ? "No buses reporting"
          : props.liveBusSnapshot?.status === "error"
            ? "Live positions unavailable"
            : "Checking live buses"
    : null;
  const activeContextKicker = transitContextKicker
    ?? (activeRadiusScene
    ? "Radius view"
    : props.showRadar
      ? radarClock
        ? `Radar · updated ${radarClock}`
        : "Radar · loading"
      : "Map view");

  const paneTitle =
    pane === "contents" ? "Choose what to see"
    : pane === "amenities" ? "Nearby essentials"
    : pane === "what"
      ? "Find nearby"
    : pane === "when" ? "Today & tonight"
    : pane === "where" ? "Choose an area"
    : pane === "discover" ? "Highlights"
    : pane === "layers" ? "Get around"
    : pane === "conditions" ? "Conditions"
    : pane === "localLayers" ? "More map details"
    : "";
  const isLayerPane = pane === "layers" || pane === "conditions" || pane === "localLayers";

  const liveBusPositionLine =
    props.liveBusSnapshot?.status === "ready" ||
    props.liveBusSnapshot?.status === "degraded"
      ? `${props.liveBusSnapshot.count} ${props.liveBusSnapshot.count === 1 ? "bus" : "buses"} reporting now`
      : props.liveBusSnapshot?.status === "stale"
        ? "Bus positions are delayed"
        : props.liveBusSnapshot?.status === "empty"
          ? "No buses reporting right now"
          : props.liveBusSnapshot?.status === "error"
            ? "Live bus positions are unavailable"
            : "Checking live buses";
  const liveBusLine =
    props.transitAlertSnapshot?.status === "ready" &&
    props.transitAlertSnapshot.count > 0
      ? `${liveBusPositionLine} · ${props.transitAlertSnapshot.count} service ${props.transitAlertSnapshot.count === 1 ? "bulletin" : "bulletins"}`
      : liveBusPositionLine;
  const whatChangedScene = props.radiusScenes.find(
    (scene) => scene.definition.id === "what-changed",
  );
  const whatChangedUnavailable =
    whatChangedScene?.availability.status === "unavailable" &&
    !whatChangedScene.availability.canActivate;

  const togglePlaceReveal = (next: PlaceReveal) => {
    setPlaceReveal((current) => (current === next ? null : next));
  };

  const toggleAmenity = (key: string) => {
    props.onExitRadiusScene();
    props.setAmenityGroups((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const pickSingleAmenity = (key: string) => {
    haptic("light");
    props.onExitRadiusScene();
    const isOnlyActive =
      props.amenityGroups.size === 1 && props.amenityGroups.has(key);
    props.setAmenityGroups(isOnlyActive ? new Set() : new Set([key]));
    closePane();
    if (!isOnlyActive) props.focusNearestAmenity?.(key);
  };

  const shareCurrentView = async () => {
    const shareUrl = new URL(window.location.href);
    const camera = props.shareCameraParam();
    if (camera) shareUrl.searchParams.set("c", camera);
    // An explicit empty layer state is still meaningful. Without this marker,
    // a recipient's saved device preferences could add layers the sender never
    // chose and make the shared map look different.
    if (!shareUrl.searchParams.has("show")) {
      shareUrl.searchParams.set("show", "none");
    }
    const url = shareUrl.toString();
    haptic("light");
    track("map_share", { surface: "contents" });
    try {
      if (navigator.share) {
        await navigator.share({
          title: "Frederick Radius map",
          text: "Open this Frederick County map view.",
          url,
        });
      } else {
        await navigator.clipboard.writeText(url);
        setShareStatus("copied");
        window.setTimeout(() => setShareStatus("idle"), 2200);
      }
    } catch (error) {
      if ((error as { name?: string })?.name === "AbortError") return;
      try {
        await navigator.clipboard.writeText(url);
        setShareStatus("copied");
        window.setTimeout(() => setShareStatus("idle"), 2200);
      } catch {
        // Sharing is an enhancement. Leave the map untouched if both browser
        // share and clipboard APIs are unavailable.
      }
    }
  };

  const sceneButton = (id: RadiusSceneId) => {
    const scene = props.radiusScenes.find(
      (candidate) => candidate.definition.id === id,
    );
    if (!scene) return null;
    const Icon = SCENE_ICONS[id];
    const active = props.activeRadiusSceneId === id;
    const unavailable =
      scene.availability.status === "unavailable" &&
      !scene.availability.canActivate;
    return (
      <button
        key={id}
        type="button"
        className="dock-scene"
        data-on={active || undefined}
        data-status={scene.availability.status}
        aria-pressed={active}
        disabled={unavailable}
        aria-label={`${scene.definition.label}. ${scene.availability.reason}`}
        title={scene.availability.reason}
        onClick={() => {
          if (active) props.onExitRadiusScene();
          else props.onRadiusScene(id);
          closePane();
        }}
      >
        <span className="dock-scene-icon" aria-hidden>
          <Icon className="h-[17px] w-[17px]" strokeWidth={2.15} />
        </span>
        <span className="dock-scene-copy">
          <strong>{scene.definition.label}</strong>
          <small>{radiusSceneStatusLabel(scene)}</small>
        </span>
      </button>
    );
  };

  const visibleSearchMatches = props.searchMatches.slice(0, searchResultLimit);
  const searchResultsVisible =
    pane === null &&
    searchPanelOpen &&
    props.q.trim().length >= 2 &&
    !props.searchPending &&
    visibleSearchMatches.length > 0;
  const searchLoadingVisible =
    pane === null &&
    searchPanelOpen &&
    props.q.trim().length >= 2 &&
    !props.searchUnavailable &&
    props.searchPending &&
    visibleSearchMatches.length === 0;
  const searchUnavailableVisible =
    pane === null &&
    searchPanelOpen &&
    props.q.trim().length >= 2 &&
    props.searchUnavailable &&
    visibleSearchMatches.length === 0;
  const searchEmptyVisible =
    pane === null &&
    searchPanelOpen &&
    props.q.trim().length >= 2 &&
    !props.searchUnavailable &&
    !props.searchPending &&
    visibleSearchMatches.length === 0;
  const visibleTimeWindows = TIME_WINDOWS.filter(
    (window) =>
      props.providerLayersAvailable ||
      (browse.eventWindowCounts[window.key] ?? 0) > 0 ||
      (browse.timeModeExplicit && browse.timeMode === window.key) ||
      (browse.musicTonight && window.key === "tonight"),
  );
  const showLiveMusic =
    props.providerLayersAvailable ||
    browse.musicTonight ||
    browse.musicTonightCount > 0;
  const showDeals = browse.dealsOn || browse.dealsTodayCount > 0;
  const hasEventChoices = visibleTimeWindows.length > 0 || showLiveMusic;
  const activeSearchIndex =
    searchSelection.query === props.q &&
    searchSelection.index >= 0 &&
    searchSelection.index < visibleSearchMatches.length
      ? searchSelection.index
      : -1;
  const activeSearchResult =
    activeSearchIndex >= 0
      ? visibleSearchMatches[activeSearchIndex]
      : undefined;
  const paneSourceGroups = sourceGroupsForPane(pane);
  const degradedPaneSourceGroups = paneSourceGroups.filter((group) => {
    const health = props.mapLayerSourceHealth?.[group];
    return health && health.status !== "current";
  });
  const paneSourceLabels = [
    ...new Set(
      degradedPaneSourceGroups.flatMap(
        (group) => props.mapLayerSourceHealth?.[group]?.unavailable ?? [],
      ),
    ),
  ];
  const paneSourcesUnavailable =
    degradedPaneSourceGroups.length > 0 &&
    degradedPaneSourceGroups.every(
      (group) =>
        props.mapLayerSourceHealth?.[group]?.status === "unavailable",
    );

  const chooseSearchResult = (result: SearchResult) => {
    flushMapSearchUrl();
    setSearchSelection({ query: "", index: -1 });
    if (!result.temporary) closeSearchPanel();
    props.pickSearch(result);
    // Pointer selection deliberately keeps focus on the combobox while the
    // list is open. Once a local result has been chosen, release that focus so
    // the map's active-state readout is visible and the mobile dock returns to
    // its thumb position. Result cards manage their own focus after mounting.
    if (!result.temporary) searchInputRef.current?.blur();
  };

  const moveSearchSelection = (direction: 1 | -1) => {
    if (
      props.q.trim().length < 2 ||
      props.searchPending ||
      visibleSearchMatches.length === 0
    ) {
      return;
    }
    setSearchPanelOpen(true);
    setSearchSelection((current) => {
      const currentIndex =
        current.query === props.q ? current.index : -1;
      if (currentIndex < 0 || currentIndex >= visibleSearchMatches.length) {
        return {
          query: props.q,
          index: direction === 1 ? 0 : visibleSearchMatches.length - 1,
        };
      }
      return {
        query: props.q,
        index:
          (currentIndex + direction + visibleSearchMatches.length) %
          visibleSearchMatches.length,
      };
    });
  };

  return (
    <>
      {chosenOptionCount > 0 &&
        pane === null &&
        !searchPanelOpen &&
        !searchKeyboardOpen &&
        !props.suppressContextRail && (
          <div
            className="map-context-rail"
            role="group"
            aria-label="Current map view"
            data-map-context-rail
            data-map-top-surface="context"
            data-scene-caution={activeSceneCaution ? "true" : undefined}
            data-live-transit={props.showTransit ? "true" : undefined}
          >
            <span
              className="sr-only"
              role="status"
              aria-live="polite"
              aria-atomic="true"
            >
              {`${activeContextKicker}: ${contentsSummary}`}
            </span>
            <div
              className="map-context-rail-open"
              role="status"
              aria-live="polite"
              style={{
                gridTemplateColumns: "30px minmax(0, 1fr)",
                cursor: "default",
              }}
              aria-label={`Current map view: ${contentsSummary}${activeContextDetail ? `. ${activeContextDetail}` : ""}`}
            >
              <span className="map-context-rail-icon" aria-hidden>
                {props.showTransit ? (
                  <BusFront className="h-3.5 w-3.5" strokeWidth={2.2} />
                ) : (
                  <Layers3 className="h-3.5 w-3.5" strokeWidth={2.2} />
                )}
              </span>
              <span className="map-context-rail-copy">
                <span className="map-context-rail-kicker">{activeContextKicker}</span>
                <span className="map-context-rail-summary">{contentsSummary}</span>
                {activeContextDetail && (
                  <span className="map-context-rail-detail">
                    {activeContextDetail}
                  </span>
                )}
              </span>
            </div>
            <button
              type="button"
              className="map-context-rail-clear tap-44"
              onClick={clearAll}
              aria-label="Reset map view"
              title="Reset map view"
            >
              <X className="h-3.5 w-3.5" strokeWidth={2.5} aria-hidden />
            </button>
          </div>
        )}
      <div
        className={`dock${pane ? " dock-open" : ""}`}
        data-map-dock
        data-pane={pane ?? undefined}
        data-query-active={props.q.trim().length > 0 ? "true" : undefined}
        data-search-open={pane === null && searchPanelOpen ? "true" : undefined}
        data-search-keyboard={searchKeyboardOpen ? "true" : undefined}
        ref={dockRef}
      >
        {locationOfferVisible && pane === null && !searchPanelOpen && (
          <section
            className="map-location-offer"
            aria-labelledby="map-location-offer-title"
            aria-describedby="map-location-offer-copy"
          >
            <div className="map-location-offer-copy">
              <strong id="map-location-offer-title">
                Start with nearby results.
              </strong>
              <span id="map-location-offer-copy">
                Use your location for honest distances, or keep browsing the county.
              </span>
            </div>
            <div
              className="map-location-offer-actions"
              role="group"
              aria-label="Choose how to begin on the map"
            >
              <button
                type="button"
                onClick={props.goNearMe}
                aria-busy={props.locating || undefined}
              >
                {props.locating ? (
                  <LoaderCircle
                    className="h-4 w-4 animate-spin motion-reduce:animate-none"
                    strokeWidth={2.2}
                    aria-hidden
                  />
                ) : (
                  <LocateFixed className="h-4 w-4" strokeWidth={2.2} aria-hidden />
                )}
                Use my location
              </button>
              <button
                type="button"
                onClick={() => {
                  goCounty();
                  dismissLocationIntro();
                }}
              >
                <Waypoints className="h-4 w-4" strokeWidth={2.2} aria-hidden />
                Browse county
              </button>
            </div>
          </section>
        )}
        {/* The top-bar scope chip already owns Near me. Keep one map search and
            one outcome menu here instead of repeating the same location action. */}
        <div
          className="dock-head"
          style={{
            gridTemplateColumns: `minmax(0, 1fr) ${props.q.trim() ? "52px" : "80px"}`,
          }}
        >
          {/* Search, folded in as the top row — the map's ONE search. */}
          <div
            ref={searchWrapRef}
            className="dock-search-wrap"
            inert={pane !== null}
            onFocusCapture={() => {
              // Searching is a valid first move. Do not force a location
              // decision or let the delayed consent offer replace the field.
              dismissLocationIntro();
              setSearchPanelOpen(true);
            }}
            onBlurCapture={(event) => {
              flushMapSearchUrl();
              const next = event.relatedTarget;
              if (!(next instanceof Node) || !event.currentTarget.contains(next)) {
                // Some mobile browsers do not focus buttons on tap, so
                // relatedTarget can be null even when the tap is on a result.
                // Defer the close until that result's click has been handled.
                window.requestAnimationFrame(() => {
                  if (!searchWrapRef.current?.contains(document.activeElement)) {
                    closeSearchPanel();
                  }
                });
              }
            }}
          >
            <div className="dock-search" role="search">
              <SearchIcon aria-hidden className="h-4 w-4 shrink-0" strokeWidth={2.2} />
              <input
                id="map-search-input"
                ref={searchInputRef}
                type="search"
                value={props.q}
                onChange={(e) => {
                  setSearchPanelOpen(true);
                  updateMapSearch(e.target.value);
                }}
                onKeyDown={(event) => {
                  if (event.key === "ArrowDown") {
                    event.preventDefault();
                    event.stopPropagation();
                    moveSearchSelection(1);
                    return;
                  }
                  if (event.key === "ArrowUp") {
                    event.preventDefault();
                    event.stopPropagation();
                    moveSearchSelection(-1);
                    return;
                  }
                  if (event.key === "Enter" && searchResultsVisible) {
                    event.preventDefault();
                    event.stopPropagation();
                    chooseSearchResult(
                      activeSearchResult ?? visibleSearchMatches[0],
                    );
                    return;
                  }
                  if (event.key === "Escape") {
                    event.preventDefault();
                    event.stopPropagation();
                    closeSearchPanel();
                  }
                }}
                // The placeholder is the manual: concrete examples teach the
                // box's range (categories, outdoors, towns) at the exact
                // moment the eye is on it. No questions promised here — the
                // Ask handoff isn't wired to this box, and a signifier must
                // not overpromise.
                placeholder="Coffee, events, restrooms…"
                aria-label="Search this map"
                role="combobox"
                aria-autocomplete="list"
                aria-haspopup="listbox"
                aria-expanded={searchResultsVisible}
                aria-controls={
                  searchResultsVisible ? SEARCH_RESULTS_ID : undefined
                }
                aria-describedby={
                  searchLoadingVisible ||
                  searchUnavailableVisible ||
                  searchEmptyVisible
                    ? SEARCH_FEEDBACK_ID
                    : undefined
                }
                aria-activedescendant={
                  searchResultsVisible && activeSearchIndex >= 0
                    ? searchOptionId(activeSearchIndex)
                    : undefined
                }
                aria-busy={searchLoadingVisible || undefined}
                autoComplete="off"
                className="dock-search-input"
              />
              {props.q.trim().length > 0 && (
                <button
                  type="button"
                  className="dock-search-clear tap-44"
                  onClick={() => updateMapSearch("")}
                  aria-label="Clear search"
                >
                  <X className="h-4 w-4" strokeWidth={2.4} aria-hidden />
                </button>
              )}
            </div>
            {searchResultsVisible && (
              <div
                className="dock-search-results"
                onPointerDown={(event) => event.stopPropagation()}
                onClick={(event) => event.stopPropagation()}
              >
                <ul
                  id={SEARCH_RESULTS_ID}
                  role="listbox"
                  aria-label="Map search results"
                >
                  {visibleSearchMatches.map((r, index) => {
                    const dot =
                      r.type === "event" ? "var(--app-brand, #B5462B)"
                      : r.type === "municipality" ? "var(--app-cool, #5C8AA8)"
                      : r.type === "action" ? "var(--app-brand, #B5462B)"
                      : "var(--app-ink-3, #7A828C)";
                    return (
                      <li
                        key={r.id}
                        id={searchOptionId(index)}
                        role="option"
                        aria-selected={activeSearchIndex === index}
                        aria-disabled={props.searchOpeningId === r.id || undefined}
                        aria-busy={props.searchOpeningId === r.id || undefined}
                        tabIndex={-1}
                        className="dock-search-result-item dock-search-result"
                        data-rank={index + 1}
                        data-map-search-result={r.id}
                        onMouseEnter={() =>
                          setSearchSelection({ query: props.q, index })
                        }
                        onPointerDown={(event) => {
                          // Keep DOM focus on the combobox. The listbox uses
                          // aria-activedescendant; pointer users still activate
                          // the same option on click.
                          event.preventDefault();
                          event.stopPropagation();
                        }}
                        onClick={(event) => {
                          event.stopPropagation();
                          if (props.searchOpeningId === r.id) return;
                          chooseSearchResult(r);
                        }}
                        style={
                          activeSearchIndex === index
                            ? { background: "var(--app-bg-sunken)" }
                            : undefined
                        }
                      >
                        {props.searchOpeningId === r.id ? (
                          <LoaderCircle
                            aria-hidden
                            className="h-3.5 w-3.5 shrink-0 animate-spin motion-reduce:animate-none"
                          />
                        ) : (
                          <span aria-hidden className="dock-search-result-dot" style={{ background: dot }} />
                        )}
                        <span className="dock-search-result-text">
                          <span className="dock-search-result-title">{r.title}</span>
                          <span className="dock-search-result-sub">
                            {props.searchOpeningId === r.id
                              ? "Opening this map result…"
                              : r.type === "place"
                              ? [
                                  r.travel_minutes != null
                                    ? `${r.travel_minutes} min walk ${props.searchDistanceOriginLabel}`
                                    : r.distance_m != null
                                    ? `${formatDistance(r.distance_m)} ${props.searchDistanceOriginLabel}`
                                    : null,
                                  r.address?.trim() || r.subtitle,
                                ]
                                  .filter(Boolean)
                                  .join(" · ")
                              : r.subtitle}
                          </span>
                        </span>
                      </li>
                    );
                  })}
                </ul>
                {props.searchMatches.length > searchResultLimit && (
                  <div className="dock-search-more-item">
                    <button
                      type="button"
                      className="dock-search-more"
                      onClick={(event) => {
                        event.stopPropagation();
                        flushMapSearchUrl();
                        const current = new URL(window.location.href);
                        current.searchParams.set("q", props.q.trim());
                        const returnTo =
                          normalizeMapReturnTo(
                            `${current.pathname}${current.search}${current.hash}`,
                          ) ?? "/map";
                        // This leaves the map with one exact return URL. A
                        // document navigation avoids an App Router race where
                        // the panel could close while the search transition was
                        // cancelled, making the tap appear to do nothing.
                        window.location.assign(
                          `/search?q=${encodeURIComponent(props.q.trim())}&returnTo=${encodeURIComponent(returnTo)}`,
                        );
                      }}
                    >
                      See all results
                      <ChevronRight className="h-4 w-4" strokeWidth={2.2} aria-hidden />
                    </button>
                  </div>
                )}
              </div>
            )}
            {searchLoadingVisible && (
              <div
                id={SEARCH_FEEDBACK_ID}
                className="dock-search-results dock-search-loading"
                role="status"
                aria-live="polite"
                aria-atomic="true"
                onPointerDown={(event) => event.stopPropagation()}
                onClick={(event) => event.stopPropagation()}
              >
                <LoaderCircle
                  aria-hidden
                  className="h-4 w-4 animate-spin motion-reduce:animate-none"
                />
                <span>Searching Radius…</span>
              </div>
            )}
            {searchUnavailableVisible && (
              <div
                className="dock-search-results dock-search-empty"
                onPointerDown={(event) => event.stopPropagation()}
                onClick={(event) => event.stopPropagation()}
              >
                <div
                  id={SEARCH_FEEDBACK_ID}
                  role="status"
                  aria-live="polite"
                  aria-atomic="true"
                >
                  <p className="dock-search-empty-title">
                    Map search didn’t finish.
                  </p>
                  <p className="dock-search-empty-copy">
                    Your query is still here. Try it again, or ask Radius.
                  </p>
                </div>
                <div className="dock-search-empty-actions">
                  <button
                    type="button"
                    onPointerDown={(event) => event.preventDefault()}
                    onClick={props.retrySearch}
                  >
                    Try again
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      flushMapSearchUrl();
                      closeSearchPanel();
                      router.push(`/ask?q=${encodeURIComponent(props.q.trim())}`);
                    }}
                  >
                    Ask Radius
                  </button>
                </div>
              </div>
            )}
            {searchEmptyVisible && (
              <div
                className="dock-search-results dock-search-empty"
                onPointerDown={(event) => event.stopPropagation()}
                onClick={(event) => event.stopPropagation()}
              >
                <div
                  id={SEARCH_FEEDBACK_ID}
                  role="status"
                  aria-live="polite"
                  aria-atomic="true"
                >
                  <p className="dock-search-empty-title">
                    Nothing on this map matches “{props.q.trim()}.”
                  </p>
                  <p className="dock-search-empty-copy">
                    Search every Radius listing, or ask for a local answer.
                  </p>
                </div>
                <div className="dock-search-empty-actions">
                  <button
                    type="button"
                    onClick={() => {
                      flushMapSearchUrl();
                      const current = new URL(window.location.href);
                      current.searchParams.set("q", props.q.trim());
                      const returnTo =
                        normalizeMapReturnTo(
                          `${current.pathname}${current.search}${current.hash}`,
                        ) ?? "/map";
                      window.location.assign(
                        `/search?q=${encodeURIComponent(props.q.trim())}&returnTo=${encodeURIComponent(returnTo)}`,
                      );
                    }}
                  >
                    Search all Radius
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      flushMapSearchUrl();
                      closeSearchPanel();
                      router.push(`/ask?q=${encodeURIComponent(props.q.trim())}`);
                    }}
                  >
                    Ask Radius
                  </button>
                </div>
              </div>
            )}
          </div>

          <button
            ref={optionsButtonRef}
            type="button"
            className="dock-contents tap-44"
            data-map-browse-trigger
            data-on={activeOptionCount > 0 || undefined}
            aria-expanded={pane !== null}
            aria-controls="dock-pane"
            aria-label="Choose what to see on this map"
            title={`Choose what to see on this map. ${contentsSummary}`}
            onClick={() => {
              // What to see is another valid first move. The location offer is
              // guidance, not a gate in front of the map's actual controls.
              dismissLocationIntro();
              togglePane("contents");
            }}
          >
            <Layers3 className="h-[18px] w-[18px]" strokeWidth={2.15} aria-hidden />
            <span className="dock-contents-label">
              What to see
            </span>
            {/* No numeral badge: data-on already tints the button and the
                context rail states the same state IN WORDS ("Downtown ·
                Eat & drink"). A unitless sum of intents, flags, and layers
                is not a quantity anyone can act on — counts are supporting
                detail, never the headline. */}
          </button>
        </div>

        {/* The deeper controls are a bottom sheet on phones and a side tray on
            desktop. They never replace or dim the map. */}
        <div
          className="dock-pane"
          id="dock-pane"
          data-pane={pane ?? undefined}
          role="region"
          aria-label={paneTitle}
          aria-hidden={pane === null}
          tabIndex={-1}
          // See EventsBoardDock: inert keeps the collapsed panel's controls
          // out of tab order + the a11y tree (2026-07 P3).
          inert={pane === null}
          ref={paneRef}
          onKeyDown={onPaneKeyDown}
        >
          <div className="dock-pane-scroll" ref={paneScrollRef}>
            <div className="dock-pane-head">
              {pane !== "contents" ? (
                <button
                  type="button"
                  className="dock-back"
                  onClick={() => {
                    setPlaceReveal(null);
                    setEssentialsQuick(false);
                    setPane("contents");
                  }}
                >
                  <ChevronLeft className="h-4 w-4" strokeWidth={2.3} aria-hidden />
                  Back
                </button>
              ) : (
                <span className="dock-pane-head-spacer" aria-hidden />
              )}
              <h2 className="dock-pane-title">{paneTitle}</h2>
              <button type="button" className="dock-done" onClick={closePane}>
                Done
              </button>
            </div>

            {/* The contents index already explains its rows. Keep the count
                bar out of that clean first sheet unless there is state to
                reset; deeper panes retain the live, viewport-honest count. */}
            {/* Amenities was the one pane that never showed the bar, so a
                person who switched on restrooms and water had no Reset
                anywhere in it — the escape hatch went missing exactly where
                state had been added (mobile audit 2026-08-18). It now follows
                the contents rule: silent when at rest, present once dirty. */}
            {((pane === "contents" || pane === "amenities") && dirty) ||
            (pane !== "contents" && pane !== "amenities") ? (
              <div className="dock-countbar">
                <div className="dock-countline" aria-live="polite">
                  {pane === "discover"
                    ? `${props.discoveries.length} highlight${props.discoveries.length === 1 ? "" : "s"} in this view.`
                    : isLayerPane
                      ? layerStatusLine(
                          visibleLayerCount,
                          pane === "localLayers" ? "local" : "travel",
                        )
                      : line}
                  {pane !== "discover" && !isLayerPane && (
                    <span className="sr-only">
                      {` Showing ${what.main}, ${when.text}, ${whereText}, ${layers.main.toLowerCase()}.`}
                    </span>
                  )}
                </div>
                {pane !== "discover" && (isLayerPane ? visibleLayerCount > 0 : dirty) && (
                  <button
                    type="button"
                    className="dock-clear tap-44"
                    onClick={isLayerPane ? clearLayers : clearAll}
                  >
                    <X className="h-3.5 w-3.5" strokeWidth={2.6} aria-hidden />
                    <span>{isLayerPane ? "Clear layers" : "Reset"}</span>
                  </button>
                )}
              </div>
            ) : null}

            {degradedPaneSourceGroups.length > 0 && (
              <div
                className="dock-source-health"
                role="status"
                aria-label={
                  paneSourceLabels.length > 0
                    ? `Unavailable map sources: ${paneSourceLabels.join(", ")}`
                    : "Some map sources are unavailable"
                }
              >
                <span>
                  {paneSourcesUnavailable
                    ? "These live map sources are unavailable. An empty layer does not mean there are no results."
                    : "Some live map sources are unavailable. Available results are still shown."}
                </span>
                {props.retryMapLayerGroups && (
                  <button
                    type="button"
                    className="tap-44"
                    onClick={() =>
                      props.retryMapLayerGroups?.(degradedPaneSourceGroups)
                    }
                  >
                    Check again
                  </button>
                )}
              </div>
            )}

            {pane === "contents" && (
              <div className="dock-content-list" role="group" aria-label="Choose what you need from the map">
                <div className="dock-content-heading" aria-hidden>
                  What do you need?
                </div>
                <div className="dock-content-primary">
                {/* The 2-tap route to a restroom existed only as an unlabeled
                    tap on the user-location dot — invisible, and present only
                    once location was already granted. The discoverable route
                    cost four taps. This is that shortcut, said out loud, on
                    the hub where someone who needs a restroom is looking
                    (mobile audit 2026-08-18). */}
                <button
                  type="button"
                  className="dock-content-row dock-content-row-primary"
                  data-on={publicAmenityCount > 0 || undefined}
                  onClick={() => {
                    haptic("light");
                    setPlaceReveal(null);
                    setEssentialsQuick(true);
                    setPane("amenities");
                    track("map_dock", { pane: "amenities", pick: "contents-row" });
                  }}
                >
                  <span className="dock-content-icon" aria-hidden>
                    <Droplets className="h-[18px] w-[18px]" strokeWidth={2.1} />
                  </span>
                  <span className="dock-content-copy">
                    <strong>Public essentials</strong>
                    <small>Restrooms, water, trash, and dog needs</small>
                  </span>
                  <ChevronRight className="h-4 w-4" strokeWidth={2.2} aria-hidden />
                </button>
                </div>
                <div className="dock-content-heading" aria-hidden>
                  Start a map view
                </div>
                <div className="dock-content-primary">
                <button
                  type="button"
                  className="dock-content-row dock-content-row-primary"
                  data-on={activeWhereSel.kind === "nearme" || undefined}
                  onClick={applyNearbyOutcome}
                >
                  <span className="dock-content-icon" aria-hidden>
                    <LocateFixed className="h-[18px] w-[18px]" strokeWidth={2.1} />
                  </span>
                  <span className="dock-content-copy">
                    <strong>Nearby</strong>
                    <small>Show what is closest to you</small>
                  </span>
                  <ChevronRight className="h-4 w-4" strokeWidth={2.2} aria-hidden />
                </button>
                <button
                  type="button"
                  className="dock-content-row dock-content-row-primary"
                  data-on={timeActive || undefined}
                  onClick={() => openContentsPane("when")}
                >
                  <span className="dock-content-icon" aria-hidden>
                    <Clock className="h-[18px] w-[18px]" strokeWidth={2.1} />
                  </span>
                  <span className="dock-content-copy">
                    <strong>Happening</strong>
                    <small>{timeActive ? when.text : "Events, open places, music, and deals"}</small>
                  </span>
                  <ChevronRight className="h-4 w-4" strokeWidth={2.2} aria-hidden />
                </button>
                <button
                  type="button"
                  className="dock-content-row dock-content-row-primary"
                  data-on={visibleLayerCount > 0 || undefined}
                  onClick={() => openContentsPane("layers")}
                >
                  <span className="dock-content-icon" aria-hidden>
                    <BusFront className="h-[18px] w-[18px]" strokeWidth={2.1} />
                  </span>
                  <span className="dock-content-copy">
                    <strong>Get around</strong>
                    <small>
                      {liveBusLine}
                    </small>
                  </span>
                  <ChevronRight className="h-4 w-4" strokeWidth={2.2} aria-hidden />
                </button>
                <button
                  type="button"
                  className="dock-content-row dock-content-row-primary"
                  data-on={(props.showRadar || props.roadsNowActive) || undefined}
                  onClick={() => openContentsPane("conditions")}
                >
                  <span className="dock-content-icon" aria-hidden>
                    <CloudSun className="h-[18px] w-[18px]" strokeWidth={2.1} />
                  </span>
                  <span className="dock-content-copy">
                    <strong>Conditions</strong>
                    <small>Weather, radar, roads, and outdoor context</small>
                  </span>
                  <ChevronRight className="h-4 w-4" strokeWidth={2.2} aria-hidden />
                </button>
                {whatChangedScene && !whatChangedUnavailable && (
                <button
                  type="button"
                  className="dock-content-row dock-content-row-primary"
                  data-on={props.activeRadiusSceneId === "what-changed" || undefined}
                  onClick={() => {
                    if (props.activeRadiusSceneId === "what-changed") props.onExitRadiusScene();
                    else props.onRadiusScene("what-changed");
                    closePane();
                  }}
                >
                  <span className="dock-content-icon" aria-hidden>
                    <History className="h-[18px] w-[18px]" strokeWidth={2.1} />
                  </span>
                  <span className="dock-content-copy">
                    <strong>What changed</strong>
                    <small>
                      {whatChangedScene
                        ? radiusSceneStatusLabel(whatChangedScene)
                        : "Projects, civic records, and recent changes"}
                    </small>
                  </span>
                  <ChevronRight className="h-4 w-4" strokeWidth={2.2} aria-hidden />
                </button>
                )}
                </div>
                <div className="dock-content-secondary" aria-label="More map choices">
                  <button
                    type="button"
                    className="dock-content-row dock-content-row-secondary"
                    data-on={(props.showTrails || props.showAerial || props.showCemeteries || props.showSavedOnly || props.fieldNotesOnly) || undefined}
                    onClick={() => openContentsPane("localLayers")}
                  >
                    <span className="dock-content-icon" aria-hidden>
                      <Layers3 className="h-[18px] w-[18px]" strokeWidth={2.1} />
                    </span>
                    <span className="dock-content-copy">
                      <strong>More</strong>
                      <small>Map details</small>
                    </span>
                    <ChevronRight className="h-4 w-4" strokeWidth={2.2} aria-hidden />
                  </button>
                <button
                  type="button"
                  className="dock-content-row dock-content-row-secondary"
                  onClick={() => void shareCurrentView()}
                >
                  <span className="dock-content-icon" aria-hidden>
                    {shareStatus === "copied"
                      ? <Check className="h-[18px] w-[18px]" strokeWidth={2.1} />
                      : <Share2 className="h-[18px] w-[18px]" strokeWidth={2.1} />}
                  </span>
                  <span className="dock-content-copy">
                    <strong>{shareStatus === "copied" ? "Copied" : "Share"}</strong>
                    <small>Share the current map link</small>
                  </span>
                  <ChevronRight className="h-4 w-4" strokeWidth={2.2} aria-hidden />
                </button>
                </div>
              </div>
            )}

            {pane === "amenities" && (
              <div
                className="dock-essentials"
                data-quick={essentialsQuick || undefined}
              >
                <button
                  type="button"
                  className="dock-essential-origin"
                  data-on={Boolean(props.userLoc) || undefined}
                  onClick={props.goNearMe}
                  aria-busy={props.locating || undefined}
                >
                  {props.locating ? (
                    <LoaderCircle
                      className="h-4 w-4 animate-spin motion-reduce:animate-none"
                      strokeWidth={2.2}
                      aria-hidden
                    />
                  ) : (
                    <LocateFixed className="h-4 w-4" strokeWidth={2.2} aria-hidden />
                  )}
                  <span>
                    {props.locating
                      ? "Finding your location…"
                      : props.userLoc
                        ? "Using your location"
                        : "Use my location"}
                  </span>
                </button>
                <div
                  className="dock-essential-grid"
                  role="group"
                  aria-label="Choose an essential to find the nearest mapped location"
                >
                  {(essentialsQuick
                    ? publicAmenityGroups.filter((group) =>
                        ["restroom", "water", "trash", "dog"].includes(group.key),
                      )
                    : publicAmenityGroups
                  ).map((group) => {
                    const Icon = ESSENTIAL_ICONS[group.key] ?? MapPin;
                    const on = props.amenityGroups.has(group.key);
                    return (
                      <button
                        key={group.key}
                        type="button"
                        className="dock-essential-choice"
                        data-on={on || undefined}
                        aria-pressed={on}
                        onClick={() => pickSingleAmenity(group.key)}
                      >
                        <span className="dock-essential-choice-icon" aria-hidden>
                          <Icon className="h-[18px] w-[18px]" strokeWidth={2.05} />
                        </span>
                        <span>{group.label}</span>
                        {!essentialsQuick && (
                          <small>
                            {(props.amenityGroupCounts[group.key] ?? 0).toLocaleString("en-US")} mapped
                          </small>
                        )}
                      </button>
                    );
                  })}
                </div>
                {essentialsQuick && publicAmenityGroups.length > 4 && (
                  <button
                    type="button"
                    className="dock-essentials-more tap-44"
                    onClick={() => setEssentialsQuick(false)}
                  >
                    <span>More essentials</span>
                    <ChevronDown className="h-4 w-4" strokeWidth={2.2} aria-hidden />
                  </button>
                )}
              </div>
            )}

            {/* ── PLACES — stable catalogs, never time-reordered guesses. A
                selection closes the panel so the map becomes the answer. */}
            {pane === "what" && (
              <div>
                {props.amenityCount > 0 && publicAmenityGroups.length > 0 && (
                  <button
                    type="button"
                    className="dock-reveal"
                    onClick={() => {
                      setEssentialsQuick(false);
                      setPane("amenities");
                    }}
                  >
                    <span className="dock-content-icon" aria-hidden>
                      <MapPin className="h-[18px] w-[18px]" strokeWidth={2.1} />
                    </span>
                    <span className="dock-reveal-copy">
                      <strong>Nearby essentials</strong>
                      <small>Restrooms, water, trash, dog needs, power, and more</small>
                    </span>
                    <ChevronRight className="h-4 w-4" strokeWidth={2.2} aria-hidden />
                  </button>
                )}

                {intent?.subIntents && intent.subIntents.length > 0 && (
                  <>
                    <Sect>Narrow {intent.label}</Sect>
                    <HeadRow
                      color={intent.color}
                      ariaLabel={`Narrow ${intent.label}`}
                      onPick={(k) => pickSub(k === "" ? null : k)}
                      items={[
                        {
                          key: "",
                          label: "All",
                          count: browse.intentCounts[intent.key],
                          on: !browse.subKey,
                        },
                        ...intent.subIntents.map((s) => ({
                          key: s.key,
                          label: s.label,
                          count: browse.subCounts[s.key],
                          on: browse.subKey === s.key,
                        })),
                      ]}
                    />
                  </>
                )}

                <button
                  type="button"
                  className="dock-reveal"
                  aria-expanded={placeReveal === "categories"}
                  aria-controls="dock-place-categories"
                  onClick={() => togglePlaceReveal("categories")}
                >
                  <span className="dock-reveal-copy">
                    <strong>All place categories</strong>
                    <small>Food, parks, shops, and more</small>
                  </span>
                  <ChevronDown
                    className={`h-4 w-4 transition-transform${placeReveal === "categories" ? " rotate-180" : ""}`}
                    strokeWidth={2.2}
                    aria-hidden
                  />
                </button>
                <div id="dock-place-categories" hidden={placeReveal !== "categories"}>
                  {CATEGORY_FAMILIES.map((fam) => (
                    <div key={fam.label}>
                      <Sect>{fam.label}</Sect>
                      <div className="dock-cat-grid">
                        {fam.keys.map((k) => {
                          const it = INTENTS.find((i) => i.key === k);
                          if (!it) return null;
                          const Icon = CATEGORY_ICONS[it.icon] ?? Tag;
                          const on = browse.intentKey === it.key;
                          return (
                            <button
                              key={it.key}
                              type="button"
                              className="dock-cat"
                              data-on={on || undefined}
                              aria-pressed={on}
                              title={it.blurb}
                              onClick={() => pickIntent(on ? null : it.key)}
                              style={{ "--c": it.color } as React.CSSProperties}
                            >
                              <span aria-hidden className="dock-cat-art">
                                <Icon className="h-16 w-16" strokeWidth={1.5} />
                              </span>
                              <span className="dock-cat-t">{it.label}</span>
                              <span className="dock-cat-n">
                                {(browse.intentCounts[it.key] ?? 0).toLocaleString("en-US")} places
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>

                <MapInViewPlacesDisclosure
                  places={props.placesInView}
                  sortOrigin={props.placesInViewOrigin}
                  selectedSlug={props.selectedPlaceSlug}
                  onPick={(place) => {
                    props.onPickPlaceInView(place);
                    closePane();
                  }}
                />

                {/* A whole-surface mode switch does not belong as the FIRST
                    row of a pane a hungry person opened via "Near me". Last,
                    after the catalog answers, is where a mode change earns a
                    look (mobile audit 2026-08-18). */}
                <button
                  type="button"
                  className="dock-reveal"
                  onClick={() => {
                    haptic("light");
                    track("map_dock", { pane: "what", pick: "within-reach" });
                    closePane();
                    // The destination owns its own state and intentionally
                    // drops the browse query. This is a same-route client mode
                    // switch: update History, then notify the URL subscriber
                    // so MapModeGate swaps the UI without a document reload.
                    window.history.pushState(null, "", "/map?mode=radius");
                    window.dispatchEvent(new PopStateEvent("popstate"));
                  }}
                >
                  <span className="dock-reveal-copy">
                    <strong>Compare travel reach</strong>
                    <small>Compare what you can reach by walking, biking, or driving.</small>
                  </span>
                  <ChevronRight className="h-4 w-4" strokeWidth={2.2} aria-hidden />
                </button>

              </div>
            )}

            {/* ── WHEN ── */}
            {pane === "when" && (
              <div>
                {/* The hour scrubber leads the pane it names. It was dead last
                    under "Another time", three taps and a scroll deep, behind
                    a reveal inside a pane that is itself a disclosure — so the
                    map's one unique living-map instrument was its least
                    reachable control (mobile audit 2026-08-18). Open now,
                    Deals, and the event windows below are all reachable as URL
                    modes elsewhere; this is not. */}
                <Sect>The day</Sect>
                <TimeScrubber hour={props.scrubHour} onChange={props.setScrubHour} />

                <Sect>Places right now</Sect>
                <button
                  type="button"
                  className="dock-opennow"
                  data-on={browse.openNow || undefined}
                  aria-pressed={browse.openNow}
                  disabled={props.openNowAvailable === false}
                  title={props.openNowAvailable === false ? props.openNowUnavailableLabel ?? "Open-now filtering is unavailable until more hours are verified" : undefined}
                  onClick={toggleOpenNow}
                >
                  <Clock className="h-4 w-4" strokeWidth={2.4} aria-hidden />
                  {props.openNowAvailable === false ? "Open now unavailable" : "Open now"}
                  {props.openNowAvailable !== false && (
                    <span className="dock-opennow-n">{browse.openNowCount.toLocaleString("en-US")}</span>
                  )}
                </button>
                {showDeals && (
                  <button
                    type="button"
                    className="dock-opennow"
                    data-on={browse.dealsOn || undefined}
                    aria-pressed={browse.dealsOn}
                    onClick={toggleDealsToday}
                  >
                    <Tag className="h-4 w-4" strokeWidth={2.4} aria-hidden />
                    Deals today
                    <span className="dock-opennow-n">{browse.dealsTodayCount.toLocaleString("en-US")}</span>
                  </button>
                )}

                {hasEventChoices && (
                  <>
                    <Sect>Events</Sect>
                    <div className="dock-chips">
                      {visibleTimeWindows.map((w) => (
                        <Chip
                          key={w.key}
                          on={
                            (browse.timeModeExplicit && browse.timeMode === w.key) ||
                            (browse.musicTonight && w.key === "tonight")
                          }
                          color="var(--app-brand)"
                          onClick={() => pickWindow(w.key)}
                          count={browse.eventWindowCounts[w.key] || undefined}
                        >
                          {w.label}
                        </Chip>
                      ))}
                    </div>
                    {showLiveMusic && (
                      <button
                        type="button"
                        className="dock-opennow"
                        data-on={browse.musicTonight || undefined}
                        aria-pressed={browse.musicTonight}
                        onClick={toggleMusicTonight}
                      >
                        <Music className="h-4 w-4" strokeWidth={2.4} aria-hidden />
                        Live music tonight
                        <span className="dock-opennow-n">{browse.musicTonightCount.toLocaleString("en-US")}</span>
                      </button>
                    )}
                  </>
                )}

              </div>
            )}

            {/* ── WHERE ── */}
            {pane === "where" && (
              <div>
                <Sect>You</Sect>
                <button
                  type="button"
                  className="dock-findme"
                  data-on={activeWhereSel.kind === "nearme" || undefined}
                  onClick={pickNearMe}
                  aria-busy={props.locating || undefined}
                >
                  <LocateFixed className="h-4 w-4" strokeWidth={2.2} aria-hidden />
                  {props.locating
                    ? "Finding you…"
                    : activeWhereSel.kind === "nearme"
                      ? "You're on the map"
                      : "Find me"}
                </button>
                <p className="dock-hint">
                  Near me shows the one-mile Radius around you. Choose Whole county
                  whenever you want the full map again.
                </p>
                {props.geoMsg && (
                  <p className="dock-hint" role="status" style={{ color: "var(--app-warning-press)" }}>
                    {props.geoMsg}
                  </p>
                )}

                <Sect>Towns</Sect>
                <div className="dock-chips">
                  <Chip on={activeWhereSel.kind === "county"} color="var(--app-cool)" onClick={goCounty}>
                    Whole county
                  </Chip>
                  {MUNICIPALITIES.map((m) => (
                    <Chip
                      key={m.slug}
                      on={activeWhereSel.kind === "town" && activeWhereSel.slug === m.slug}
                      color="var(--app-cool)"
                      onClick={() => goTown(m.slug, m.name)}
                    >
                      {m.name}
                    </Chip>
                  ))}
                </div>
              </div>
            )}

            {/* ── HIGHLIGHTS — synthesized, source-visible connections.
                This is not another layer catalog. Each card names the literal
                relationship it found; selecting one closes the tray and draws
                only that small constellation on the map. ── */}
            {pane === "discover" && (
              <div className="dock-discoveries">
                <p className="dock-discovery-intro">
                  These highlights connect what is happening with what is nearby.
                </p>
                {props.discoveries.length > 0 ? (
                  <div className="dock-discovery-list">
                    {props.discoveries.map((discovery) => (
                      <button
                        key={discovery.id}
                        type="button"
                        className="dock-discovery-card"
                        data-on={props.selectedDiscoveryId === discovery.id || undefined}
                        aria-pressed={props.selectedDiscoveryId === discovery.id}
                        onClick={() => {
                          haptic("light");
                          track("map_finding", { pick: "select", kind: discovery.kind });
                          props.onSelectDiscovery(discovery.id);
                          closePane();
                        }}
                      >
                        <span className="dock-discovery-mark" aria-hidden>
                          <Waypoints className="h-4 w-4" strokeWidth={2.15} />
                        </span>
                        <span className="dock-discovery-copy">
                          <span className="dock-discovery-eyebrow">{discovery.eyebrow}</span>
                          <strong className="dock-discovery-title">{discovery.title}</strong>
                          <span className="dock-discovery-summary">{discovery.summary}</span>
                          <span className="dock-discovery-proof">
                            {discovery.points.length} mapped points · {discovery.evidence.length} source-backed facts
                          </span>
                        </span>
                        <ChevronRight className="dock-discovery-arrow h-4 w-4" strokeWidth={2.2} aria-hidden />
                      </button>
                    ))}
                  </div>
                ) : (
                  <div className="dock-discovery-empty">
                    <Waypoints className="h-5 w-5" strokeWidth={2} aria-hidden />
                    <p>Radius did not find a strong enough connection in this view.</p>
                    <small>Move closer to a town or event to uncover stronger connections.</small>
                  </div>
                )}
              </div>
            )}

            {/* Travel and conditions are outcome-first. The scene buttons set
                up a useful map; raw switches sit below as optional fine tune. */}
            {(pane === "layers" || pane === "conditions") && (
              <div>
                <Sect>{pane === "layers" ? "Choose a travel view" : "Choose a conditions view"}</Sect>
                <div className="dock-scene-grid" role="group" aria-label={pane === "layers" ? "Travel map views" : "Conditions map views"}>
                  {pane === "layers" ? (
                    <>
                      {sceneButton("buses-now")}
                      {sceneButton("roads-now")}
                      {sceneButton("within-15-minutes")}
                    </>
                  ) : (
                    <>{sceneButton("outside-now")}</>
                  )}
                </div>

                <Sect>Fine tune this view</Sect>
                <div className="dock-chips">
                  {pane === "layers" && (props.parkingCount > 0 || props.providerLayersAvailable) && (
                    <Chip
                      on={props.showParking}
                      color="var(--app-cool)"
                      onClick={() => props.setShowParking((v) => !v)}
                      count={props.parkingCount || undefined}
                      title="Downtown city parking garages, with availability when the city feed provides it"
                    >
                      Parking
                    </Chip>
                  )}
                  {pane === "layers" && (props.transitHealth.status !== "unavailable" || props.providerLayersAvailable) && (
                    <Chip
                      on={props.showTransit}
                      color="var(--app-cool)"
                      onClick={() => props.setShowTransit((v) => !v)}
                      title="TransIT route lines and stops without changing the rest of this map"
                    >
                      Transit routes
                    </Chip>
                  )}
                  {pane === "conditions" && <Chip
                    on={props.showRadar}
                    color="var(--app-cool)"
                    onClick={() => props.setShowRadar((v) => !v)}
                    title={
                      props.radarHealth.status === "unavailable"
                        ? props.showRadar
                          ? "The latest RainViewer request failed. Radar is retrying automatically"
                          : "The latest RainViewer request failed. Turn Radar on to retry"
                        : "RainViewer precipitation radar with NOAA 15-minute lightning density when current. Both products run behind real time"
                    }
                  >
                    Radar
                  </Chip>}
                  {pane === "conditions" && (props.communityReportCount > 0 || communityReportsOn || props.providerLayersAvailable) && (
                    <Chip
                      on={communityReportsOn}
                      color="var(--app-warning-press)"
                      onClick={() => toggleAmenity("community")}
                      count={props.communityReportCount || undefined}
                      title="Reviewed, unexpired reports submitted by the Frederick community"
                    >
                      Community reports
                    </Chip>
                  )}
                  {pane === "layers" && <Chip
                    on={props.roadsNowFullyOn}
                    color="var(--app-brand)"
                    onClick={() => props.setShowRoadsNow(!props.roadsNowFullyOn)}
                    title={
                      "Add Maryland roadwork and public incident reports without changing the rest of this map. Live traffic speeds are not shown"
                    }
                  >
                    Road reports
                  </Chip>}
                  {pane === "layers" && <Chip
                    on={props.showCameras}
                    color="var(--app-cool)"
                    onClick={() => props.setShowCameras((v) => !v)}
                    title={
                      props.cameraHealth.status === "unavailable"
                        ? props.showCameras
                          ? "The latest Maryland CHART request failed. Cameras are retrying automatically"
                          : "The latest Maryland CHART request failed. Turn Cameras on to retry"
                        : "Maryland CHART traffic cameras on I-70, US-15, US-340 and other main routes. Tap a camera to watch its live feed"
                    }
                  >
                    Cameras
                  </Chip>}
                  {pane === "conditions" && <Chip
                    on={props.showRotorcraft}
                    color="var(--app-cool)"
                    onClick={() => props.setShowRotorcraft((v) => !v)}
                    title="Privacy-limited public helicopter activity. Medical and personal calls are never shown"
                  >
                    Helicopter activity
                  </Chip>}
                </div>

                {(props.showParking || props.showTransit || props.showRadar || communityReportsOn
                  || props.roadsNowActive || props.showRotorcraft || props.showCameras
                  || (props.showTransit && props.transitHealth.status === "unavailable")
                  || props.radarHealth.status === "unavailable"
                  || props.incidentHealth.status === "unavailable"
                  || props.cameraHealth.status === "unavailable") && (
                  <div className="dock-layer-status-list" role="status" aria-live="polite">
                    {props.showParking && (
                      <p className="dock-layer-status">
                        <strong>Parking</strong> · {props.parkingCount} downtown garages. Tap one for availability and directions.
                      </p>
                    )}
                    {props.showTransit && (
                      <p className="dock-layer-status">
                        <strong>Transit</strong> · {props.transitHealth.status === "unavailable"
                          ? "The county route feed is unavailable."
                          : `${props.transitHealth.count} mapped route segments from ${props.transitHealth.source}. Tap a stop for arrivals or a vehicle for status.`}
                        {props.transitAlertSnapshot?.status === "ready"
                          ? ` ${props.transitAlertSnapshot.count} provider service ${props.transitAlertSnapshot.count === 1 ? "bulletin is" : "bulletins are"} active.`
                          : props.transitAlertSnapshot?.status === "stale"
                            ? " Provider service bulletins are delayed."
                            : props.transitAlertSnapshot?.status === "error"
                              ? " Provider service bulletins are unavailable."
                              : ""}
                      </p>
                    )}
                    {props.showRadar && (
                      <p className="dock-layer-status">
                        <strong>Radar</strong> · {props.radarHealth.status === "unavailable"
                          ? "RainViewer did not return the latest radar image. Radius will try again automatically."
                          : props.radarHealth.status === "stale"
                          ? `Showing the last good frames${radarUpdate ? ` from ${radarUpdate}` : ""}. The source is older than Radius's 30-minute freshness window; Radius will check again automatically.`
                          : props.radarHealth.status === "empty"
                          ? "No frames are available from RainViewer."
                          : radarClock
                          ? <>Latest RainViewer frame <span className="font-mono">{radarClock}</span> Eastern. NOAA lightning density appears when its current frame is available.</>
                          : "Loading precipitation and checking NOAA lightning density…"}
                      </p>
                    )}
                    {communityReportsOn && (
                      <p className="dock-layer-status">
                        <strong>Community reports</strong> · {props.communityReportCount > 0
                          ? `${props.communityReportCount} reviewed, current report${props.communityReportCount === 1 ? "" : "s"}.`
                          : "No current reports."}
                      </p>
                    )}
                    {/* Keep the live road answer scannable. Source detail and
                        important limits stay one disclosure away instead of
                        becoming a wall of text over the map. */}
                    {props.roadsNowActive && (
                      <div className="dock-layer-status">
                        <p>
                          <strong>Roads now</strong> · {props.showIncidents
                            ? props.incidentHealth.status === "unavailable"
                              ? "Current public incident reports are temporarily unavailable."
                              : props.incidentHealth.status === "stale"
                                ? `Using the last good incident update${incidentUpdate ? ` from ${incidentUpdate}` : ""}.`
                                : props.incidentHealth.status === "disabled"
                                  ? "Checking current public incidents."
                                  : props.incidentHealth.status === "empty"
                                    ? "No safely mapped travel incidents are current."
                                    : `${props.incidentHealth.count} current travel incident${props.incidentHealth.count === 1 ? "" : "s"} mapped.`
                            : props.showTraffic
                              ? "Maryland road work and official travel context are on."
                              : "Official road reports are on."}
                        </p>
                        <details className="mt-1.5 text-[11px] leading-relaxed">
                          <summary className="tap-44-y cursor-pointer font-semibold">Sources and limits</summary>
                          <p className="pb-1">
                            Maryland CHART, WZDx, and county-published reports provide road work and official travel context. Radius does not show live congestion speeds. Frederick Scanner contributes only public reports with a safe block-level location and likely travel impact. Medical and personal calls stay hidden.
                            {props.showTraffic && (props.floodContextCount > 0 || props.snowRouteCount > 0)
                              ? " High-water locations and snow routes are background context, not claims of current flooding, closures, or plow locations."
                              : ""}
                          </p>
                        </details>
                      </div>
                    )}
                    {props.showRotorcraft && (
                      <p className="dock-layer-status">
                        <strong>Helicopter activity</strong> · Public ADS-B
                        coverage is incomplete. Trooper activity is reported
                        only at county level, and possible FMH movement is
                        shown at the fixed hospital heliport.
                      </p>
                    )}
                    {props.showCameras && (
                      <p className="dock-layer-status">
                        <strong>Cameras</strong> · {props.cameraHealth.status === "unavailable"
                          ? "The latest Maryland CHART request failed. Retrying automatically."
                          : props.cameraHealth.status === "stale"
                          ? `Showing ${props.cameraHealth.count} camera${props.cameraHealth.count === 1 ? "" : "s"} from the last good update${cameraUpdate ? ` at ${cameraUpdate}` : ""}. The feed is retrying.`
                          : props.cameraHealth.status === "disabled"
                            ? "Loading Maryland CHART cameras…"
                          : props.cameraHealth.status === "empty"
                          ? "The latest Maryland CHART response contains no Frederick County cameras."
                          : `${props.cameraHealth.count} cameras from ${props.cameraHealth.source}. Tap a marker for the live road feed.`}
                      </p>
                    )}
                  </div>
                )}

              </div>
            )}

            {/* ── LOCAL LAYERS — slower-changing exploration and personal
                lenses are one deliberate level below the live map controls.
                This keeps the first layer screen complete without a long
                mixed-purpose scroll. ── */}
            {pane === "localLayers" && (
              <div>
                <Sect>Frederick details</Sect>
                <div className="dock-chips">
                  {(props.trailCount > 0 || props.providerLayersAvailable) && (
                    <Chip
                      on={props.showTrails}
                      color="var(--app-positive)"
                      onClick={() => props.setShowTrails((v) => !v)}
                      count={props.trailCount || undefined}
                      title="County trails"
                    >
                      Trails
                    </Chip>
                  )}
                  {props.aerialCount > 0 && (
                    <Chip
                      on={props.showAerial}
                      color="var(--app-accent)"
                      inkOnFill
                      onClick={() => props.setShowAerial((v) => !v)}
                      count={props.aerialCount}
                      title="Drone photos from the Frederick Radius seasonal archive. Each pin marks where a shot was taken"
                    >
                      Aerial photos
                    </Chip>
                  )}
                  {(props.cemeteryCount > 0 || props.providerLayersAvailable) && (
                    <Chip
                      on={props.showCemeteries}
                      color="var(--app-ink-2)"
                      onClick={() => props.setShowCemeteries((v) => !v)}
                      count={props.cemeteryCount || undefined}
                      title="Historic cemeteries from county records"
                    >
                      Cemeteries
                    </Chip>
                  )}
                  {OVERLAYS.filter((o) => o.ready).map((o) => (
                    <Chip
                      key={o.key}
                      on={props.activeOverlays.includes(o.key)}
                      color="var(--app-brand)"
                      onClick={() => props.toggleOverlay(o.key)}
                      title={o.sources}
                    >
                      {o.label}
                    </Chip>
                  ))}
                </div>
                {props.activeOverlays.includes("mobility") && (
                  <p className="dock-hint" role="status">
                    Zoom in on Frederick City for sidewalk detail. Existing
                    paths can support route context; planned paths cannot. The
                    City bike-path feed is currently unavailable.
                  </p>
                )}
                {props.showAerial && (
                  <HeadRow
                    color="var(--app-accent-press)"
                    ariaLabel="Aerial photos by season"
                    onPick={(k) => props.onAerialSeason(k)}
                    items={props.aerialSeasons.map((s) => ({
                      key: s.key,
                      label: s.label,
                      count: s.count,
                      on: props.aerialSeason === s.key,
                    }))}
                  />
                )}

                {props.savedCount > 0 && (
                  <>
                    <Sect>Saved</Sect>
                    <div className="dock-chips">
                      <Chip
                        on={props.showSavedOnly}
                        color="var(--app-brand)"
                        onClick={() => props.setShowSavedOnly((v) => !v)}
                        count={props.savedCount}
                        title="Show only the places you saved"
                      >
                        Saved places
                      </Chip>
                    </div>
                  </>
                )}

                {props.fieldNotesCount > 0 && (
                  <>
                    <Sect>Radius fieldwork</Sect>
                    <div className="dock-chips">
                      <Chip
                        on={props.fieldNotesOnly}
                        color="var(--app-brand)"
                        onClick={() => props.setFieldNotesOnly((v) => !v)}
                        count={props.fieldNotesCount}
                        title="Show places with checked Field Notes about deals, parking, and useful local details"
                      >
                        <NotebookPen className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
                        Checked field notes
                      </Chip>
                    </div>
                  </>
                )}

                {props.discoveries.length > 0 && (
                  <button
                    type="button"
                    className="dock-reveal"
                    aria-label="Connections here"
                    data-on={Boolean(props.selectedDiscoveryId) || undefined}
                    onClick={() => setPane("discover")}
                  >
                    <span className="dock-content-icon" aria-hidden>
                      <Waypoints className="h-[18px] w-[18px]" strokeWidth={2.1} />
                    </span>
                    <span className="dock-reveal-copy">
                      <strong>Connections here</strong>
                      <small>
                        {props.discoveries.length} source-backed {props.discoveries.length === 1 ? "connection" : "connections"}
                      </small>
                    </span>
                    <ChevronRight className="h-4 w-4" strokeWidth={2.2} aria-hidden />
                  </button>
                )}

                {/* The Key legend was cut in the Aug 2026 earn-its-place pass:
                    it repeated the same intent-color dictionary the "All place
                    categories" grid already renders as tinted, labeled tiles —
                    and it wore the Open-now filter's visual affordance for a
                    read-only list. One dictionary, rendered once. */}
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
