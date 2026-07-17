"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Clock, Layers as LayersIcon, List, LocateFixed, Map as MapIcon, Music, NotebookPen, Search as SearchIcon, Tag, X, Zap } from "lucide-react";
import { INTENTS } from "@/data/intents";
import { MUNICIPALITIES } from "@/data/municipalities";
import { AMENITY_GROUPS } from "./constants";
import { OVERLAYS, type OverlayKey } from "@/lib/overlays";
import type { BrowseDockInfo } from "./types";
import type { LngLat } from "@/lib/geo";
import type { SearchResult } from "@/lib/search/index";
import TimeScrubber from "./TimeScrubber";
import { haptic } from "@/lib/haptics";
import { getScope, parseScope, scopeTownSlug, setScope, subscribeScopeChange, SCOPE_PARAM } from "@/lib/scope";
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

/** The four caption tabs. What is now purely KINDS OF PLACES; the map
 *  drapes (trails, transit, aerial, …) and the Yours lenses split out
 *  into their own Layers tab. */
type Pane = "what" | "when" | "where" | "layers";

/** Where the camera is pointed, per the user's own choice in the Where
 *  pane. Camera moves only — Where NEVER filters what's on the map. */
type WhereSel =
  | { kind: "county" }
  | { kind: "nearme" }
  | { kind: "town"; slug: string; name: string };

/** Whole-county framing for the "Whole county" chip + clear-all. */
const COUNTY_VIEW: { center: [number, number]; zoom: number } = {
  center: [-77.41, 39.46],
  zoom: 9.6,
};
const TOWN_ZOOM = 13.4;

