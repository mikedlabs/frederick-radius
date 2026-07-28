"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Baby, Beer, Check, ChevronDown, ChevronLeft, ChevronRight, Church, Clock, Coffee, Heart, Hotel, Landmark, Layers3, LayoutGrid, LocateFixed, Music, NotebookPen, Palette, Search as SearchIcon, Share2, ShoppingBag, Tag, Toilet, Trees, Utensils, Waypoints, Wine, X, type LucideIcon } from "lucide-react";
import { INTENTS } from "@/data/intents";
import { MUNICIPALITIES } from "@/data/municipalities";
import { AMENITY_GROUPS } from "./constants";
import { OVERLAYS, type OverlayKey } from "@/lib/overlays";
import type { BrowseDockInfo } from "./types";
import { formatDistance, type LngLat } from "@/lib/geo";
import type { SearchResult } from "@/lib/search/index";
import TimeScrubber from "./TimeScrubber";
import { haptic } from "@/lib/haptics";
import { parseScope, scopeTownSlug, setScope, subscribeScopeChange, SCOPE_PARAM, type Scope } from "@/lib/scope";
import { track } from "@/lib/track";
import { consumeFindRequest } from "@/lib/findBridge";
import {
  TIME_WINDOWS,
  countLine,
  dockDirty,
  layersCaption,
  whatCaption,
  whenCaption,
} from "./dockCaption";
import type { MapDiscovery } from "./mapDiscoveries";
import { mapContentsSummary } from "./mapContent";
import type { LiveLayerHealth } from "@/lib/live-layer-health";
import { normalizeMapReturnTo } from "@/lib/map-return";
import { replaceMapUrl } from "@/lib/map-url-state";

type SetState<T> = (updater: T | ((prev: T) => T)) => void;

/** One Lucide component per intent icon key, so the Places grid renders an
 *  icon per category straight from the shared INTENTS registry. */
const CATEGORY_ICONS: Record<string, LucideIcon> = {
  Coffee, Utensils, Wine, Beer, Trees, Baby, Palette, Heart, Landmark, ShoppingBag, Hotel, Church,
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
 *  after a person opens Map options; none compete with the county on load. */
type Pane = "contents" | "what" | "when" | "where" | "discover" | "layers" | "localLayers";
type PlaceReveal = "categories" | "amenities";

/** Where the camera is pointed, per the user's own choice in the Where
 *  pane. Camera moves only — Where NEVER filters what's on the map. */
type WhereSel =
  | { kind: "county" }
  | { kind: "nearme" }
  | { kind: "town"; slug: string; name: string };

const TOWN_ZOOM = 13.4;

/**
 * MapDock — the calm control surface for /map. Search and Map options are the
 * only cold controls. A deliberate options tap reveals the deeper choices in
 * a compact phone tray or desktop inspector while the map remains visible.
 *
 *   - Places and amenities are stable catalogs, never reordered predictions.
 *   - Events remain absent until a person chooses a time.
 *   - Area moves the camera; it never silently filters results.
 *   - Layers and source-backed connections live behind Map options.
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

  // ── Search, folded into the dock's top row (the map's ONE search). ──
  q: string;
  setQ: SetState<string>;
  searchMatches: SearchResult[];
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

  civicAvailable: boolean;
  showCivic: boolean;
  setShowCivic: SetState<boolean>;
  transitCount: number;
  transitHealth: LiveLayerHealth;
  showTransit: boolean;
  setShowTransit: SetState<boolean>;
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
  showParking: boolean;
  setShowParking: SetState<boolean>;
  showRadar: boolean;
  setShowRadar: SetState<boolean>;
  radarHealth: LiveLayerHealth;
  /** Newest radar frame's unix seconds — stamps "radar as of 9:42 PM" so
   *  minutes-old tiles are never mistaken for real time. */
  radarFrameEpoch: number | null;
  showIncidents: boolean;
  setShowIncidents: SetState<boolean>;
  incidentHealth: LiveLayerHealth;
  showCameras: boolean;
  setShowCameras: SetState<boolean>;
  cameraHealth: LiveLayerHealth;
  showFireStations: boolean;
  setShowFireStations: SetState<boolean>;
  showCivicPlaces: boolean;
  setShowCivicPlaces: SetState<boolean>;
  activeOverlays: OverlayKey[];
  toggleOverlay: (k: OverlayKey) => void;

  // ── When pane ──
  scrubHour: number | null;
  setScrubHour: (h: number | null) => void;

  // ── Where pane ──
  userLoc: LngLat | null;
  locating: boolean;
  geoMsg: string | null;
  goNearMe: () => void;
  flyTo: (center: [number, number], zoom: number) => void;
  fitCounty: () => void;

  // ── Highlights: evidence-backed connections already in the viewport. ──
  discoveries: MapDiscovery[];
  selectedDiscoveryId: string | null;
  onSelectDiscovery: (id: string) => void;

  /** Lets AppMap dim the map chrome + mark the host while a pane is open. */
  onPaneOpenChange: (open: boolean) => void;
};

/** A dock chip: color-dotted pill with an optional mono count. ≥44px
 *  effective target via the vertical extender (rows are horizontal). */
function Chip({
  on,
  color,
  inkOnFill = false,
  disabled = false,
  soon = false,
  title,
  onClick,
  ariaExpanded,
  children,
  count,
}: {
  on: boolean;
  color?: string;
  /** Gold-family fills need ink text, not white (AA). */
  inkOnFill?: boolean;
  disabled?: boolean;
  soon?: boolean;
  title?: string;
  onClick: () => void;
  ariaExpanded?: boolean;
  children: ReactNode;
  count?: number | null;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      aria-pressed={on}
      aria-expanded={ariaExpanded}
      className="dock-chip tap-44-y"
      data-on={on || undefined}
      data-ink={inkOnFill || undefined}
      style={{ "--c": color, opacity: disabled ? 0.5 : 1 } as React.CSSProperties}
    >
      {color && <span aria-hidden className="dock-chip-dot" />}
      {children}
      {typeof count === "number" && (
        <span className="dock-chip-n">{count.toLocaleString("en-US")}</span>
      )}
      {soon && <span className="dock-chip-soon">soon</span>}
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
    disabled?: boolean;
    soon?: boolean;
  }>;
  onPick: (key: string) => void;
}) {
  return (
    <div className="dock-subrow" role="group" aria-label={ariaLabel} style={{ "--c": color } as React.CSSProperties}>
      {items.map((it) => (
        <button
          key={it.key}
          type="button"
          onClick={() => !it.disabled && onPick(it.key)}
          disabled={it.disabled}
          aria-pressed={it.on}
          data-on={it.on || undefined}
          style={{ opacity: it.disabled ? 0.5 : 1 }}
        >
          {it.label}
          {typeof it.count === "number" && <span className="dock-chip-n">{it.count}</span>}
          {it.soon && <span className="dock-chip-soon">soon</span>}
        </button>
      ))}
    </div>
  );
}

