"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Baby, Beer, BusFront, Car, ChevronDown, ChevronRight, Church, Clock, Coffee, Droplets, Footprints, Heart, History, Hotel, Landmark, Layers3, LayoutGrid, LocateFixed, MoonStar, Music, NotebookPen, Palette, Search as SearchIcon, ShoppingBag, Tag, Toilet, Trees, Utensils, Waypoints, Wifi, Wine, X, Zap, type LucideIcon } from "lucide-react";
import { INTENTS } from "@/data/intents";
import { MUNICIPALITIES } from "@/data/municipalities";
import { AMENITY_GROUPS } from "./constants";
import { orderNeedsForHour } from "./needsOrder";
import { OVERLAYS, type OverlayKey } from "@/lib/overlays";
import type { BrowseDockInfo } from "./types";
import type { LngLat } from "@/lib/geo";
import type { SearchResult } from "@/lib/search/index";
import TimeScrubber from "./TimeScrubber";
import { haptic } from "@/lib/haptics";
import { parseScope, scopeTownSlug, setScope, subscribeScopeChange, SCOPE_PARAM, type Scope } from "@/lib/scope";
import { track } from "@/lib/track";
import { BRAND } from "@/lib/brand";
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

type MapNeed =
  | { kind: "intent"; key: string; label: string; Icon: LucideIcon; color: string }
  | { kind: "amenity"; key: string; label: string; Icon: LucideIcon; color: string }
  | { kind: "opennow"; label: string; Icon: LucideIcon; color: string }
  | { kind: "nearme"; label: string; Icon: LucideIcon; color: string }
  | { kind: "parking"; label: string; Icon: LucideIcon; color: string };

/** The handful of things most people open the map to find, surfaced as one-tap
 *  shortcuts ABOVE the full category grid. Mixes categories, the everyday
 *  amenities (restrooms, water, Wi-Fi, parking), open-now and near-me — so the
 *  common answer is instant, and a restroom is one tap, not four taps buried in
 *  a "Layers" tab. Colors are inlined intent/token hues (GL-paint parity). */
const TOP_NEEDS: ReadonlyArray<MapNeed> = [
  { kind: "opennow", label: "Open now", Icon: Clock, color: "var(--state-open)" },
  { kind: "nearme", label: "Near me", Icon: LocateFixed, color: "#285D73" },
  { kind: "intent", key: "coffee", label: "Coffee", Icon: Coffee, color: "#8B5A2B" },
  { kind: "intent", key: "eat", label: "Food", Icon: Utensils, color: BRAND.colors.brick },
  { kind: "amenity", key: "restroom", label: "Restrooms", Icon: Toilet, color: "#285D73" },
  { kind: "parking", label: "Parking", Icon: Car, color: "#285D73" },
  { kind: "intent", key: "outdoor", label: "Parks", Icon: Trees, color: "var(--app-brand-2)" },
  { kind: "amenity", key: "wifi", label: "Wi-Fi", Icon: Wifi, color: "#285D73" },
  { kind: "amenity", key: "water", label: "Water", Icon: Droplets, color: "#285D73" },
  { kind: "intent", key: "family", label: "Kids", Icon: Baby, color: BRAND.colors.ridge },
];

type MapSetupKey = "tonight" | "getting-around" | "trail-day" | "field-kit" | "frederick-stories";

/** Multi-layer Frederick views. These do not add another permanent control
 *  row: they live inside Layers and compose the existing filters in one tap.
 *  The map remains the answer; the panel closes as soon as a setup runs. */
const MAP_SETUPS: ReadonlyArray<{
  key: MapSetupKey;
  label: string;
  description: string;
  Icon: LucideIcon;
}> = [
  { key: "tonight", label: "Tonight", description: "See evening events with parking and transit.", Icon: MoonStar },
  { key: "getting-around", label: "Getting around", description: "See routes, incidents, parking, and cameras.", Icon: BusFront },
  { key: "trail-day", label: "Trail day", description: "See outdoor places with trails, parks, and radar.", Icon: Footprints },
  { key: "field-kit", label: "Field kit", description: "Find nearby restrooms, water, trash, seating, and bike help.", Icon: LocateFixed },
  { key: "frederick-stories", label: "Frederick stories", description: "See aerial photos, the county cemetery inventory, and covered bridges.", Icon: History },
];

