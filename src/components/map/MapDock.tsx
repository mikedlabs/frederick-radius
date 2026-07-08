"use client";

import { useEffect, useState, type ReactNode } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Clock, LocateFixed, NotebookPen, X } from "lucide-react";
import { INTENTS } from "@/data/intents";
import { MUNICIPALITIES } from "@/data/municipalities";
import { AMENITY_GROUPS } from "./constants";
import { OVERLAYS, type OverlayKey } from "@/lib/overlays";
import type { BrowseDockInfo } from "./types";
import type { LngLat } from "@/lib/geo";
import TimeScrubber from "./TimeScrubber";
import { haptic } from "@/lib/haptics";
import { track } from "@/lib/track";
import {
  TIME_WINDOWS,
  countLine,
  dockDirty,
  whatCaption,
  whenCaption,
} from "./dockCaption";

type SetState<T> = (updater: T | ((prev: T) => T)) => void;

type Pane = "what" | "when" | "where";

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
 * MapDock — ONE instrument for the /map browse surface. The collapsed
 * face is a caption that states the current view in three words
 * (What · When · Where); each word is a ≥44px tab that expands the dock
 * into its pane. The caption is the state readout, the tab bar, and
 * (via the single ×) the clear-all. Everything the map's controls had
 * accreted — intent chips, the sub-intent strip, the Layers drawer,
 * Open now, the ?t= windows, the time scrubber, the aerial season
 * chips, locate, towns — folds into the three panes.
 *
 * State split:
 *   - URL params (?intent/?sub/?open/?t) are written here via
 *     router.replace and interpreted by BrowseMapClient (the existing
 *     params — deep links keep working unchanged).
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

  // ── What pane: lenses + overlays ──
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