function Sect({ children }: { children: ReactNode }) {
  return <div className="dock-sect">{children}</div>;
}

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
  const { browse, onPaneOpenChange } = props;
  const publicAmenityGroups = PUBLIC_AMENITY_GROUPS.filter(
    (group) => (props.amenityGroupCounts[group.key] ?? 0) > 0,
  );
  const router = useRouter();
  const sp = useSearchParams();

  const [pane, setPane] = useState<Pane | null>(null);
  const [placeReveal, setPlaceReveal] = useState<PlaceReveal | null>(null);
  const [searchPanelOpen, setSearchPanelOpen] = useState(false);
  const [shareStatus, setShareStatus] = useState<"idle" | "copied">("idle");
  // The Layers tab's Key grid is collapsed by default; one small control
  // reveals it without creating another horizontal rail.
  const [keyOpen, setKeyOpen] = useState(false);
  const [whereSel, setWhereSel] = useState<WhereSel>({ kind: "county" });
  // Focus management for the disclosure panel: focus lands inside it when it
  // opens, and the Map options trigger is restored when it closes.
  const paneRef = useRef<HTMLDivElement>(null);
  const paneScrollRef = useRef<HTMLDivElement>(null);
  const dockRef = useRef<HTMLDivElement>(null);
  const optionsButtonRef = useRef<HTMLButtonElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const searchWrapRef = useRef<HTMLDivElement>(null);
  const restoreRef = useRef<HTMLElement | null>(null);

  // Size the one explicit options panel against the map canvas. The earlier
  // quarter-height cap made every deeper panel a cramped nested scroller. A
  // deliberate panel may use nearly half the canvas; closing it restores an
  // entirely unobstructed map.
  useEffect(() => {
    const dockElement = dockRef.current;
    const host = dockElement?.closest<HTMLElement>(".dock-host");
    if (!dockElement || !host) return;

    const sizePane = () => {
      const mapHeight = host.getBoundingClientRect().height;
      const available = Math.max(148, mapHeight - 112);
      const minimum = mapHeight < 320 ? 148 : 240;
      const cap = Math.min(available, Math.max(minimum, Math.floor(mapHeight * 0.48)));
      dockElement.style.setProperty("--map-pane-cap", `${cap}px`);
    };
    sizePane();
    const observer = new ResizeObserver(sizePane);
    observer.observe(host);
    return () => observer.disconnect();
  }, []);

  // Match the readout to the scope that already seeded the map's camera.
  // localStorage is client-only, so this intentionally runs after hydration.
  useEffect(() => {
    // A clean /map entry always starts at the county. Only an explicit `?in=`
    // deep link narrows the initial readout; a town saved elsewhere in the app
    // must not make the map silently open zoomed in.
    const scope: Scope = parseScope(sp.get(SCOPE_PARAM)) ?? "county";
    const applyReadout = (nextScope: Scope | null) => {
      if (nextScope === "nearme") {
        // A requested Near me lens is not a location fix. Until a valid cached
        // or freshly granted coordinate exists, keep the truthful County label
        // while the camera shows the county fallback.
        setWhereSel(props.userLoc ? { kind: "nearme" } : { kind: "county" });
        return;
      }
      const slug = scopeTownSlug(nextScope);
      const town = slug ? MUNICIPALITIES.find((m) => m.slug === slug) : null;
      setWhereSel(town ? { kind: "town", slug: town.slug, name: town.name } : { kind: "county" });
    };
    applyReadout(scope);
    return subscribeScopeChange((nextScope) => {
      applyReadout(nextScope);
      if (nextScope === "nearme") {
        props.goNearMe();
        return;
      }
      const slug = scopeTownSlug(nextScope);
      const town = slug ? MUNICIPALITIES.find((m) => m.slug === slug) : null;
      if (town) props.flyTo([town.centroid.lng, town.centroid.lat], TOWN_ZOOM);
      else props.fitCounty();
    });
  // One-shot initialization: camera moves append ?c= and must not reset a
  // deliberate Where choice by rerunning this effect.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // A landed location fix means the camera is on the user — the Where
  // word reads "Near me" until they choose somewhere else.
  const [prevLoc, setPrevLoc] = useState(props.userLoc);
  if (props.userLoc !== prevLoc) {
    setPrevLoc(props.userLoc);
    if (props.userLoc) setWhereSel({ kind: "nearme" });
  }

  useEffect(() => {
    onPaneOpenChange(pane !== null);
  }, [pane, onPaneOpenChange]);
  // A panel should never make the map feel captured. Touching the uncovered
  // canvas dismisses the panel before the pan continues; there is no scrim or
  // separate close step between the person and the map.
  useEffect(() => {
    const dismissForMapGesture = () => {
      setPane(null);
      setPlaceReveal(null);
      setSearchPanelOpen(false);
    };
    window.addEventListener("fr:map-gesture", dismissForMapGesture);
    return () => window.removeEventListener("fr:map-gesture", dismissForMapGesture);
  }, []);
  useEffect(() => {
    const dismissSearchOutside = (event: PointerEvent | WheelEvent) => {
      const target = event.target;
      if (target instanceof Node && searchWrapRef.current?.contains(target)) return;
      setSearchPanelOpen(false);
    };
    document.addEventListener("pointerdown", dismissSearchOutside, true);
    document.addEventListener("wheel", dismissSearchOutside, true);
    return () => {
      document.removeEventListener("pointerdown", dismissSearchOutside, true);
      document.removeEventListener("wheel", dismissSearchOutside, true);
    };
  }, []);
  useEffect(() => {
    if (pane === null) return;
    if (paneScrollRef.current) paneScrollRef.current.scrollTop = 0;
    window.requestAnimationFrame(() => paneRef.current?.focus());
  }, [pane]);

  const closePane = () => {
    const restoreTarget = restoreRef.current;
    setPane(null);
    setPlaceReveal(null);
    setSearchPanelOpen(false);
    // The trigger stays inert until React commits the closed state. Restore
    // focus on the following frame so browsers do not discard the focus call.
    window.requestAnimationFrame(() => restoreTarget?.focus?.());
  };

  useEffect(() => {
    const focusMapSearch = () => {
      consumeFindRequest("map");
      setPane(null);
      setPlaceReveal(null);
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
  }, []);

  // URL state written by the map is more current than this component's last
  // render. Mutate the live address bar so a time/category tap cannot drop a
  // camera, layer, selection, or typed query that landed a moment earlier.
  const setParams = (mutate: (q: URLSearchParams) => void) => {
    replaceMapUrl(mutate);
  };

  /** Keep the map's typed query in its shareable URL. This is intentionally a
   * native history replacement rather than a router navigation on every
   * keystroke. Returning from a result can now restore the same query without
   * adding a stack of one-character history entries. */
  const updateMapSearch = (value: string) => {
    props.setQ(value);
    try {
      const url = new URL(window.location.href);
      const trimmed = value.trim();
      if (trimmed) url.searchParams.set("q", trimmed);
      else url.searchParams.delete("q");
      window.history.replaceState(window.history.state, "", url.toString());
    } catch {
      // URL persistence is an enhancement; search itself still works.
    }
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
    window.history.replaceState(window.history.state, "", url.toString());
  };

  const pickIntent = (key: string | null) => {
    haptic("light");
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
    setParams((q) => {
      if (key && browse.subKey !== key) q.set("sub", key);
      else q.delete("sub");
    });
    closePane();
  };
  const toggleOpenNow = () => {
    if (props.openNowAvailable === false) return;
    haptic("light");
    track("map_dock", { pane: "when", pick: browse.openNow ? "open-off" : "open-now" });
    setParams((q) => {
      if (browse.openNow) q.delete("open");
      else q.set("open", "now");
    });
  };
  const toggleDealsToday = () => {
    haptic("light");
    track("map_dock", { pane: "when", pick: browse.dealsOn ? "deals-off" : "deals-today" });
    setParams((q) => {
      if (browse.dealsOn) q.delete("deals");
      else q.set("deals", "today");
    });
  };
  const toggleMusicTonight = () => {
    haptic("light");
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
    setParams((q) => {
      // A general event window and the narrower live-music lens are mutually
      // exclusive. Never leave a hidden `t` value waiting to reappear later.
      q.delete("music");
      if (browse.timeModeExplicit && browse.timeMode === k) q.delete("t");
      else q.set("t", k);
    });
  };

  // Where picks write to the global lens; the subscription above updates both
  // this readout and the camera, including changes made from the top-bar chip.
  const goTown = (slug: string, name: string) => {
    haptic("light");
    setWhereSel({ kind: "town", slug, name });
    setScope(`town:${slug}`);
    setParams((q) => q.set(SCOPE_PARAM, slug));
  };
  const goCounty = () => {
    haptic("light");
    setWhereSel({ kind: "county" });
    setScope("county");
    setParams((q) => q.delete(SCOPE_PARAM));
  };
  // Explicit near-me tap (not the automatic fix-landed relabel, which must
  // not clobber a chosen town scope on every map mount): set the lens, then
  // run the map's own locate.
  const pickNearMe = () => {
    setWhereSel({ kind: "nearme" });
    setScope("nearme");
    setParams((q) => q.set(SCOPE_PARAM, "nearme"));
  };

  // ── Derived caption state ──
  const intent = browse.intentKey ? INTENTS.find((i) => i.key === browse.intentKey) : undefined;
  const sub = intent?.subIntents?.find((s) => s.key === browse.subKey);
  const communityReportsOn = props.amenityGroups.has("community");
  const publicAmenityCount = [...props.amenityGroups].filter((key) => key !== "community").length;

  // Layer drapes, in a stable order (drapes first, then Yours lenses) so
  // the Layers readout's lead word doesn't jump as toggles flip.
  const layerBits: string[] = [];
  if (publicAmenityCount > 0) layerBits.push("Amenities");
  if (communityReportsOn) layerBits.push("Community reports");
  if (props.showCivic) layerBits.push("Roads & alerts");
  if (props.showTransit) layerBits.push("Transit");
  if (props.showTrails) layerBits.push("Trails");
  if (props.showAerial) layerBits.push("Aerial photos");
  if (props.showCemeteries) layerBits.push("Cemeteries");
  if (props.showParking) layerBits.push("Parking");
  if (props.showRadar) layerBits.push("Radar");
  if (props.showIncidents) layerBits.push("Incidents");
  if (props.showCameras) layerBits.push("Cameras");
  if (props.showFireStations) layerBits.push("Fire stations");
  if (props.showCivicPlaces) layerBits.push("Parks & libraries");
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
    (props.showCivic ? 1 : 0) +
    (props.showTransit ? 1 : 0) +
    (props.showTrails ? 1 : 0) +
    (props.showAerial ? 1 : 0) +
    (props.showCemeteries ? 1 : 0) +
    (props.showParking ? 1 : 0) +
    (props.showRadar ? 1 : 0) +
    (props.showIncidents ? 1 : 0) +
    (props.showCameras ? 1 : 0) +
    (props.showFireStations ? 1 : 0) +
    (props.showCivicPlaces ? 1 : 0);
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
    whereSel.kind === "county" ? "County"
    : whereSel.kind === "nearme" ? "Near me"
    : whereSel.name;
  // Layers = the drapes + the Yours lenses, tallied for the spoken summary.
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
    whereAway: whereSel.kind !== "county",
  });

  const timeActive = browse.openNow || browse.dealsOn || browse.musicTonight
    || browse.timeModeExplicit || props.scrubHour != null;
  const firstAmenityLabel = [...props.amenityGroups]
    .map((key) => PUBLIC_AMENITY_GROUPS.find((group) => group.key === key)?.label)
    .find((label): label is string => Boolean(label));
  const contentsSummary = mapContentsSummary({
    area: whereText,
    amenity: firstAmenityLabel,
    intent: intent?.label,
    time: timeActive ? when.text : undefined,
    layer: layerBits[0] ?? lensLabels[0],
  });
  const refinementCount =
    (intent ? 1 : 0) +
    (browse.openNow ? 1 : 0) +
    (browse.dealsOn ? 1 : 0) +
    (browse.musicTonight ? 1 : 0) +
    (browse.timeModeExplicit ? 1 : 0) +
    (props.scrubHour != null ? 1 : 0) +
    (whereSel.kind !== "county" ? 1 : 0) +
    visibleLayerCount;
  const activeOptionCount =
    refinementCount + (props.selectedDiscoveryId ? 1 : 0);

  const line = countLine({
    places: props.placeCount,
    events: props.eventCount,
    closingSoon: props.closingSoonCount,
    scrubHour: props.scrubHour,
  });

  const clearAll = () => {
    haptic("light");
    track("map_dock", { pane: "clear", pick: "all" });
    clearLayerParamsImmediately();
    props.setAmenityGroups(new Set());
    props.setShowCivic(false);
    props.setShowTransit(false);
    props.setShowTrails(false);
    props.setShowAerial(false);
    props.setShowCemeteries(false);
    props.setShowParking(false);
    props.setShowRadar(false);
    props.setShowIncidents(false);
    props.setShowCameras(false);
    props.setShowFireStations(false);
    props.setShowCivicPlaces(false);
    props.setShowSavedOnly(false);
    props.setFieldNotesOnly(false);
    props.onAerialSeason("all");
    props.setScrubHour(null);
    for (const k of [...props.activeOverlays]) props.toggleOverlay(k);
    setWhereSel({ kind: "county" });
    setScope("county");
    props.fitCounty();
    closePane();
    // Clear filters without throwing away the user's map/list presentation.
    // The deep focus target goes too, because the camera has just returned to
    // the whole county and a shared URL must reopen in that same state.
    setParams((q) => {
      for (const key of ["intent", "sub", "open", "deals", "music", "t", "amenity", "show", "layers", "at", "place", SCOPE_PARAM]) {
        q.delete(key);
      }
    });
  };

  const clearLayers = () => {
    haptic("light");
    track("map_dock", { pane: "layers", pick: "clear" });
    clearLayerParamsImmediately();
    props.setAmenityGroups(new Set());
    props.setShowCivic(false);
    props.setShowTransit(false);
    props.setShowTrails(false);
    props.setShowAerial(false);
    props.setShowCemeteries(false);
    props.setShowParking(false);
    props.setShowRadar(false);
    props.setShowIncidents(false);
    props.setShowCameras(false);
    props.setShowFireStations(false);
    props.setShowCivicPlaces(false);
    props.setShowSavedOnly(false);
    props.setFieldNotesOnly(false);
    props.onAerialSeason("all");
    for (const key of [...props.activeOverlays]) props.toggleOverlay(key);
    setParams((q) => {
      q.delete("amenity");
      q.delete("show");
      q.delete("layers");
    });
  };

  const togglePane = (next: Pane) => {
    haptic("light");
    setSearchPanelOpen(false);
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

  const paneTitle =
    pane === "contents" ? "Map options"
    : pane === "what"
      ? placeReveal === "amenities" ? "Public essentials" : "Places & businesses"
    : pane === "when" ? "Events & time"
    : pane === "where" ? "Area"
    : pane === "discover" ? "Highlights"
    : pane === "layers" ? "Map layers"
    : pane === "localLayers" ? "Local layers"
    : "";
  const isLayerPane = pane === "layers" || pane === "localLayers";

  const togglePlaceReveal = (next: PlaceReveal) => {
    setPlaceReveal((current) => (current === next ? null : next));
  };

  const toggleAmenity = (key: string) => {
    props.setAmenityGroups((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const shareCurrentView = async () => {
    const url = window.location.href;
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

  return (
    <>
      <div
        className={`dock${pane ? " dock-open" : ""}`}
        data-map-dock
        data-pane={pane ?? undefined}
        ref={dockRef}
      >
        {/* The only persistent map choices: search and Map options. */}
        <div className="dock-head">
          {/* Search, folded in as the top row — the map's ONE search. */}
          <div
            ref={searchWrapRef}
            className="dock-search-wrap"
            inert={pane !== null}
            onFocusCapture={() => setSearchPanelOpen(true)}
            onBlurCapture={(event) => {
              const next = event.relatedTarget;
              if (!(next instanceof Node) || !event.currentTarget.contains(next)) {
                // Some mobile browsers do not focus buttons on tap, so
                // relatedTarget can be null even when the tap is on a result.
                // Defer the close until that result's click has been handled.
                window.requestAnimationFrame(() => {
                  if (!searchWrapRef.current?.contains(document.activeElement)) {
                    setSearchPanelOpen(false);
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
                  if (event.key !== "Escape") return;
                  event.preventDefault();
                  event.stopPropagation();
                  setSearchPanelOpen(false);
                  event.currentTarget.blur();
                }}
                // The placeholder is the manual: concrete examples teach the
                // box's range (categories, outdoors, towns) at the exact
                // moment the eye is on it. No questions promised here — the
                // Ask handoff isn't wired to this box, and a signifier must
                // not overpromise.
                placeholder="Find coffee, a trail, a town"
                aria-label="Search this map"
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
            {pane === null
              && searchPanelOpen
              && props.q.trim().length > 0
              && props.searchMatches.length > 0 && (
              <ul
                className="dock-search-results"
                onPointerDown={(event) => event.stopPropagation()}
                onClick={(event) => event.stopPropagation()}
              >
                {props.searchMatches.slice(0, 4).map((r, index) => {
                  const dot =
                    r.type === "event" ? "var(--app-brand, #B5462B)"
                    : r.type === "municipality" ? "var(--app-cool, #5C8AA8)"
                    : r.type === "action" ? "var(--app-brand, #B5462B)"
                    : "var(--app-ink-3, #7A828C)";
                  return (
                    <li key={r.id} className="dock-search-result-item" data-rank={index + 1}>
                      <button
                        type="button"
                        data-map-search-result={r.id}
                        onClick={(event) => {
                          event.stopPropagation();
                          setSearchPanelOpen(false);
                          props.pickSearch(r);
                        }}
                        className="dock-search-result"
                      >
                        <span aria-hidden className="dock-search-result-dot" style={{ background: dot }} />
                        <span className="dock-search-result-text">
                          <span className="dock-search-result-title">{r.title}</span>
                          <span className="dock-search-result-sub">
                            {r.type === "place"
                              ? [
                                  r.distance_m != null
                                    ? `${formatDistance(r.distance_m)} ${props.searchDistanceOriginLabel}`
                                    : null,
                                  r.address?.trim() || r.subtitle,
                                ]
                                  .filter(Boolean)
                                  .join(" · ")
                              : r.subtitle}
                          </span>
                        </span>
                      </button>
                    </li>
                  );
                })}
                {props.searchMatches.length > 4 && (
                  <li className="dock-search-more-item">
                    <button
                      type="button"
                      className="dock-search-more"
                      onClick={(event) => {
                        event.stopPropagation();
                        setSearchPanelOpen(false);
                        const current = new URL(window.location.href);
                        current.searchParams.set("q", props.q.trim());
                        const returnTo =
                          normalizeMapReturnTo(
                            `${current.pathname}${current.search}${current.hash}`,
                          ) ?? "/map";
                        router.push(
                          `/search?q=${encodeURIComponent(props.q.trim())}&returnTo=${encodeURIComponent(returnTo)}`,
                        );
                      }}
                    >
                      See all results
                      <ChevronRight className="h-4 w-4" strokeWidth={2.2} aria-hidden />
                    </button>
                  </li>
                )}
              </ul>
            )}
          </div>

          <button
            ref={optionsButtonRef}
            type="button"
            className="dock-contents tap-44"
            data-on={activeOptionCount > 0 || undefined}
            aria-expanded={pane !== null}
            aria-controls="dock-pane"
            aria-label={contentsSummary === "Contents" ? "Map options" : `Map options: ${contentsSummary}`}
            title={contentsSummary}
            onClick={() => togglePane("contents")}
          >
            <Layers3 className="h-[18px] w-[18px]" strokeWidth={2.15} aria-hidden />
            <span>Options</span>
            {activeOptionCount > 0 && (
              <span className="dock-layer-count" aria-hidden>
                {Math.min(activeOptionCount, 99)}
              </span>
            )}
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
                    setPane(pane === "localLayers" ? "layers" : "contents");
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
            {(pane !== "contents" || dirty) && (
              <div className="dock-countbar">
                <div className="dock-countline" aria-live="polite">
                  {pane === "discover"
                    ? `${props.discoveries.length} highlight${props.discoveries.length === 1 ? "" : "s"} in this view.`
                    : line}
                  {pane !== "discover" && (
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
                    aria-label={isLayerPane ? "Hide all map layers" : "Clear all filters"}
                  >
                    <X className="h-3.5 w-3.5" strokeWidth={2.6} aria-hidden />
                    <span>{isLayerPane ? "Clear layers" : "Reset"}</span>
                  </button>
                )}
              </div>
            )}

            {pane === "contents" && (
              <div className="dock-content-list" role="group" aria-label="Choose what the map shows">
                <button
                  type="button"
                  className="dock-content-row"
                  aria-label="Places and businesses"
                  onClick={() => openContentsPane("what", "categories")}
                >
                  <span className="dock-content-icon" aria-hidden>
                    <LayoutGrid className="h-[18px] w-[18px]" strokeWidth={2.1} />
                  </span>
                  <span className="dock-content-copy">
                    <strong>Places</strong>
                    <small>{intent?.label ?? `${props.placeCount.toLocaleString("en-US")} mapped places`}</small>
                  </span>
                  <ChevronRight className="h-4 w-4" strokeWidth={2.2} aria-hidden />
                </button>
                <button
                  type="button"
                  className="dock-content-row"
                  aria-label="Events and time"
                  data-on={timeActive || undefined}
                  onClick={() => openContentsPane("when")}
                >
                  <span className="dock-content-icon" aria-hidden>
                    <Clock className="h-[18px] w-[18px]" strokeWidth={2.1} />
                  </span>
                  <span className="dock-content-copy">
                    <strong>Events</strong>
                    <small>{timeActive ? when.text : "Choose a time before events appear"}</small>
                  </span>
                  <ChevronRight className="h-4 w-4" strokeWidth={2.2} aria-hidden />
                </button>
                <button
                  type="button"
                  className="dock-content-row"
                  aria-label="Public essentials"
                  data-on={publicAmenityCount > 0 || undefined}
                  onClick={() => openContentsPane("what", "amenities")}
                >
                  <span className="dock-content-icon" aria-hidden>
                    <Toilet className="h-[18px] w-[18px]" strokeWidth={2.1} />
                  </span>
                  <span className="dock-content-copy">
                    <strong>Essentials</strong>
                    <small>
                      {publicAmenityCount > 0
                        ? `${publicAmenityCount} ${publicAmenityCount === 1 ? "type" : "types"} showing`
                        : "Restrooms, water, seating, power, and more"}
                    </small>
                  </span>
                  <ChevronRight className="h-4 w-4" strokeWidth={2.2} aria-hidden />
                </button>
                <button
                  type="button"
                  className="dock-content-row"
                  aria-label="Towns and area"
                  data-on={whereSel.kind !== "county" || undefined}
                  onClick={() => openContentsPane("where")}
                >
                  <span className="dock-content-icon" aria-hidden>
                    <LocateFixed className="h-[18px] w-[18px]" strokeWidth={2.1} />
                  </span>
                  <span className="dock-content-copy">
                    <strong>Area</strong>
                    <small>{whereText}</small>
                  </span>
                  <ChevronRight className="h-4 w-4" strokeWidth={2.2} aria-hidden />
                </button>
                <button
                  type="button"
                  className="dock-content-row"
                  aria-label="Live and reference map layers"
                  data-on={visibleLayerCount > 0 || undefined}
                  onClick={() => openContentsPane("layers")}
                >
                  <span className="dock-content-icon" aria-hidden>
                    <Layers3 className="h-[18px] w-[18px]" strokeWidth={2.1} />
                  </span>
                  <span className="dock-content-copy">
                    <strong>Live layers</strong>
                    <small>
                      {visibleLayerCount > 0
                        ? `${visibleLayerCount} ${visibleLayerCount === 1 ? "layer" : "layers"} showing`
                        : "Transit, parking, radar, trails, and local history"}
                    </small>
                  </span>
                  <ChevronRight className="h-4 w-4" strokeWidth={2.2} aria-hidden />
                </button>
                {props.discoveries.length > 0 && (
                  <button
                    type="button"
                    className="dock-content-row"
                    aria-label="Highlights in this view"
                    data-on={Boolean(props.selectedDiscoveryId) || undefined}
                    onClick={() => openContentsPane("discover")}
                  >
                    <span className="dock-content-icon" aria-hidden>
                      <Waypoints className="h-[18px] w-[18px]" strokeWidth={2.1} />
                    </span>
                    <span className="dock-content-copy">
                      <strong>Highlights</strong>
                      <small>
                        {props.discoveries.length} source-backed {props.discoveries.length === 1 ? "connection" : "connections"}
                      </small>
                    </span>
                    <ChevronRight className="h-4 w-4" strokeWidth={2.2} aria-hidden />
                  </button>
                )}
                <button
                  type="button"
                  className="dock-content-row"
                  aria-label="Share this map view"
                  onClick={() => void shareCurrentView()}
                >
                  <span className="dock-content-icon" aria-hidden>
                    {shareStatus === "copied"
                      ? <Check className="h-[18px] w-[18px]" strokeWidth={2.1} />
                      : <Share2 className="h-[18px] w-[18px]" strokeWidth={2.1} />}
                  </span>
                  <span className="dock-content-copy">
                    <strong>{shareStatus === "copied" ? "Copied" : "Share"}</strong>
                    <small>Includes the area and choices currently on the map</small>
                  </span>
                  <ChevronRight className="h-4 w-4" strokeWidth={2.2} aria-hidden />
                </button>
              </div>
            )}

            {/* ── PLACES — stable catalogs, never time-reordered guesses. A
                selection closes the panel so the map becomes the answer. */}
            {pane === "what" && (
              <div>
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
                  <span className="dock-reveal-count">{INTENTS.length}</span>
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

                {/* Public amenities stay in the find flow, but the full
                    hand-mapped catalog no longer competes with the six most
                    common choices above. */}
                {props.amenityCount > 0 && publicAmenityGroups.length > 0 && (
                  <>
                    <button
                      type="button"
                      className="dock-reveal"
                      aria-expanded={placeReveal === "amenities"}
                      aria-controls="dock-public-amenities"
                      onClick={() => togglePlaceReveal("amenities")}
                    >
                      <span className="dock-reveal-copy">
                        <strong>Public amenities</strong>
                        <small>Water, trash, dog stations, and more</small>
                      </span>
                      <span className="dock-reveal-count">
                        {publicAmenityGroups.length}
                      </span>
                      <ChevronDown
                        className={`h-4 w-4 transition-transform${placeReveal === "amenities" ? " rotate-180" : ""}`}
                        strokeWidth={2.2}
                        aria-hidden
                      />
                    </button>
                    <div id="dock-public-amenities" hidden={placeReveal !== "amenities"} className="pt-2">
                      <HeadRow
                        color="var(--app-cool)"
                        ariaLabel="Public amenities"
                        onPick={toggleAmenity}
                        items={publicAmenityGroups.map((g) => ({
                          key: g.key,
                          label: g.label,
                          on: props.amenityGroups.has(g.key),
                        }))}
                      />
                    </div>
                  </>
                )}
              </div>
            )}

            {/* ── WHEN ── */}
            {pane === "when" && (
              <div>
                <Sect>Events</Sect>
                <div className="dock-chips">
                  {TIME_WINDOWS.map((w) => (
                    <Chip
                      key={w.key}
                      on={
                        (browse.timeModeExplicit && browse.timeMode === w.key) ||
                        (browse.musicTonight && w.key === "tonight")
                      }
                      color="var(--app-brand)"
                      onClick={() => pickWindow(w.key)}
                      count={browse.eventWindowCounts[w.key] ?? 0}
                    >
                      {w.label}
                    </Chip>
                  ))}
                </div>
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

                <Sect>The day</Sect>
                <TimeScrubber hour={props.scrubHour} onChange={props.setScrubHour} />
              </div>
            )}

            {/* ── WHERE ── */}
            {pane === "where" && (
              <div>
                <Sect>You</Sect>
                <button
                  type="button"
                  className="dock-findme"
                  data-on={whereSel.kind === "nearme" || undefined}
                  onClick={pickNearMe}
                  aria-busy={props.locating || undefined}
                >
                  <LocateFixed className="h-4 w-4" strokeWidth={2.2} aria-hidden />
                  {props.locating
                    ? "Finding you…"
                    : whereSel.kind === "nearme"
                      ? "You're on the map"
                      : "Find me"}
                </button>
                <p className="dock-hint">
                  Your location sorts the map by what&rsquo;s close. It moves the camera; it
                  never hides anything.
                </p>
                {props.geoMsg && (
                  <p className="dock-hint" role="status" style={{ color: "var(--app-warning-press)" }}>
                    {props.geoMsg}
                  </p>
                )}

                <Sect>Towns</Sect>
                <div className="dock-chips">
                  <Chip on={whereSel.kind === "county"} color="var(--app-cool)" onClick={goCounty}>
                    Whole county
                  </Chip>
                  {MUNICIPALITIES.map((m) => (
                    <Chip
                      key={m.slug}
                      on={whereSel.kind === "town" && whereSel.slug === m.slug}
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
                  These highlights connect what is happening with what is nearby. Open one to see the mapped facts behind it.
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

            {/* ── LAYERS — the map drapes + Yours lenses + the Key, folded in
                from the old bottom-left tray. ── */}
            {pane === "layers" && (
              <div>
                {/* Put decisions with immediate consequences before the
                    archival and exploratory layers. An active layer explains
                    what it is showing and where the information comes from. */}
                <Sect>Useful now</Sect>
                <div className="dock-chips">
                  {props.parkingCount > 0 && (
                    <Chip
                      on={props.showParking}
                      color="var(--app-cool)"
                      onClick={() => props.setShowParking((v) => !v)}
                      count={props.parkingCount}
                      title="Downtown city parking garages, tinted by live availability"
                    >
                      Parking
                    </Chip>
                  )}
                  <Chip
                    on={props.showTransit}
                    color="var(--app-cool)"
                    onClick={() => props.setShowTransit((v) => !v)}
                    count={props.transitCount > 0 ? props.transitCount : null}
                    disabled={props.transitHealth.status === "unavailable"}
                    title={
                      props.transitHealth.status === "unavailable"
                        ? "The Frederick County TransIT route feed is unavailable"
                        : "TransIT bus routes, stops, and live buses"
                    }
                  >
                    {props.transitHealth.status === "unavailable" ? "Transit unavailable" : "Transit"}
                  </Chip>
                  <Chip
                    on={props.showRadar}
                    color="var(--app-cool)"
                    onClick={() => props.setShowRadar((v) => !v)}
                    title={
                      props.radarHealth.status === "unavailable"
                        ? props.showRadar
                          ? "The latest RainViewer request failed. Radar is retrying automatically"
                          : "The latest RainViewer request failed. Turn Radar on to retry"
                        : "Animated precipitation radar from RainViewer. Frames run a few minutes behind real time"
                    }
                  >
                    Radar
                  </Chip>
                  {(props.communityReportCount > 0 || communityReportsOn) && (
                    <Chip
                      on={communityReportsOn}
                      color="var(--app-warning-press)"
                      onClick={() => toggleAmenity("community")}
                      count={props.communityReportCount}
                      title="Reviewed, unexpired reports submitted by the Frederick community"
                    >
                      Community reports
                    </Chip>
                  )}
                  {props.civicAvailable && (
                    <Chip
                      on={props.showCivic}
                      color="var(--app-warning-press)"
                      onClick={() => props.setShowCivic((v) => !v)}
                      title="Live traffic incidents and county-published issue reports (311)"
                    >
                      Roads &amp; alerts
                    </Chip>
                  )}
                  <Chip
                    on={props.showIncidents}
                    color="var(--app-brand)"
                    onClick={() => props.setShowIncidents((v) => !v)}
                    title={
                      props.incidentHealth.status === "unavailable"
                        ? props.showIncidents
                          ? "The latest FrederickScanner request failed. Incidents are retrying automatically"
                          : "The latest FrederickScanner request failed. Turn Incidents on to retry"
                        : "Live public incidents from the FredScanner dispatch feed (crashes, wires down, fires). Medical and personal calls are never shown"
                    }
                  >
                    Incidents
                  </Chip>
                  <Chip
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
                  </Chip>
                </div>

                {(props.showParking || props.showTransit || props.showRadar || communityReportsOn
                  || props.showCivic || props.showIncidents || props.showCameras
                  || props.transitHealth.status === "unavailable"
                  || props.radarHealth.status === "unavailable"
                  || props.incidentHealth.status === "unavailable"
                  || props.cameraHealth.status === "unavailable") && (
                  <div className="dock-layer-status-list" role="status" aria-live="polite">
                    {props.showParking && (
                      <p className="dock-layer-status">
                        <strong>Parking</strong> · {props.parkingCount} downtown garages. Tap one for availability and directions.
                      </p>
                    )}
                    {props.transitHealth.status === "unavailable" ? (
                      <p className="dock-layer-status">
                        <strong>Transit</strong> · The county route feed is unavailable, so this layer is off.
                      </p>
                    ) : props.showTransit && (
                      <p className="dock-layer-status">
                        <strong>Transit</strong> · {props.transitHealth.count} mapped route segments from {props.transitHealth.source}. Tap a stop for arrivals or a vehicle for status.
                      </p>
                    )}
                    {props.radarHealth.status === "unavailable" ? (
                      <p className="dock-layer-status">
                        <strong>Radar</strong> · The latest RainViewer request failed. {props.showRadar
                          ? "Retrying automatically."
                          : "Turn Radar on to retry."}
                      </p>
                    ) : props.showRadar && (
                      <p className="dock-layer-status">
                        <strong>Radar</strong> · {props.radarHealth.status === "stale"
                          ? `Showing the last good frames${radarUpdate ? ` from ${radarUpdate}` : ""} while RainViewer retries.`
                          : props.radarHealth.status === "empty"
                          ? "No frames are available from RainViewer."
                          : radarClock
                          ? <>Latest frame <span className="font-mono">{radarClock}</span> Eastern. Radar runs a few minutes behind.</>
                          : "Loading the newest available frame…"}
                      </p>
                    )}
                    {communityReportsOn && (
                      <p className="dock-layer-status">
                        <strong>Community reports</strong> · {props.communityReportCount > 0
                          ? `${props.communityReportCount} reviewed, current report${props.communityReportCount === 1 ? "" : "s"}.`
                          : "No current reports."}
                      </p>
                    )}
                    {props.showCivic && (
                      <p className="dock-layer-status"><strong>Roads &amp; alerts</strong> · County-published issues and live traffic context.</p>
                    )}
                    {props.incidentHealth.status === "unavailable" ? (
                      <p className="dock-layer-status">
                        <strong>Incidents</strong> · The latest public dispatch request failed. {props.showIncidents
                          ? "Retrying automatically."
                          : "Turn Incidents on to retry."}
                      </p>
                    ) : props.showIncidents && (
                      <p className="dock-layer-status">
                        <strong>Incidents</strong> · {props.incidentHealth.status === "stale"
                          ? `Showing ${props.incidentHealth.count} incident${props.incidentHealth.count === 1 ? "" : "s"} from the last good update${incidentUpdate ? ` at ${incidentUpdate}` : ""}. The feed is retrying.`
                          : props.incidentHealth.status === "disabled"
                            ? "Loading the latest public incidents…"
                          : props.incidentHealth.status === "empty"
                          ? "No current public incidents in the latest FrederickScanner response."
                          : `${props.incidentHealth.count} current public incident${props.incidentHealth.count === 1 ? "" : "s"} from ${props.incidentHealth.source}.`} Medical and personal calls stay hidden.
                      </p>
                    )}
                    {props.cameraHealth.status === "unavailable" ? (
                      <p className="dock-layer-status">
                        <strong>Cameras</strong> · The latest Maryland CHART request failed. {props.showCameras
                          ? "Retrying automatically."
                          : "Turn Cameras on to retry."}
                      </p>
                    ) : props.showCameras && (
                      <p className="dock-layer-status">
                        <strong>Cameras</strong> · {props.cameraHealth.status === "stale"
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

                <button
                  type="button"
                  className="dock-reveal"
                  aria-label="More local layers"
                  onClick={() => setPane("localLayers")}
                >
                  <span className="dock-content-icon" aria-hidden>
                    <Trees className="h-[18px] w-[18px]" strokeWidth={2.1} />
                  </span>
                  <span className="dock-reveal-copy">
                    <strong>More local layers</strong>
                    <small>Trails, aerial photos, parks, history, and saved places</small>
                  </span>
                  <ChevronRight className="h-4 w-4" strokeWidth={2.2} aria-hidden />
                </button>
              </div>
            )}

            {/* ── LOCAL LAYERS — slower-changing exploration and personal
                lenses are one deliberate level below the live map controls.
                This keeps the first layer screen complete without a long
                mixed-purpose scroll. ── */}
            {pane === "localLayers" && (
              <div>
                <Sect>Explore Frederick</Sect>
                <div className="dock-chips">
                  {props.trailCount > 0 && (
                    <Chip
                      on={props.showTrails}
                      color="var(--app-positive)"
                      onClick={() => props.setShowTrails((v) => !v)}
                      count={props.trailCount}
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
                  {props.cemeteryCount > 0 && (
                    <Chip
                      on={props.showCemeteries}
                      color="var(--app-ink-2)"
                      onClick={() => props.setShowCemeteries((v) => !v)}
                      count={props.cemeteryCount}
                      title="Historic cemeteries from county records"
                    >
                      Cemeteries
                    </Chip>
                  )}
                  <Chip
                    on={props.showFireStations}
                    color="var(--app-cool)"
                    onClick={() => props.setShowFireStations((v) => !v)}
                    title="Frederick County fire & rescue companies from county GIS. Each pin is the station number, the root of its call signs"
                  >
                    Fire stations
                  </Chip>
                  <Chip
                    on={props.showCivicPlaces}
                    color="var(--app-cool)"
                    onClick={() => props.setShowCivicPlaces((v) => !v)}
                    title="County parks and public libraries from county GIS. Tap a pin for the address and, for libraries, the hours page"
                  >
                    Parks & libraries
                  </Chip>
                  {OVERLAYS.map((o) => (
                    <Chip
                      key={o.key}
                      on={props.activeOverlays.includes(o.key)}
                      color="var(--app-brand)"
                      disabled={!o.ready}
                      soon={!o.ready}
                      onClick={() => o.ready && props.toggleOverlay(o.key)}
                      title={o.ready ? o.sources : `${o.sources} (coming soon)`}
                    >
                      {o.label}
                    </Chip>
                  ))}
                </div>
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

                {(props.savedCount > 0 || props.fieldNotesCount > 0) && (
                  <>
                    <Sect>Yours</Sect>
                    <div className="dock-chips">
                      {props.savedCount > 0 && (
                        <Chip
                          on={props.showSavedOnly}
                          color="var(--app-brand)"
                          onClick={() => props.setShowSavedOnly((v) => !v)}
                          count={props.savedCount}
                          title="Show only the places you saved"
                        >
                          Saved
                        </Chip>
                      )}
                      {props.fieldNotesCount > 0 && (
                        <Chip
                          on={props.fieldNotesOnly}
                          color="var(--app-brand)"
                          onClick={() => props.setFieldNotesOnly((v) => !v)}
                          count={props.fieldNotesCount}
                          title="Only places with verified Field Notes: happy hour, a deal, parking, or an insider tip"
                        >
                          <NotebookPen className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
                          Field notes
                        </Chip>
                      )}
                    </div>
                  </>
                )}

                {/* The key — a field guide has a legend. Collapsed by
                    default so the panel stays low; read-only. */}
                <button
                  type="button"
                  className="dock-opennow"
                  data-on={keyOpen || undefined}
                  aria-expanded={keyOpen}
                  onClick={() => setKeyOpen((v) => !v)}
                >
                  Key
                  <span aria-hidden style={{ fontSize: 9, opacity: 0.7 }}>{keyOpen ? "▲" : "▼"}</span>
                </button>
                {keyOpen && (
                <div
                  className="grid grid-cols-2 gap-x-3 gap-y-1 px-1 pb-1"
                  role="list"
                  aria-label="Pin color key"
                >
                  {INTENTS.map((i) => (
                    <span
                      key={i.key}
                      role="listitem"
                      className="inline-flex items-center gap-1.5 text-[11.5px]"
                      style={{ color: "var(--app-ink-2)" }}
                    >
                      <span
                        aria-hidden
                        className="h-2 w-2 shrink-0 rounded-full"
                        style={{ background: i.color }}
                      />
                      {i.label}
                    </span>
                  ))}
                </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