/** The four filter groups. What is purely kinds of places; the map drapes
 *  (trails, transit, aerial, …) and the Yours lenses live together in Layers. */
type Pane = "what" | "when" | "where" | "discover" | "layers";
type PlaceReveal = "categories" | "amenities";

/** Where the camera is pointed, per the user's own choice in the Where
 *  pane. Camera moves only — Where NEVER filters what's on the map. */
type WhereSel =
  | { kind: "county" }
  | { kind: "nearme" }
  | { kind: "town"; slug: string; name: string };

const TOWN_ZOOM = 13.4;

/**
 * MapDock — ONE instrument for the /map browse surface, "maps-app" top
 * layout. Search and three decision controls stay at the top; map layers live
 * in a persistent horizontal rail so their state never disappears into a
 * menu. Deeper controls open as a bottom sheet on phones and a side tray on
 * desktop, leaving the map visible while the user compares layers.
 *
 *   - Places — kinds of places (the intent chips + the sub strip); the chip
 *              row up top is the one-tap shortcut into the same intents.
 *   - When   — Open now, the event windows, the day scrubber.
 *   - Where  — Find me, the towns, Whole county (camera only).
 *   - Layers — the map drapes (Trails, Transit, Roads & alerts,
 *              Amenities, Aerial photos, Cemeteries, Farmers markets…)
 *              plus the Yours lenses (Saved, Field notes) and the Key.
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

  // ── Layers pane: lenses + overlays ──
  savedCount: number;
  showSavedOnly: boolean;
  setShowSavedOnly: SetState<boolean>;
  fieldNotesCount: number;
  fieldNotesOnly: boolean;
  setFieldNotesOnly: SetState<boolean>;

  amenityCount: number;
  amenityGroups: Set<string>;
  setAmenityGroups: SetState<Set<string>>;

  civicAvailable: boolean;
  showCivic: boolean;
  setShowCivic: SetState<boolean>;
  transitCount: number;
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
  /** Newest radar frame's unix seconds — stamps "radar as of 9:42 PM" so
   *  minutes-old tiles are never mistaken for real time. */
  radarFrameEpoch: number | null;
  showIncidents: boolean;
  setShowIncidents: SetState<boolean>;
  showCameras: boolean;
  setShowCameras: SetState<boolean>;
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

  // ── Read this area: evidence-backed connections already in the viewport. ──
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