/**
 * MapDock — ONE instrument for the /map browse surface, v2. The whole
 * thing reads as: a folded-in search field, then a four-word caption
 * (What · When · Where · Layers) whose words are ≥44px tabs that drop a
 * pane DOWN over the scrim-dimmed map. The caption is the state readout,
 * the tab bar, and (via the single ×) the clear-all; a slim mono count
 * line and a map ↔ list toggle sit beneath it.
 *
 *   - What   — kinds of places (the intent chips + the sub strip).
 *   - When   — Open now, the event windows, the day scrubber.
 *   - Where  — Find me, the towns, Whole county (camera only).
 *   - Layers — the map drapes (Trails, Transit, Roads & alerts,
 *              Amenities, Aerial photos, Cemeteries, Farmers markets…)
 *              plus the Yours lenses (Saved, Field notes).
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

  // ── Map ↔ list toggle ──
  listView: boolean;
  onToggleList: () => void;

  /** Lets AppMap hide the zoom corner + mark the host while a pane is open. */
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
  const [whereSel, setWhereSel] = useState<WhereSel>({ kind: "county" });
  // Focus management for the top-sheet pane (mirrors the /events dock):
  // focus lands inside the pane on open, and the trigger is restored on close.
  const paneRef = useRef<HTMLDivElement>(null);
  // The Layers bottom sheet is its own dialog container (the pane row
  // dropped from four segs to three; Layers now lives at the map's foot
  // as a toggle-when-needed overlay — owner ask, 2026-07-17).
  const sheetRef = useRef<HTMLDivElement>(null);
  const restoreRef = useRef<HTMLElement | null>(null);

  // Match the readout to the scope that already seeded the map's camera.
  // localStorage is client-only, so this intentionally runs after hydration.
  useEffect(() => {
    const scope = parseScope(sp.get(SCOPE_PARAM)) ?? getScope();
    const applyReadout = (nextScope: ReturnType<typeof getScope>) => {
      if (nextScope === "nearme") {
        setWhereSel({ kind: "nearme" });
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
      else props.flyTo(COUNTY_VIEW.center, COUNTY_VIEW.zoom);
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

  // Focus into the pane when it opens (first focusable), so the drawer is
  // reachable by keyboard the moment it drops down.
  useEffect(() => {
    if (!pane) return;
    const host = pane === "layers" ? sheetRef.current : paneRef.current;
    const first = host?.querySelector<HTMLElement>(FOCUSABLE);
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
  };
  const goCounty = () => {
    haptic("light");
    setWhereSel({ kind: "county" });
    setScope("county");
  };
  // Explicit near-me tap (not the automatic fix-landed relabel, which must
  // not clobber a chosen town scope on every map mount): set the lens, then
  // run the map's own locate.
  const pickNearMe = () => {
    setWhereSel({ kind: "nearme" });
    setScope("nearme");
  };

  // ── Derived caption state ──
  const intent = browse.intentKey ? INTENTS.find((i) => i.key === browse.intentKey) : undefined;
  const sub = intent?.subIntents?.find((s) => s.key === browse.subKey);

  // Layer drapes, in a stable order (drapes first, then Yours lenses) so
  // the Layers caption's lead word doesn't jump as toggles flip.
  const layerBits: string[] = [];
  if (props.amenityGroups.size > 0) layerBits.push("Amenities");
  if (props.showCivic) layerBits.push("Roads & alerts");
  if (props.showTransit) layerBits.push("Transit");
  if (props.showTrails) layerBits.push("Trails");
  if (props.showAerial) layerBits.push("Aerial photos");
  if (props.showCemeteries) layerBits.push("Cemeteries");
  if (props.showParking) layerBits.push("Parking");
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
    (props.showParking ? 1 : 0);

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
  // "County", not "Whole county": the four equal .dock-seg columns clip the
  // longer default to "Whole cou…" at 390px, so the resting readout shipped
  // pre-truncated. The pane's chip keeps the full "Whole county" label.
  const whereText =
    whereSel.kind === "county" ? "County"
    : whereSel.kind === "nearme" ? "Near me"
    : whereSel.name;
  // Layers = the drapes + the Yours lenses, tallied into the fourth word.
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

  const line = countLine({
    places: props.placeCount,
    events: props.eventCount,
    closingSoon: props.closingSoonCount,
    scrubHour: props.scrubHour,
  });

  const whatColor = intent
    ? `color-mix(in srgb, ${intent.color} 82%, var(--app-ink))`
    : "var(--app-ink)";
  const whenColor =
    when.tone === "scrub" ? "var(--app-cool)"
    : when.tone === "open" ? "var(--app-positive)"
    : when.tone === "window" ? "var(--app-brand-2)"
    : "var(--app-ink)";
  const whereColor = whereSel.kind === "county" ? "var(--app-ink)" : "var(--app-cool)";
  // Text-safe gold (AA on the paper ground) so the inked Layers word is
  // legible; quiet ink when nothing's on.
  const layersColor = layers.active ? "var(--app-accent-press, #875C10)" : "var(--app-ink-3)";

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
  const toggle = (p: Pane) => {
    haptic("light");
    if (pane === p) {
      closePane();
    } else {
      restoreRef.current = document.activeElement as HTMLElement | null;
      setPane(p);
    }
  };

  // Esc closes the pane; Tab is trapped within it while open.
  const onPaneKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      e.stopPropagation();
      closePane();
      return;
    }
    const host = pane === "layers" ? sheetRef.current : paneRef.current;
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

  const paneTitle =
    pane === "what" ? "Kinds of places"
    : pane === "when" ? "When"
    : pane === "where" ? "Where"
    : pane === "layers" ? "Map layers"
    : "";

  return (
    <>
      {/* Scrim — dims the map; a tap closes the open pane. */}
      <div
        className={`dock-scrim${pane ? " on" : ""}`}
        onClick={closePane}
        aria-hidden
      />

      <div className={`dock${pane && pane !== "layers" ? " dock-open" : ""}`}>
        {/* ── The top-sheet pane — drops DOWN from under the caption bar
            over the scrim-dimmed map. ── */}
        <div
          className="dock-pane"
          id="dock-pane"
          role="dialog"
          aria-label={paneTitle}
          aria-hidden={pane === null || pane === "layers"}
          // See EventsBoardDock: inert keeps the collapsed pane's "Done"
          // button out of tab order + the a11y tree (2026-07 P3). Layers
          // renders in its own bottom sheet, so this dropdown stays inert
          // for it too.
          inert={pane === null || pane === "layers"}
          ref={paneRef}
          onKeyDown={onPaneKeyDown}
        >
          <div className="dock-pane-scroll">
            <div className="dock-pane-head">
              <span className="dock-pane-title font-serif">{paneTitle}</span>
              <button type="button" className="dock-done" onClick={closePane}>
                Done
              </button>
            </div>

            {/* ── WHAT — kinds of places only ── */}
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


          </div>
        </div>

        {/* ── The head: search row + caption tab bar + count line, pinned
            at the top of the map. ── */}
        <div className="dock-head">
          {/* Search, folded in as the top row — the map's ONE search. */}
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

          <div className="dock-readout" role="group" aria-label="Map view controls">
            <button
              type="button"
              aria-expanded={pane === "what"}
              aria-controls="dock-pane"
              aria-haspopup="dialog"
              className={`dock-seg dock-seg-what${pane === "what" ? " active" : ""}`}
              onClick={() => toggle("what")}
            >
              <span className="dock-seg-k">What</span>
              <span className="dock-seg-v" style={{ color: whatColor }}>
                {what.main}
              </span>
            </button>
            <button
              type="button"
              aria-expanded={pane === "when"}
              aria-controls="dock-pane"
              aria-haspopup="dialog"
              className={`dock-seg dock-seg-when${pane === "when" ? " active" : ""}`}
              onClick={() => toggle("when")}
            >
              <span className="dock-seg-k">When</span>
              <span className={`dock-seg-v${when.mono ? " mono" : ""}`} style={{ color: whenColor }}>
                {when.text}
              </span>
            </button>
            <button
              type="button"
              aria-expanded={pane === "where"}
              aria-controls="dock-pane"
              aria-haspopup="dialog"
              className={`dock-seg dock-seg-where${pane === "where" ? " active" : ""}`}
              onClick={() => toggle("where")}
            >
              <span className="dock-seg-k">Where</span>
              <span className="dock-seg-v" style={{ color: whereColor }}>
                {whereText}
              </span>
            </button>
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

          {/* The living caption — counts + a spoken state summary — and the
              map ↔ list toggle. */}
          <div className="dock-foot">
            <div className="dock-countline" aria-live="polite">
              {line}
              <span className="sr-only">
                {` Showing ${what.main}, ${when.text}, ${whereText}, ${layers.main.toLowerCase()}.`}
              </span>
            </div>
            <button
              type="button"
              className="dock-viewtoggle tap-44"
              aria-pressed={props.listView}
              onClick={() => {
                haptic("light");
                track("map_dock", { pane: "view", pick: props.listView ? "map" : "list" });
                props.onToggleList();
              }}
            >
              {props.listView ? (
                <>
                  <MapIcon className="h-3.5 w-3.5" strokeWidth={2.2} aria-hidden />
                  Map
                </>
              ) : (
                <>
                  <List className="h-3.5 w-3.5" strokeWidth={2.2} aria-hidden />
                  List
                </>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* ── Layers, at the map's foot: a quiet state pill you toggle when
          needed (owner ask, 2026-07-17). The pill READS the current state
          ("Base map", "Aerial +2") so it's the readout the caption seg
          used to be; tapping opens the bottom sheet. Hidden in list view
          and while its own sheet is up. ── */}
      {!props.listView && pane !== "layers" && (
        <button
          type="button"
          className="dock-lfab tap-44"
          aria-haspopup="dialog"
          aria-expanded={false}
          onClick={() => { haptic("light"); setPane("layers"); }}
        >
          <LayersIcon className="h-4 w-4" strokeWidth={2.2} aria-hidden />
          <span className="dock-lfab-v" style={{ color: layersColor }}>
            {layers.main}
            {layers.plus && <span className="dock-seg-plus"> {layers.plus}</span>}
          </span>
        </button>
      )}
      <div
        className={`dock-lsheet${pane === "layers" ? " open" : ""}`}
        role="dialog"
        aria-label="Map layers"
        aria-hidden={pane !== "layers"}
        inert={pane !== "layers"}
        ref={sheetRef}
        onKeyDown={onPaneKeyDown}
      >
        <div className="dock-pane-scroll">
          <div className="dock-pane-head">
            <span className="dock-pane-title font-serif">Map layers</span>
            <button type="button" className="dock-done" onClick={closePane}>
              Done
            </button>
          </div>

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

                {/* The key — a field guide has a legend. Read-only: what
                    each pin color means, in the What pane's own order. */}
                <Sect>Key</Sect>
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
              </div>
        </div>
      </div>
    </>
  );
}
