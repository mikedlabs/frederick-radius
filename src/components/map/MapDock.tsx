"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Clock, List, LocateFixed, Map as MapIcon, Music, NotebookPen, Search as SearchIcon, SlidersHorizontal, Tag, X, Zap } from "lucide-react";
import { INTENTS } from "@/data/intents";
import { MUNICIPALITIES } from "@/data/municipalities";
import { AMENITY_GROUPS } from "./constants";
import { OVERLAYS, type OverlayKey } from "@/lib/overlays";
import type { BrowseDockInfo } from "./types";
import type { LngLat } from "@/lib/geo";
import type { SearchResult } from "@/lib/search/index";
import TimeScrubber from "./TimeScrubber";
import { haptic } from "@/lib/haptics";
import { parseScope, scopeTownSlug, setScope, subscribeScopeChange, SCOPE_PARAM, type Scope } from "@/lib/scope";
import { track } from "@/lib/track";
import {
  TIME_WINDOWS,
  countLine,
  dockDirty,
  layersCaption,
  whatCaption,
  whenCaption,
} from "./dockCaption";

type SetState<T> = (updater: T | ((prev: T) => T)) => void;

/** The four filter groups, now the panel's sub-tabs. What is purely KINDS
 *  OF PLACES; the map drapes (trails, transit, aerial, …) and the Yours
 *  lenses live together on the Layers tab. */
type Pane = "what" | "when" | "where" | "layers";

/** Where the camera is pointed, per the user's own choice in the Where
 *  pane. Camera moves only — Where NEVER filters what's on the map. */
type WhereSel =
  | { kind: "county" }
  | { kind: "nearme" }
  | { kind: "town"; slug: string; name: string };

const TOWN_ZOOM = 13.4;