export default function MapDock(props: MapDockProps) {
  const { browse, onPaneOpenChange } = props;
  const router = useRouter();
  const pathname = usePathname() ?? "/map";
  const sp = useSearchParams();

  const [pane, setPane] = useState<Pane | null>(null);
  const [placeReveal, setPlaceReveal] = useState<PlaceReveal | null>(null);
  // Time-aware needs: lead with what this hour most likely needs (Eastern),
  // computed once per mount. The Open now / Near me anchors never move — only
  // the content tail reorders — so habits can form on the top controls.
  const [needsNow] = useState(() => {
    let hour: number;
    try {
      hour = Number(
        new Intl.DateTimeFormat("en-US", {
          timeZone: "America/New_York",
          hour: "numeric",
          hourCycle: "h23",
        }).format(new Date()),
      );
    } catch {
      hour = new Date().getHours();
    }
    return orderNeedsForHour(TOP_NEEDS, hour);
  });
  // The Layers tab's Key grid is collapsed by default so the panel stays a
  // low strip; one small chip reveals it.
  const [keyOpen, setKeyOpen] = useState(false);
  const [whereSel, setWhereSel] = useState<WhereSel>({ kind: "county" });
  // Focus management for the drop-down panel: focus lands inside the panel
  // when it OPENS, and the trigger (the Filters button) is restored on close.
  const paneRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const restoreRef = useRef<HTMLElement | null>(null);

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

  const closePane = () => {
    setPane(null);
    setPlaceReveal(null);
    restoreRef.current?.focus?.();
  };

  useEffect(() => {
    const focusMapSearch = () => {
      consumeFindRequest("map");
      setPane(null);
      setPlaceReveal(null);
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

  // ── URL writes: the EXISTING params, via replace so chip taps don't
  //    stack history entries. ──
  const setParams = (mutate: (q: URLSearchParams) => void) => {
    const q = new URLSearchParams(sp?.toString() ?? "");
    mutate(q);
    const s = q.toString();
    router.replace(s ? `${pathname}?${s}` : pathname, { scroll: false });
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
      if (browse.musicTonight) q.delete("music");
      else q.set("music", "tonight");
    });
  };
  // One tap, the whole "what's good right now near me" question: open
  // places + the live event window + fly to the device fix. Deliberately
  // does NOT stack the deals filter (that would collapse the map to a
  // handful of pins); deals stay one explicit tap away.
  const goRightNow = () => {
    haptic("light");
    track("map_dock", { pane: "when", pick: "right-now" });
    setParams((q) => {
      q.set("open", "now");
      q.set("t", "now");
    });
    props.goNearMe();
  };
  const pickWindow = (k: string) => {
    haptic("light");
    setParams((q) => {
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

  // Layer drapes, in a stable order (drapes first, then Yours lenses) so
  // the Layers readout's lead word doesn't jump as toggles flip.
  const layerBits: string[] = [];
  if (props.amenityGroups.size > 0) layerBits.push("Amenities");
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
    timeMode: browse.timeMode,
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

  const line = countLine({
    places: props.placeCount,
    events: props.eventCount,
    closingSoon: props.closingSoonCount,
    scrubHour: props.scrubHour,
  });

  const clearAll = () => {
    haptic("light");
    track("map_dock", { pane: "clear", pick: "all" });
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
  };

  const runSetup = (key: MapSetupKey) => {
    haptic("light");
    track("map_setup", { setup: key });

    // A setup is a deliberate complete view, not another handful of toggles
    // layered onto an unknown previous state. Area/camera stay put unless the
    // user chose Field kit, whose promise is explicitly nearby utility.
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

    const wantedOverlays: OverlayKey[] =
      key === "trail-day" ? ["parks"]
      : key === "frederick-stories" ? ["bridges"]
      : [];
    for (const overlay of OVERLAYS) {
      const isOn = props.activeOverlays.includes(overlay.key);
      const shouldBeOn = wantedOverlays.includes(overlay.key);
      if (isOn !== shouldBeOn) props.toggleOverlay(overlay.key);
    }

    if (key === "tonight") {
      props.setShowTransit(true);
      props.setShowParking(true);
    } else if (key === "getting-around") {
      props.setShowCivic(true);
      props.setShowTransit(true);
      props.setShowParking(true);
      props.setShowIncidents(true);
      props.setShowCameras(true);
    } else if (key === "trail-day") {
      props.setShowTrails(true);
      props.setShowRadar(true);
      props.setShowCivicPlaces(true);
      props.setAmenityGroups(new Set(["water", "safety"]));
    } else if (key === "field-kit") {
      props.setAmenityGroups(new Set([
        "restroom", "water", "trash", "dog", "wifi", "outlet", "bike", "seating",
      ]));
      setWhereSel({ kind: "nearme" });
      setScope("nearme");
    } else {
      props.setShowAerial(true);
      props.setShowCemeteries(true);
    }

    setParams((q) => {
      for (const param of ["intent", "sub", "open", "deals", "music", "t", "amenity", "show", "layers"]) {
        q.delete(param);
      }
      if (key === "tonight") q.set("t", "tonight");
      if (key === "trail-day") q.set("intent", "outdoor");
      if (key === "field-kit") q.set(SCOPE_PARAM, "nearme");
      if (wantedOverlays.length > 0) q.set("layers", wantedOverlays.join(","));
    });
  };

  const togglePane = (next: Pane) => {
    haptic("light");
    if (pane === next) {
      closePane();
      return;
    }
    if (pane === null) restoreRef.current = document.activeElement as HTMLElement | null;
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

  const paneTitle =
    pane === "what" ? "Kinds of places"
    : pane === "when" ? "Time"
    : pane === "where" ? "Area"
    : pane === "discover" ? "Read this area"
    : pane === "layers" ? "Map layers"
    : "";

  // The Most-needed shortcuts unify categories, amenities, open-now and near-me
  // under "what do you need", so the common answer never requires tab-hopping.
  const isNeedOn = (n: MapNeed): boolean =>
    n.kind === "intent" ? browse.intentKey === n.key
    : n.kind === "amenity" ? props.amenityGroups.has(n.key)
    : n.kind === "opennow" ? browse.openNow
    : n.kind === "parking" ? props.showParking
    : whereSel.kind === "nearme";
  const runNeed = (n: MapNeed) => {
    haptic("light");
    if (n.kind === "intent") pickIntent(browse.intentKey === n.key ? null : n.key);
    else if (n.kind === "opennow") toggleOpenNow();
    else if (n.kind === "nearme") props.goNearMe();
    else if (n.kind === "parking") props.setShowParking((v) => !v);
    else
      props.setAmenityGroups((prev) => {
        const next = new Set(prev);
        if (next.has(n.key)) next.delete(n.key);
        else next.add(n.key);
        return next;
      });
    closePane();
  };

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

  return (
    <>
      <div
        className={`dock${pane ? " dock-open" : ""}`}
        data-map-dock
      >
        {/* ── The top control bar: search row + a Filters / view-toggle bar,
            pinned to the top of the map. ── */}
        <div className="dock-head">
          {/* Search, folded in as the top row — the map's ONE search. */}
          <div className="dock-search-wrap">
            <div className="dock-search" role="search">
              <SearchIcon aria-hidden className="h-4 w-4 shrink-0" strokeWidth={2.2} />
              <input
                id="map-search-input"
                ref={searchInputRef}
                type="search"
                value={props.q}
                onChange={(e) => props.setQ(e.target.value)}
                // The placeholder is the manual: concrete examples teach the
                // box's range (categories, outdoors, towns) at the exact
                // moment the eye is on it. No questions promised here — the
                // Ask handoff isn't wired to this box, and a signifier must
                // not overpromise.
                placeholder="Find coffee, a trail, a town"
                aria-label="Search this map"
                className="dock-search-input"
              />
              {props.q.trim().length > 0 ? (
                <button
                  type="button"
                  className="dock-search-clear tap-44"
                  onClick={() => props.setQ("")}
                  aria-label="Clear search"
                >
                  <X className="h-4 w-4" strokeWidth={2.4} aria-hidden />
                </button>
              ) : (
                <span aria-hidden className="dock-search-kbd">Find</span>
              )}
            </div>
            {props.searchMatches.length > 0 && (
              <ul className="dock-search-results">
                {props.searchMatches.map((r) => {
                  const dot =
                    r.type === "event" ? "var(--app-brand, #B5462B)"
                    : r.type === "municipality" ? "var(--app-cool, #5C8AA8)"
                    : r.type === "action" ? "var(--app-brand, #B5462B)"
                    : "var(--app-ink-3, #7A828C)";
                  return (
                    <li key={r.id}>
                      <button type="button" onClick={() => props.pickSearch(r)} className="dock-search-result">
                        <span aria-hidden className="dock-search-result-dot" style={{ background: dot }} />
                        <span className="dock-search-result-text">
                          <span className="dock-search-result-title">{r.title}</span>
                          <span className="dock-search-result-sub">{r.subtitle}</span>
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          {/* Three stable questions. Layers use the persistent rail below so
              the map state remains visible and removable at all times. */}
          <div className="dock-actions" role="group" aria-label="Map controls">
            <button
              type="button"
              className="dock-action tap-44"
              data-on={Boolean(intent) || undefined}
              aria-expanded={pane === "what"}
              aria-controls="dock-pane"
              onClick={() => togglePane("what")}
            >
              <LayoutGrid className="h-4 w-4 shrink-0" strokeWidth={2.2} aria-hidden />
              <span>{intent?.label ?? "Places"}</span>
            </button>
            <button
              type="button"
              className="dock-action tap-44"
              data-on={timeActive || undefined}
              aria-expanded={pane === "when"}
              aria-controls="dock-pane"
              onClick={() => togglePane("when")}
            >
              <Clock className="h-4 w-4 shrink-0" strokeWidth={2.2} aria-hidden />
              <span>Time</span>
            </button>
            <button
              type="button"
              className="dock-action tap-44"
              data-on={whereSel.kind !== "county" || undefined}
              aria-expanded={pane === "where"}
              aria-controls="dock-pane"
              onClick={() => togglePane("where")}
            >
              <LocateFixed className="h-4 w-4 shrink-0" strokeWidth={2.2} aria-hidden />
              <span>Area</span>
            </button>
          </div>
        </div>

        {/* A persistent layer rail: common layers are always one tap away;
            less-common active layers stay here until the user turns them off. */}
        <div className="dock-layer-rail" role="group" aria-label="Map layer controls">
          <button
            type="button"
            className="dock-layer-more dock-read-area tap-44"
            data-on={pane === "discover" || Boolean(props.selectedDiscoveryId) || undefined}
            aria-expanded={pane === "discover"}
            aria-controls="dock-pane"
            onClick={() => togglePane("discover")}
          >
            <Waypoints className="h-4 w-4" strokeWidth={2.2} aria-hidden />
            Read this area
            {props.discoveries.length > 0 && <span className="dock-layer-count">{props.discoveries.length}</span>}
          </button>
          <button
            type="button"
            className="dock-layer-more tap-44"
            data-on={pane === "layers" || undefined}
            aria-expanded={pane === "layers"}
            aria-controls="dock-pane"
            onClick={() => togglePane("layers")}
          >
            <Layers3 className="h-4 w-4" strokeWidth={2.2} aria-hidden />
            Layers
            {visibleLayerCount > 0 && <span className="dock-layer-count">{visibleLayerCount}</span>}
          </button>
          <button
            type="button"
            className="dock-layer-toggle tap-44"
            data-on={props.showTransit || undefined}
            aria-pressed={props.showTransit}
            onClick={() => props.setShowTransit((value) => !value)}
          >
            <span className="dock-layer-dot" aria-hidden />
            Transit
          </button>
          {props.parkingCount > 0 && (
            <button
              type="button"
              className="dock-layer-toggle tap-44"
              data-on={props.showParking || undefined}
              aria-pressed={props.showParking}
              onClick={() => props.setShowParking((value) => !value)}
            >
              <span className="dock-layer-dot" aria-hidden />
              Parking
            </button>
          )}
          <button
            type="button"
            className="dock-layer-toggle tap-44"
            data-on={props.showRadar || undefined}
            aria-pressed={props.showRadar}
            onClick={() => props.setShowRadar((value) => !value)}
          >
            <span className="dock-layer-dot" aria-hidden />
            Radar
          </button>

          {props.amenityGroups.size > 0 && (
            <button type="button" className="dock-layer-toggle tap-44" data-on aria-label="Hide all public amenities" onClick={() => props.setAmenityGroups(new Set())}>
              <span className="dock-layer-dot" aria-hidden />
              Amenities
              <span className="dock-layer-count">{props.amenityGroups.size}</span>
            </button>
          )}
          {props.showCivic && (
            <button type="button" className="dock-layer-toggle tap-44" data-on aria-pressed onClick={() => props.setShowCivic(false)}><span className="dock-layer-dot" aria-hidden />Roads &amp; alerts</button>
          )}
          {props.showTrails && (
            <button type="button" className="dock-layer-toggle tap-44" data-on aria-pressed onClick={() => props.setShowTrails(false)}><span className="dock-layer-dot" aria-hidden />Trails</button>
          )}
          {props.showAerial && (
            <button type="button" className="dock-layer-toggle tap-44" data-on aria-pressed onClick={() => props.setShowAerial(false)}><span className="dock-layer-dot" aria-hidden />Aerial</button>
          )}
          {props.showCemeteries && (
            <button type="button" className="dock-layer-toggle tap-44" data-on aria-pressed onClick={() => props.setShowCemeteries(false)}><span className="dock-layer-dot" aria-hidden />Cemeteries</button>
          )}
          {props.showIncidents && (
            <button type="button" className="dock-layer-toggle tap-44" data-on aria-pressed onClick={() => props.setShowIncidents(false)}><span className="dock-layer-dot" aria-hidden />Incidents</button>
          )}
          {props.showCameras && (
            <button type="button" className="dock-layer-toggle tap-44" data-on aria-pressed onClick={() => props.setShowCameras(false)}><span className="dock-layer-dot" aria-hidden />Cameras</button>
          )}
          {props.showFireStations && (
            <button type="button" className="dock-layer-toggle tap-44" data-on aria-pressed onClick={() => props.setShowFireStations(false)}><span className="dock-layer-dot" aria-hidden />Fire stations</button>
          )}
          {props.showCivicPlaces && (
            <button type="button" className="dock-layer-toggle tap-44" data-on aria-pressed onClick={() => props.setShowCivicPlaces(false)}><span className="dock-layer-dot" aria-hidden />Parks &amp; libraries</button>
          )}
          {props.showSavedOnly && (
            <button type="button" className="dock-layer-toggle tap-44" data-on aria-pressed onClick={() => props.setShowSavedOnly(false)}><span className="dock-layer-dot" aria-hidden />Saved</button>
          )}
          {props.fieldNotesOnly && (
            <button type="button" className="dock-layer-toggle tap-44" data-on aria-pressed onClick={() => props.setFieldNotesOnly(false)}><span className="dock-layer-dot" aria-hidden />Field notes</button>
          )}
          {props.activeOverlays.map((key) => {
            const overlay = OVERLAYS.find((item) => item.key === key);
            if (!overlay) return null;
            return (
              <button key={key} type="button" className="dock-layer-toggle tap-44" data-on aria-pressed onClick={() => props.toggleOverlay(key)}>
                <span className="dock-layer-dot" aria-hidden />
                {overlay.label}
              </button>
            );
          })}

        </div>

        {/* The deeper controls are a bottom sheet on phones and a side tray on
            desktop. They never replace or dim the map. */}
        <div
          className="dock-pane"
          id="dock-pane"
          role="region"
          aria-label={paneTitle}
          aria-hidden={pane === null}
          // See EventsBoardDock: inert keeps the collapsed panel's controls
          // out of tab order + the a11y tree (2026-07 P3).
          inert={pane === null}
          ref={paneRef}
          onKeyDown={onPaneKeyDown}
        >
          <div className="dock-pane-scroll">
            <div className="dock-pane-head">
              <h2 className="dock-pane-title">{paneTitle}</h2>
              <button type="button" className="dock-done" onClick={closePane}>
                Done
              </button>
            </div>

            {/* The living mono count line — also the polite live region. */}
            <div className="dock-countbar">
              <div className="dock-countline" aria-live="polite">
                {pane === "discover"
                  ? `${props.discoveries.length} explained connection${props.discoveries.length === 1 ? "" : "s"} in this view.`
                  : line}
                {pane !== "discover" && (
                  <span className="sr-only">
                    {` Showing ${what.main}, ${when.text}, ${whereText}, ${layers.main.toLowerCase()}.`}
                  </span>
                )}
              </div>
              {pane !== "discover" && (pane === "layers" ? visibleLayerCount > 0 : dirty) && (
                <button
                  type="button"
                  className="dock-clear tap-44"
                  onClick={pane === "layers" ? clearLayers : clearAll}
                  aria-label={pane === "layers" ? "Hide all map layers" : "Clear all filters"}
                >
                  <X className="h-3.5 w-3.5" strokeWidth={2.6} aria-hidden />
                  <span>{pane === "layers" ? "Clear layers" : "Reset"}</span>
                </button>
              )}
            </div>

            {/* ── PLACES — common decisions first. The old panel rendered ten
                quick needs, every category, subcategories, and every public
                amenity at once. Keep the depth, but reveal the two catalogs
                only after the user asks for them. A selection closes the panel
                so the map immediately becomes the answer again. */}
            {pane === "what" && (
              <div>
                <Sect>Quick find</Sect>
                <div className="dock-needs">
                  {needsNow.slice(0, 6).map((n) => {
                    const on = isNeedOn(n);
                    return (
                      <button
                        key={n.kind + ("key" in n ? n.key : n.label)}
                        type="button"
                        className="dock-need"
                        data-on={on || undefined}
                        aria-pressed={on}
                        onClick={() => runNeed(n)}
                        style={{ "--c": n.color } as React.CSSProperties}
                      >
                        <span aria-hidden className="dock-need-ic">
                          <n.Icon className="h-[15px] w-[15px]" strokeWidth={2} />
                        </span>
                        {n.label}
                      </button>
                    );
                  })}
                </div>
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
                {props.amenityCount > 0 && (
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
                        {AMENITY_GROUPS.filter((group) => !group.comingSoon).length}
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
                        items={AMENITY_GROUPS.filter((g) => !g.comingSoon).map((g) => ({
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
                {/* The one-tap answer to the whole pane: open places, live
                    events, centered on you. Everything below refines it. */}
                <button
                  type="button"
                  className="dock-opennow"
                  onClick={goRightNow}
                >
                  <Zap className="h-4 w-4" strokeWidth={2.4} aria-hidden />
                  Right now, near me
                </button>
                <Sect>Places</Sect>
                <button
                  type="button"
                  className="dock-opennow"
                  data-on={browse.openNow || undefined}
                  aria-pressed={browse.openNow}
                  onClick={toggleOpenNow}
                >
                  <Clock className="h-4 w-4" strokeWidth={2.4} aria-hidden />
                  Open now
                  <span className="dock-opennow-n">{browse.openNowCount.toLocaleString("en-US")}</span>
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

                <Sect>Events</Sect>
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
                <div className="dock-chips">
                  {TIME_WINDOWS.map((w) => (
                    <Chip
                      key={w.key}
                      on={browse.timeMode === w.key}
                      color="var(--app-brand)"
                      onClick={() => pickWindow(w.key)}
                      count={browse.eventWindowCounts[w.key] ?? 0}
                    >
                      {w.label}
                    </Chip>
                  ))}
                </div>

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

            {/* ── READ THIS AREA — synthesized, source-visible connections.
                This is not another layer catalog. Each card names the literal
                relationship it found; selecting one closes the tray and draws
                only that small constellation on the map. ── */}
            {pane === "discover" && (
              <div className="dock-discoveries">
                <p className="dock-discovery-intro">
                  Radius connects facts that are already on this map. Every finding below can show why it appeared.
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
                    <small>Move closer to a town or event, then read the area again.</small>
                  </div>
                )}
              </div>
            )}

            {/* ── LAYERS — the map drapes + Yours lenses + the Key, folded in
                from the old bottom-left tray. ── */}
            {pane === "layers" && (
              <div>
                <Sect>Quick setups</Sect>
                <div className="dock-setups" role="group" aria-label="Frederick map setups">
                  {MAP_SETUPS.map(({ key, label, description, Icon }) => (
                    <button
                      key={key}
                      type="button"
                      className="dock-setup"
                      onClick={() => runSetup(key)}
                    >
                      <span aria-hidden className="dock-setup-icon">
                        <Icon className="h-4 w-4" strokeWidth={2.1} />
                      </span>
                      <span className="dock-setup-copy">
                        <strong>{label}</strong>
                        <small>{description}</small>
                      </span>
                    </button>
                  ))}
                </div>

                {/* Map drapes + conditions only. Public amenities (restrooms,
                    water, Wi-Fi, …) moved to the Places tab, where finding one
                    is a first-class action rather than a layer toggle. */}
                <Sect>Map layers</Sect>
                <div className="dock-chips">
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
                    on={props.showTransit}
                    color="var(--app-cool)"
                    onClick={() => props.setShowTransit((v) => !v)}
                    count={props.transitCount > 0 ? props.transitCount : null}
                    title="TransIT bus routes and live buses"
                  >
                    Transit
                  </Chip>
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
                    on={props.showRadar}
                    color="var(--app-cool)"
                    onClick={() => props.setShowRadar((v) => !v)}
                    title="Animated precipitation radar from RainViewer. Frames run a few minutes behind real time"
                  >
                    Radar
                  </Chip>
                  <Chip
                    on={props.showIncidents}
                    color="var(--app-brand)"
                    onClick={() => props.setShowIncidents((v) => !v)}
                    title="Live public incidents from the FredScanner dispatch feed (crashes, wires down, fires). Medical and personal calls are never shown"
                  >
                    Incidents
                  </Chip>
                  <Chip
                    on={props.showCameras}
                    color="var(--app-cool)"
                    onClick={() => props.setShowCameras((v) => !v)}
                    title="Maryland CHART traffic cameras on I-70, US-15, US-340 and other main routes. Tap a camera to watch its live feed"
                  >
                    Cameras
                  </Chip>
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
                {radarClock && (
                  <p className="dock-hint" role="status">
                    Radar as of <span className="font-mono">{radarClock}</span> Eastern.
                    Frames arrive a few minutes behind real time.
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