export default function MapDock(props: MapDockProps) {
  const { browse, onPaneOpenChange } = props;
  const router = useRouter();
  const pathname = usePathname() ?? "/map";
  const sp = useSearchParams();

  const [pane, setPane] = useState<Pane | null>(null);
  const [amenExpanded, setAmenExpanded] = useState(() => props.amenityGroups.size > 0);
  const [whereSel, setWhereSel] = useState<WhereSel>({ kind: "county" });

  // A landed location fix means the camera is on the user — the Where
  // word reads "Near me" until they choose somewhere else. Render-time
  // derived-state adjustment (not an effect): react to the fix arriving,
  // while a later town/county pick still wins.
  const [prevLoc, setPrevLoc] = useState(props.userLoc);
  if (props.userLoc !== prevLoc) {
    setPrevLoc(props.userLoc);
    if (props.userLoc) setWhereSel({ kind: "nearme" });
  }

  useEffect(() => {
    onPaneOpenChange(pane !== null);
  }, [pane, onPaneOpenChange]);

  // ── URL writes: the EXISTING params, via replace so chip taps don't
  //    stack history entries. BrowseMapClient re-reads them and hands
  //    the filtered pools back down — same loop the old chips drove.
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
  const pickWindow = (k: string) => {
    haptic("light");
    setParams((q) => {
      // Re-tapping the explicit window returns to the time-aware default.
      if (browse.timeModeExplicit && browse.timeMode === k) q.delete("t");
      else q.set("t", k);
    });
  };

  const goTown = (slug: string, name: string, center: [number, number]) => {
    haptic("light");
    setWhereSel({ kind: "town", slug, name });
    props.flyTo(center, TOWN_ZOOM);
  };
  const goCounty = () => {
    haptic("light");
    setWhereSel({ kind: "county" });
    props.flyTo(COUNTY_VIEW.center, COUNTY_VIEW.zoom);
  };

  // ── Derived caption state ──
  const intent = browse.intentKey ? INTENTS.find((i) => i.key === browse.intentKey) : undefined;
  const sub = intent?.subIntents?.find((s) => s.key === browse.subKey);

  const layerBits: string[] = [];
  if (props.amenityGroups.size > 0) layerBits.push("Amenities");
  if (props.showCivic) layerBits.push("Roads & alerts");
  if (props.showTransit) layerBits.push("Transit");
  if (props.showTrails) layerBits.push("Trails");
  if (props.showAerial) layerBits.push("Aerial photos");
  if (props.showCemeteries) layerBits.push("Cemeteries");
  for (const k of props.activeOverlays) {
    const o = OVERLAYS.find((x) => x.key === k);
    if (o) layerBits.push(o.label);
  }
  const layerCount =
    props.amenityGroups.size +
    props.activeOverlays.length +
    (props.showCivic ? 1 : 0) +
    (props.showTransit ? 1 : 0) +
    (props.showTrails ? 1 : 0) +
    (props.showAerial ? 1 : 0) +
    (props.showCemeteries ? 1 : 0);

  const lensLabels: string[] = [];
  if (props.showSavedOnly) lensLabels.push("Saved");
  if (props.fieldNotesOnly) lensLabels.push("Field notes");

  const what = whatCaption({
    lensLabels,
    intentLabel: intent?.label,
    subLabel: sub?.label,
    layerCount,
    singleLayerLabel: layerCount === 1 ? layerBits[0] : undefined,
  });
  const when = whenCaption({
    scrubHour: props.scrubHour,
    openNow: browse.openNow,
    timeMode: browse.timeMode,
  });
  const whereText =
    whereSel.kind === "county" ? "Whole county"
    : whereSel.kind === "nearme" ? "Near me"
    : whereSel.name;

  const dirty = dockDirty({
    intentActive: Boolean(intent),
    openNow: browse.openNow,
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
    : lensLabels.length > 0 || layerCount > 0
      ? "var(--app-brand-press)"
      : "var(--app-ink)";
  const whenColor =
    when.tone === "scrub" ? "var(--app-cool)"
    : when.tone === "open" ? "var(--app-positive)"
    : when.tone === "window" ? "var(--app-brand-2)"
    : "var(--app-ink)";
  const whereColor = whereSel.kind === "county" ? "var(--app-ink)" : "var(--app-cool)";

  const clearAll = () => {
    haptic("light");
    track("map_dock", { pane: "clear", pick: "all" });
    // Client-owned layers/lenses off…
    props.setAmenityGroups(new Set());
    props.setShowCivic(false);
    props.setShowTransit(false);
    props.setShowTrails(false);
    props.setShowAerial(false);
    props.setShowCemeteries(false);
    props.setShowSavedOnly(false);
    props.setFieldNotesOnly(false);
    props.onAerialSeason("all");
    props.setScrubHour(null);
    for (const k of [...props.activeOverlays]) props.toggleOverlay(k);
    setAmenExpanded(false);
    // …the camera home…
    setWhereSel({ kind: "county" });
    props.flyTo(COUNTY_VIEW.center, COUNTY_VIEW.zoom);
    setPane(null);
    // …and the URL back to the clean map (drops intent/sub/open/t/
    // layers/amenity — the whole filter state).
    router.replace(pathname, { scroll: false });
  };

  const toggle = (p: Pane) => {
    haptic("light");
    setPane((cur) => (cur === p ? null : p));
  };

  const paneTitle =
    pane === "what" ? "What’s shown" : pane === "when" ? "When" : pane === "where" ? "Where" : "";

  return (
    <>
      {/* Scrim — tap anywhere off the dock to close the pane. */}
      <div
        className={`dock-scrim${pane ? " on" : ""}`}
        onClick={() => setPane(null)}
        aria-hidden
      />

      <section className={`dock${pane ? " dock-open" : ""}`} aria-label="Map view controls">
        {/* ── Pane (above the caption row, same card) ── */}
        <div className="dock-pane" id="dock-pane" aria-hidden={pane === null}>
          <div className="dock-pane-scroll">
            <div className="dock-pane-head">
              <span className="dock-pane-title font-serif">{paneTitle}</span>
              <button type="button" className="dock-done" onClick={() => setPane(null)}>
                Done
              </button>
            </div>

            {/* ── WHAT ── */}
            {pane === "what" && (
              <div>
                <Sect>Places</Sect>
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

                <Sect>Overlays</Sect>
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
                      color="var(--app-warning)"
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
                    items={AMENITY_GROUPS.map((g) => ({
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
              </div>
            )}

            {/* ── WHEN ── */}
            {pane === "when" && (
              <div>
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

                <Sect>Events</Sect>
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
                  onClick={props.goNearMe}
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
                      onClick={() => goTown(m.slug, m.name, [m.centroid.lng, m.centroid.lat])}
                    >
                      {m.name}
                    </Chip>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* ── The caption row: readout + tab bar + clear-all ── */}
        <div className="dock-readout">
          <button
            type="button"
            className={`dock-seg dock-seg-what${pane === "what" ? " active" : ""}`}
            onClick={() => toggle("what")}
            aria-expanded={pane === "what"}
            aria-controls="dock-pane"
          >
            <span className="dock-seg-k">What</span>
            <span className="dock-seg-v" style={{ color: whatColor }}>
              {what.main}
              {what.plus && <span className="dock-seg-plus"> {what.plus}</span>}
            </span>
          </button>
          <button
            type="button"
            className={`dock-seg${pane === "when" ? " active" : ""}`}
            onClick={() => toggle("when")}
            aria-expanded={pane === "when"}
            aria-controls="dock-pane"
          >
            <span className="dock-seg-k">When</span>
            <span className={`dock-seg-v${when.mono ? " mono" : ""}`} style={{ color: whenColor }}>
              {when.text}
            </span>
          </button>
          <button
            type="button"
            className={`dock-seg dock-seg-where${pane === "where" ? " active" : ""}`}
            onClick={() => toggle("where")}
            aria-expanded={pane === "where"}
            aria-controls="dock-pane"
          >
            <span className="dock-seg-k">Where</span>
            <span className="dock-seg-v" style={{ color: whereColor }}>
              {whereText}
            </span>
          </button>
          {dirty && (
            <button
              type="button"
              className="dock-clear"
              onClick={clearAll}
              aria-label="Clear all filters"
            >
              <X className="h-4 w-4" strokeWidth={2.6} aria-hidden />
            </button>
          )}
        </div>

        {/* The living caption — counts + a spoken state summary, announced
            politely as filters change. */}
        <div className="dock-countline" aria-live="polite">
          {line}
          <span className="sr-only">
            {` Showing ${what.main}${what.plus ? ` ${what.plus}` : ""}, ${when.text}, ${whereText}.`}
          </span>
        </div>
      </section>
    </>
  );
}