/**
 * MapDock — ONE instrument for the /map browse surface, "maps-app" top
 * layout. A slim control bar is pinned at the TOP of the map: the folded-in
 * search field (row 1), then an always-visible category chip row (row 2) —
 * an "All" chip plus one chip per intent, horizontally scrolling, the
 * primary "pick a kind of place" action made a single tap (Google/Apple-Maps
 * pattern). Pinned to that row's right (never scrolling): a compact "More"
 * button — carrying the count of the When/Where/Layers filters still folded
 * behind it — and the Map ↔ list toggle. "More" drops a panel DOWN over the
 * scrim-dimmed map, and that panel carries four sub-tabs — Places · When ·
 * Where · Layers — with a slim mono count line and a Done / clear control.
 * The category chips are the shortcut; the Places tab is the same list plus
 * its sub-intents (the depth), so nothing is lost by surfacing them. The
 * bottom of the map is left clean: only the pins, the zoom cluster, and the
 * locate FAB.
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

  // ── Map ↔ list toggle ──
  listView: boolean;
  onToggleList: () => void;

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

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])';

export default function MapDock(props: MapDockProps) {
  const { browse, onPaneOpenChange } = props;
  const router = useRouter();
  const pathname = usePathname() ?? "/map";
  const sp = useSearchParams();

  const [pane, setPane] = useState<Pane | null>(null);
  const [amenExpanded, setAmenExpanded] = useState(() => props.amenityGroups.size > 0);
  // The Layers tab's Key grid is collapsed by default so the panel stays a
  // low strip; one small chip reveals it.
  const [keyOpen, setKeyOpen] = useState(false);
  const [whereSel, setWhereSel] = useState<WhereSel>({ kind: "county" });
  // Focus management for the drop-down panel: focus lands inside the panel
  // when it OPENS, and the trigger (the Filters button) is restored on close.
  const paneRef = useRef<HTMLDivElement>(null);
  const restoreRef = useRef<HTMLElement | null>(null);
  // Tracks whether the panel was already open, so switching sub-tabs does not
  // yank focus off the tab the user just pressed (focus only follows an open).
  const wasOpenRef = useRef(false);

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

  // Focus into the panel when it opens (first focusable), so the drawer is
  // reachable by keyboard the moment it drops down. Switching sub-tabs keeps
  // focus where the user pressed.
  useEffect(() => {
    const wasClosed = !wasOpenRef.current;
    wasOpenRef.current = pane !== null;
    if (pane === null || !wasClosed) return;
    const first = paneRef.current?.querySelector<HTMLElement>(FOCUSABLE);
    first?.focus();
  }, [pane]);

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
  };
  const pickSub = (key: string | null) => {
    haptic("light");
    setParams((q) => {
      if (key && browse.subKey !== key) q.set("sub", key);
      else q.delete("sub");
    });
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
    (props.showCameras ? 1 : 0);

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

  // The "More" button's count: how many independent filters are on BEHIND
  // More. The category (intent) is now surfaced as a lit chip in the top row,
  // so it is deliberately excluded here — the badge counts only the
  // When/Where/Layers depth still folded away (a sub-intent is a refinement
  // of its intent, so it never adds on its own, matching the dirty flag).
  const moreCount =
    (browse.openNow ? 1 : 0) +
    (browse.dealsOn ? 1 : 0) +
    (browse.musicTonight ? 1 : 0) +
    (browse.timeModeExplicit ? 1 : 0) +
    (props.scrubHour != null ? 1 : 0) +
    lensLabels.length +
    layerCount +
    (whereSel.kind !== "county" ? 1 : 0);

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
    props.setShowSavedOnly(false);
    props.setFieldNotesOnly(false);
    props.onAerialSeason("all");
    props.setScrubHour(null);
    for (const k of [...props.activeOverlays]) props.toggleOverlay(k);
    setAmenExpanded(false);
    setWhereSel({ kind: "county" });
    setScope("county");
    setPane(null);
    router.replace(pathname, { scroll: false });
  };

  const closePane = () => {
    setPane(null);
    restoreRef.current?.focus?.();
  };
  // The "More" button: open the panel when closed, close it when any tab is
  // open. Opens to the When tab now that the categories (the Places tab's
  // headline) are surfaced as the top-row chip row — More is the shortcut to
  // the depth that is NOT already on screen.
  const toggleFilters = () => {
    haptic("light");
    if (pane !== null) {
      closePane();
      return;
    }
    restoreRef.current = document.activeElement as HTMLElement | null;
    setPane("when");
  };
  // Switch sub-tabs while the panel stays open (the trigger to restore was
  // captured on the original open).
  const selectTab = (p: Pane) => {
    haptic("light");
    setPane(p);
  };

  // Esc closes the panel; Tab is trapped within it while open.
  const onPaneKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      e.stopPropagation();
      closePane();
      return;
    }
    const host = paneRef.current;
    if (e.key !== "Tab" || !host) return;
    const nodes = Array.from(
      host.querySelectorAll<HTMLElement>(FOCUSABLE),
    ).filter((n) => n.offsetParent !== null);
    if (nodes.length === 0) return;
    const first = nodes[0];
    const last = nodes[nodes.length - 1];
    const active = document.activeElement;
    if (e.shiftKey && active === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && active === last) {
      e.preventDefault();
      first.focus();
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
    : pane === "when" ? "When"
    : pane === "where" ? "Where"
    : pane === "layers" ? "Map layers"
    : "";

  return (
    <>
      {/* Scrim — dims the map; a tap closes the open panel. */}
      <div
        className={`dock-scrim${pane ? " on" : ""}`}
        onClick={closePane}
        aria-hidden
      />

      <div
        className={`dock${pane ? " dock-open" : ""}`}
        data-map-dock
      >
        {/* ── The top control bar: search row + a Filters / view-toggle bar,
            pinned to the top of the map. ── */}
        <div className="dock-head">
          {/* Row 1 — search plus two compact controls. More opens the
              When/Where/Layers panel; the toggle flips map/list. Both stay OFF
              the category row so the categories below get the full width. */}
          <div className="dock-topline">
            <div className="dock-search-wrap">
              <div className="dock-search" role="search">
                <SearchIcon aria-hidden className="h-4 w-4 shrink-0" strokeWidth={2.2} />
                <input
                  type="search"
                  value={props.q}
                  onChange={(e) => props.setQ(e.target.value)}
                  placeholder="Search this map"
                  aria-label="Search this map"
                  className="dock-search-input"
                />
                {props.q.trim().length > 0 && (
                  <button
                    type="button"
                    className="dock-search-clear tap-44"
                    onClick={() => props.setQ("")}
                    aria-label="Clear search"
                  >
                    <X className="h-4 w-4" strokeWidth={2.4} aria-hidden />
                  </button>
                )}
              </div>
              {props.searchMatches.length > 0 && (
                <ul className="dock-search-results">
                  {props.searchMatches.map((r) => {
                    const dot =
                      r.type === "event" ? "var(--app-brand-2, #2F5D50)"
                      : r.type === "municipality" ? "var(--app-cool, #5C8AA8)"
                      : r.type === "action" ? "var(--app-brand, #E14328)"
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
            <button
              type="button"
              className="dock-icbtn tap-44"
              data-on={moreCount > 0 || undefined}
              aria-expanded={pane !== null}
              aria-controls="dock-pane"
              aria-haspopup="dialog"
              aria-label="More filters: when, where, and layers"
              onClick={toggleFilters}
            >
              <SlidersHorizontal className="h-4 w-4" strokeWidth={2.2} aria-hidden />
              {moreCount > 0 && <span className="dock-icbtn-n">{moreCount}</span>}
            </button>
            <button
              type="button"
              className="dock-icbtn tap-44"
              aria-pressed={props.listView}
              aria-label={props.listView ? "Show the map" : "Show the list"}
              onClick={() => {
                haptic("light");
                track("map_dock", { pane: "view", pick: props.listView ? "map" : "list" });
                props.onToggleList();
              }}
            >
              {props.listView
                ? <MapIcon className="h-4 w-4" strokeWidth={2.2} aria-hidden />
                : <List className="h-4 w-4" strokeWidth={2.2} aria-hidden />}
            </button>
          </div>

          {/* Row 2 — the always-visible category row, now the full width of the
              bar so the categories actually show. "All" clears the intent; each
              chip writes the same ?intent= param as the Places tab. */}
          <div className="dock-cats-scroll" role="group" aria-label="Kinds of places">
            <Chip on={!browse.intentKey} onClick={() => pickIntent(null)} count={browse.everythingCount}>
              All
            </Chip>
            {INTENTS.map((i) => (
              <Chip
                key={i.key}
                on={browse.intentKey === i.key}
                color={i.color}
                onClick={() => pickIntent(i.key)}
                count={browse.intentCounts[i.key]}
                title={i.blurb}
              >
                {i.label}
              </Chip>
            ))}
          </div>
        </div>

        {/* ── The filter panel — drops DOWN from under the control bar over
            the scrim-dimmed map. Its four sub-tabs pick the group. ── */}
        <div
          className="dock-pane"
          id="dock-pane"
          role="dialog"
          aria-label={paneTitle}
          aria-hidden={pane === null}
          // See EventsBoardDock: inert keeps the collapsed panel's controls
          // out of tab order + the a11y tree (2026-07 P3).
          inert={pane === null}
          ref={paneRef}
          onKeyDown={onPaneKeyDown}
        >
          <div className="dock-pane-scroll">
            <div className="dock-tabs">
              <div className="dock-tablist" role="tablist" aria-label="Filter groups">
                <button
                  type="button"
                  role="tab"
                  aria-selected={pane === "what"}
                  className="dock-tab"
                  data-on={pane === "what" || undefined}
                  onClick={() => selectTab("what")}
                >
                  Places
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={pane === "when"}
                  className="dock-tab"
                  data-on={pane === "when" || undefined}
                  onClick={() => selectTab("when")}
                >
                  When
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={pane === "where"}
                  className="dock-tab"
                  data-on={pane === "where" || undefined}
                  onClick={() => selectTab("where")}
                >
                  Where
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={pane === "layers"}
                  className="dock-tab"
                  data-on={pane === "layers" || undefined}
                  onClick={() => selectTab("layers")}
                >
                  Layers
                </button>
              </div>
              <button type="button" className="dock-done" onClick={closePane}>
                Done
              </button>
            </div>

            {/* The living mono count line — also the polite live region. */}
            <div className="dock-countbar">
              <div className="dock-countline" aria-live="polite">
                {line}
                <span className="sr-only">
                  {` Showing ${what.main}, ${when.text}, ${whereText}, ${layers.main.toLowerCase()}.`}
                </span>
              </div>
              {dirty && (
                <button
                  type="button"
                  className="dock-clear tap-44"
                  onClick={clearAll}
                  aria-label="Clear all filters"
                >
                  <X className="h-4 w-4" strokeWidth={2.6} aria-hidden />
                </button>
              )}
            </div>

            {/* ── PLACES — kinds of places only ── */}
            {pane === "what" && (
              <div>
                <Sect>Kinds of places</Sect>
                <div className="dock-chips">
                  <Chip on={!intent} onClick={() => pickIntent(null)} count={browse.everythingCount}>
                    Everything
                  </Chip>
                  {INTENTS.map((i) => (
                    <Chip
                      key={i.key}
                      on={browse.intentKey === i.key}
                      color={i.color}
                      onClick={() => pickIntent(i.key)}
                      count={browse.intentCounts[i.key]}
                      title={i.blurb}
                    >
                      {i.label}
                    </Chip>
                  ))}
                </div>
                {intent?.subIntents && intent.subIntents.length > 0 && (
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
                      color="var(--app-brand-2)"
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

            {/* ── LAYERS — the map drapes + Yours lenses + the Key, folded in
                from the old bottom-left tray. ── */}
            {pane === "layers" && (
              <div>
                <Sect>Map layers</Sect>
                <div className="dock-chips">
                  {props.amenityCount > 0 && (
                    <Chip
                      on={props.amenityGroups.size > 0}
                      color="var(--app-cool)"
                      onClick={() => setAmenExpanded((v) => !v)}
                      ariaExpanded={amenExpanded}
                      count={props.amenityGroups.size > 0 ? props.amenityGroups.size : null}
                      title="Amenities: restrooms, Wi-Fi, EV charging, bike parking, picnic, playgrounds, water"
                    >
                      Amenities
                      <span aria-hidden style={{ fontSize: 9, opacity: 0.7 }}>
                        {amenExpanded ? "▲" : "▼"}
                      </span>
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
                {amenExpanded && props.amenityCount > 0 && (
                  <HeadRow
                    color="var(--app-cool)"
                    ariaLabel="Amenity kinds"
                    onPick={(k) =>
                      props.setAmenityGroups((prev) => {
                        const next = new Set(prev);
                        if (next.has(k)) next.delete(k);
                        else next.add(k);
                        return next;
                      })
                    }
                    items={AMENITY_GROUPS.filter((g) => !g.comingSoon).map((g) => ({
                      key: g.key,
                      label: g.label,
                      on: props.amenityGroups.has(g.key),
                      disabled: g.comingSoon === true,
                      soon: g.comingSoon === true,
                    }))}
                  />
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
