"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  ArrowUpRight,
  ArrowDownRight,
  Bus,
  CalendarDays,
  Car,
  CloudSun,
  GraduationCap,
  Minus,
  Newspaper,
  Plug,
  TrainFront,
  Waves,
  Wrench,
  type LucideIcon,
} from "lucide-react";
import type { DeckDetailRow, DeckFace, DeckIcon, DeckKey } from "@/lib/deck/readings";
import { RADIUS_TOOL_GROUPS } from "@/data/radius-tools";
import { TOOL_ICONS, TOOL_TONE_COLOR } from "@/components/tools/toolIcons";

/**
 * The deck — the county's instruments as a board of keys.
 *
 * Closed, a key is a reading. Pressed, it opens IN PLACE, widening across the
 * board to reveal the rows behind that number and the surface that owns them.
 * Deliberately not a popup: the number you pressed stays on screen with its
 * evidence beneath it, and the rest of the board stays visible around it.
 *
 * Four things make it a live board rather than a picture of one:
 *
 *   REFRESH. The page paints server-rendered keys, then polls /api/deck while
 *   the tab is visible. A board left open used to show whatever the bus count
 *   was at load; now it moves. Polling stops when the tab is hidden and
 *   catches up immediately on return, so a backgrounded tab costs nothing.
 *
 *   COUNTDOWN. Bus rows carry the raw arrival epoch, and the client ticks it
 *   down every second. A server-rendered "4 min" is a lie ninety seconds
 *   later; this cannot age.
 *
 *   HISTORY. A key with a published series draws it on its own face. Only the
 *   USGS gauges have one (~94 readings a day), so only Creeks has a line. A
 *   sparkline invented from a single current value would be a drawing.
 *
 *   FACES BY HAND. Keys with more than one reading rotate on a shared tick,
 *   and you can also swipe them or use the arrow keys. The dots say how many
 *   readings a key holds, so rotation stops being a surprise.
 *
 * The keys are paper, not dark slabs. An earlier build lit these in Ink on the
 * argument that an instrument panel is the brand's "rare contrast moment"; ten
 * at once was a black grid dropped onto a warm page, which is a page theme by
 * another name. Identity comes from each key's accent washed across the face
 * and a stripe on its top edge.
 */

const ICONS: Record<DeckIcon, LucideIcon> = {
  bus: Bus,
  train: TrainFront,
  car: Car,
  plug: Plug,
  cloud: CloudSun,
  waves: Waves,
  school: GraduationCap,
  wrench: Wrench,
  calendar: CalendarDays,
  newspaper: Newspaper,
};

const TREND_ICON = { rising: ArrowUpRight, falling: ArrowDownRight, steady: Minus } as const;

const TICK_MS = 2_400;
/** Ticks a face holds before the next one takes over. */
const FACE_TICKS = 3;
/** How often the board asks the server for new readings. */
const POLL_MS = 75_000;
/** Horizontal travel that counts as a deliberate swipe, not a sloppy tap. */
const SWIPE_PX = 32;

function clockOf(iso: string): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(iso));
}

/** The live countdown. Returns null once a prediction is spent, so a passed
 *  arrival disappears instead of counting upward into nonsense. */
function liveEta(etaEpoch: number, nowMs: number): string | null {
  const minutes = Math.round((etaEpoch * 1000 - nowMs) / 60_000);
  if (minutes < 0 || minutes > 90) return null;
  return minutes <= 0 ? "arriving" : `${minutes} min`;
}

/** A gauge's last 24 hours as one path, scaled to its own range so a creek
 *  that moves two inches still reads as a shape. `at` marks the scrubbed
 *  point when a finger or pointer is moving across the key. */
function Sparkline({
  series,
  color,
  at,
}: {
  series: Array<{ v: number; at: string }>;
  color: string;
  at: number | null;
}) {
  const fillId = useId().replace(/[:]/g, "");
  if (series.length < 2) return null;
  const values = series.map((point) => point.v);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const step = 100 / (series.length - 1);
  const xy = (i: number) => ({
    x: i * step,
    y: 26 - ((series[i].v - min) / span) * 22,
  });
  const points = series.map((_, i) => {
    const p = xy(i);
    return `${p.x.toFixed(2)},${p.y.toFixed(2)}`;
  });
  const cursor = at === null ? null : xy(at);
  return (
    <svg
      // Sits in the key's empty middle band, between the icon and the reading.
      // Anchored to the bottom it ran straight through its own label.
      className="pointer-events-none absolute inset-x-0 top-[32%] h-9 w-full"
      viewBox="0 0 100 30"
      preserveAspectRatio="none"
      aria-hidden
    >
      {/* The fill fades out downward. A flat tint stopped at the band's edge
          and read as a shaded rectangle sitting on the key, not a chart. */}
      <defs>
        <linearGradient id={fillId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity={0.2} />
          <stop offset="100%" stopColor={color} stopOpacity={0} />
        </linearGradient>
      </defs>
      <polygon points={`0,30 ${points.join(" ")} 100,30`} fill={`url(#${fillId})`} />
      <polyline
        points={points.join(" ")}
        fill="none"
        stroke={color}
        strokeWidth={1.4}
        strokeLinejoin="round"
        strokeLinecap="round"
        opacity={cursor ? 0.95 : 0.75}
        vectorEffect="non-scaling-stroke"
      />
      {cursor && (
        <>
          <line
            x1={cursor.x}
            y1={0}
            x2={cursor.x}
            y2={30}
            stroke={color}
            strokeWidth={1}
            opacity={0.45}
            vectorEffect="non-scaling-stroke"
          />
          {/* Drawn as a tiny rect: a circle would be stretched into an ellipse
              by preserveAspectRatio="none" on this viewBox. */}
          <rect
            x={cursor.x - 1.1}
            y={cursor.y - 1.1}
            width={2.2}
            height={2.2}
            fill={color}
            vectorEffect="non-scaling-stroke"
          />
        </>
      )}
    </svg>
  );
}

/**
 * What a key has to say, one stop at a time, as you move across its face.
 *
 * Every key holds more than the one number it shows. Moving inside the cube
 * walks that content without opening anything: which bus and how far out,
 * which town is dark and how many, what the sky does tomorrow, which creek is
 * where. The face keeps its own grammar throughout — the figure on top, what
 * the figure is about underneath — so a scrubbed stop reads exactly like a
 * resting reading rather than like a different component.
 *
 * A gauge series scrubs as a timeline; everything else scrubs its detail rows.
 * Rows that carry no figure of their own get a position counter, which is
 * honest about being a position rather than dressing one up as a measurement.
 */
function scrubTrack(deckKey: DeckKey, nowMs: number): DeckFace[] {
  if (deckKey.spark && deckKey.spark.length > 1) {
    return deckKey.spark.map((point) => ({
      value: `${point.v.toFixed(1)} ft`,
      label: agoLabel(point.at, nowMs),
    }));
  }
  const rows = deckKey.detail;
  if (rows.length < 2) return [];
  return rows.map((row, i) => {
    const live = row.etaEpoch ? liveEta(row.etaEpoch, nowMs) : null;
    const figure = row.etaEpoch ? live : row.trail;
    return { value: figure ?? `${i + 1}/${rows.length}`, label: row.lead };
  });
}

/** "just now", "40 min ago", "6h ago" — how long before this render the gauge
 *  reported. Reads the point's own timestamp, never its position in the array,
 *  because USGS skips intervals and the gaps are real. */
function agoLabel(iso: string, nowMs: number): string {
  const minutes = Math.round((nowMs - Date.parse(iso)) / 60_000);
  if (!Number.isFinite(minutes) || minutes < 0) return "just now";
  if (minutes < 5) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  return hours <= 1 ? "1h ago" : `${hours}h ago`;
}

function DetailRow({ row, nowMs }: { row: DeckDetailRow; nowMs: number }) {
  const ticking = row.etaEpoch ? liveEta(row.etaEpoch, nowMs) : null;
  const trail = row.etaEpoch ? ticking : row.trail;
  const TrendIcon = row.trend ? TREND_ICON[row.trend] : null;
  return (
    <li
      className="flex items-baseline justify-between gap-3 border-b py-1.5 last:border-b-0"
      style={{ borderColor: "var(--app-border)" }}
    >
      <span className="min-w-0 flex-1 text-[13px] leading-snug" style={{ color: "var(--app-ink)" }}>
        {row.lead}
      </span>
      {(trail || TrendIcon) && (
        <span className="flex shrink-0 items-center gap-1">
          {TrendIcon && (
            <TrendIcon
              className="h-3 w-3"
              strokeWidth={2.5}
              style={{ color: "var(--app-ink-3)" }}
              aria-label={row.trend}
            />
          )}
          {trail && (
            <span
              className="font-mono text-[11px] tabular-nums"
              style={{ color: "var(--app-ink-3)" }}
            >
              {trail}
            </span>
          )}
        </span>
      )}
    </li>
  );
}

export default function DeckBoard({
  initialKeys,
  initialReadAt,
}: {
  initialKeys: DeckKey[];
  initialReadAt: string;
}) {
  const panelBase = useId();
  const [reduced] = useState(
    () =>
      typeof window !== "undefined" &&
      !!window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches,
  );
  const [keys, setKeys] = useState(initialKeys);
  const [readAt, setReadAt] = useState(initialReadAt);
  const [refreshing, setRefreshing] = useState(false);
  const [tick, setTick] = useState(0);
  const [nowMs, setNowMs] = useState(() => Date.parse(initialReadAt));
  const [openId, setOpenId] = useState<string | null>(null);
  const [openFolder, setOpenFolder] = useState<string | null>(null);
  /** Per-key manual face offsets, set by swiping or arrow keys. */
  const [nudge, setNudge] = useState<Record<string, number>>({});
  const touchX = useRef<number | null>(null);
  /** Which point of a scrubbable key's line the pointer is over, if any. */
  const [scrub, setScrub] = useState<{ id: string; index: number } | null>(null);

  const rotates = keys.some((deckKey) => deckKey.faces.length > 1);
  const ticksEta = keys.some((deckKey) => deckKey.detail.some((row) => row.etaEpoch));

  // Face rotation.
  useEffect(() => {
    if (reduced || !rotates) return;
    const timer = setInterval(() => setTick((value) => value + 1), TICK_MS);
    return () => clearInterval(timer);
  }, [reduced, rotates]);

  // The countdown clock. Only runs when something is actually counting down.
  useEffect(() => {
    setNowMs(Date.now());
    if (!ticksEta) return;
    const timer = setInterval(() => setNowMs(Date.now()), 1_000);
    return () => clearInterval(timer);
  }, [ticksEta]);

  const refresh = useCallback(async () => {
    try {
      setRefreshing(true);
      const res = await fetch("/api/deck", { cache: "no-store" });
      if (!res.ok) return;
      const data = (await res.json()) as { keys: DeckKey[]; readAt: string };
      if (Array.isArray(data.keys) && data.keys.length > 0) {
        setKeys(data.keys);
        setReadAt(data.readAt);
        setNowMs(Date.now());
      }
    } catch {
      // A failed poll keeps the last good board. The stamp stops advancing,
      // which is the honest signal that these readings are no longer fresh.
    } finally {
      setRefreshing(false);
    }
  }, []);

  // Poll only while the tab is visible, and catch up the moment it returns.
  useEffect(() => {
    let timer: ReturnType<typeof setInterval> | null = null;
    const start = () => {
      if (timer) return;
      timer = setInterval(refresh, POLL_MS);
    };
    const stop = () => {
      if (!timer) return;
      clearInterval(timer);
      timer = null;
    };
    const onVisibility = () => {
      if (document.visibilityState === "visible") {
        void refresh();
        start();
      } else stop();
    };
    if (document.visibilityState === "visible") start();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      stop();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [refresh]);

  // Escape closes the open key, the same as pressing it again.
  useEffect(() => {
    if (!openId) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpenId(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [openId]);

  useEffect(() => {
    if (!openFolder) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpenFolder(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [openFolder]);

  const turnFace = (id: string, by: number) =>
    setNudge((current) => ({ ...current, [id]: (current[id] ?? 0) + by }));

  /**
   * Map a pointer's x position inside a key onto a point in its series.
   *
   * A key either scrubs or turns faces on horizontal movement, never both:
   * two meanings on one gesture is how a control stops being predictable.
   * The rule is the data's, not a setting — a key that publishes a series
   * scrubs it, and today only Creeks publishes one.
   */
  const scrubAt = (deckKey: DeckKey, track: DeckFace[], clientX: number, element: HTMLElement) => {
    if (track.length < 2) return;
    const box = element.getBoundingClientRect();
    if (box.width === 0) return;
    const ratio = Math.min(1, Math.max(0, (clientX - box.left) / box.width));
    setScrub({ id: deckKey.id, index: Math.round(ratio * (track.length - 1)) });
  };

  /** Arrow keys step the same track, so the reveal is not pointer-only. */
  const stepScrub = (deckKey: DeckKey, track: DeckFace[], by: number) =>
    setScrub((current) => {
      const from = current?.id === deckKey.id ? current.index : by > 0 ? -1 : track.length;
      const next = Math.min(track.length - 1, Math.max(0, from + by));
      return { id: deckKey.id, index: next };
    });

  // Only groups that actually carry tools, so a folder can never open empty.
  const folders = RADIUS_TOOL_GROUPS.filter((group) => group.tools.length > 0);

  if (keys.length === 0) return null;
  const reporting = keys.filter((deckKey) => deckKey.status === "ok").length;

  return (
    <div className="space-y-2.5">
      <div className="flex items-baseline justify-between gap-3">
        <h2
          id="deck-heading"
          className="font-serif text-[19px] font-semibold leading-tight tracking-tight"
          style={{ color: "var(--app-ink)" }}
        >
          Right now
        </h2>
        {/* Freshness and coverage, in the instrument voice. A board of live
            readings has to say when it was read and how many answered. */}
        <p
          className="shrink-0 font-mono text-[10px] font-bold uppercase tracking-[0.12em] tabular-nums"
          style={{ color: "var(--app-ink-3)", opacity: refreshing ? 0.5 : 1 }}
        >
          {clockOf(readAt)} · {reporting}/{keys.length}
        </p>
      </div>
      {/* Announced politely so a screen reader hears that the board updated
          without the whole grid being re-read on every poll. */}
      <p className="sr-only" aria-live="polite">
        Readings updated {clockOf(readAt)}. {reporting} of {keys.length} sources reporting.
      </p>

      {/* Dense flow so the full-width open key does not strand empty cells in
          the row above it: the keys that follow backfill the gap instead. */}
      <div className="grid grid-flow-dense grid-cols-3 gap-2 sm:grid-cols-5">
        {keys.map((deckKey, index) => {
          const open = openId === deckKey.id;
          const unavailable = deckKey.status === "unavailable";
          const Icon = ICONS[deckKey.icon];
          const panelId = `${panelBase}-${deckKey.id}`;
          const many = deckKey.faces.length > 1;

          // Three stagger groups: neighbouring keys never turn on the same
          // tick. An open key holds its first face so its heading stays still.
          const phase = index % FACE_TICKS;
          const auto =
            reduced || open ? 0 : Math.floor((tick + phase) / FACE_TICKS);
          const faceIndex =
            (((auto + (nudge[deckKey.id] ?? 0)) % deckKey.faces.length) + deckKey.faces.length) %
            deckKey.faces.length;
          // Everything a key holds beyond its headline, walkable across the
          // face. One meaning per gesture: a key with a track scrubs it, and
          // faces keep turning on their own timer.
          const track = open ? [] : scrubTrack(deckKey, nowMs);
          const scrubs = track.length > 1;
          const scrubIndex = scrub?.id === deckKey.id ? scrub.index : null;
          const scrubbed = scrubIndex === null ? null : track[scrubIndex] ?? null;
          // While scrubbing, the face reads the stop under the pointer, so the
          // figure and the marker always describe the same thing.
          const face = scrubbed ?? deckKey.faces[faceIndex];

          // Three across leaves a lone key stranded whenever the count is
          // 3n+1. The last one widens rather than sitting in a half-empty row.
          const wide = keys.length % 3 === 1 && index === keys.length - 1;

          // Every face at once, so a screen reader is never waiting on a timer
          // to hear a reading the page is currently showing.
          const readings = deckKey.faces.map((f) => `${f.value} ${f.label}`).join(", ");

          return (
            <div
              key={deckKey.id}
              className={
                open ? "col-span-3 sm:col-span-5" : wide ? "col-span-3 sm:col-span-1" : "col-span-1"
              }
            >
              <div
                className="fr-deck-key fr-deck-boot relative overflow-hidden"
                style={{
                  borderRadius: "var(--app-radius-md)",
                  background:
                    "linear-gradient(177deg, var(--app-bg-elevated-solid) 0%, color-mix(in srgb, var(--app-bg-sunken) 55%, var(--app-bg-elevated-solid)) 100%)",
                  border: "1px solid var(--app-border)",
                  opacity: unavailable && !open ? 0.72 : 1,
                  animationDelay: `${Math.min(index, 11) * 45}ms`,
                }}
              >
                {!unavailable && (
                  <span
                    aria-hidden
                    className="pointer-events-none absolute inset-0"
                    style={{
                      background: `radial-gradient(120% 90% at 0% 0%, ${deckKey.accent} 0%, transparent 72%)`,
                      opacity: 0.22,
                    }}
                  />
                )}
                <span
                  aria-hidden
                  className="pointer-events-none absolute inset-x-0 top-0 h-[3px]"
                  style={{
                    background: unavailable ? "var(--app-border)" : deckKey.accent,
                    opacity: unavailable ? 1 : 0.85,
                  }}
                />

                <button
                  type="button"
                  onClick={() => setOpenId(open ? null : deckKey.id)}
                  onKeyDown={(event) => {
                    if (open) return;
                    const forward = event.key === "ArrowRight";
                    const back = event.key === "ArrowLeft";
                    if (!forward && !back) return;
                    if (scrubs) {
                      // The keyboard walks the same content the finger does.
                      event.preventDefault();
                      stepScrub(deckKey, track, forward ? 1 : -1);
                    } else if (many) {
                      event.preventDefault();
                      turnFace(deckKey.id, forward ? 1 : -1);
                    }
                  }}
                  onBlur={() => {
                    if (scrub?.id === deckKey.id) setScrub(null);
                  }}
                  onTouchStart={(event) => {
                    touchX.current = event.touches[0]?.clientX ?? null;
                    if (scrubs && !open && touchX.current !== null) {
                      scrubAt(deckKey, track, touchX.current, event.currentTarget);
                    }
                  }}
                  onTouchMove={(event) => {
                    if (!scrubs || open) return;
                    const x = event.touches[0]?.clientX;
                    if (x != null) scrubAt(deckKey, track, x, event.currentTarget);
                  }}
                  onTouchEnd={(event) => {
                    const start = touchX.current;
                    touchX.current = null;
                    if (scrubs) {
                      setScrub(null);
                      return;
                    }
                    if (start === null || !many || open) return;
                    const delta = (event.changedTouches[0]?.clientX ?? start) - start;
                    if (Math.abs(delta) < SWIPE_PX) return;
                    // A swipe changes the face instead of opening the key, so
                    // the gesture never fights the tap it looks like.
                    event.preventDefault();
                    turnFace(deckKey.id, delta < 0 ? 1 : -1);
                  }}
                  onPointerMove={(event) => {
                    if (!scrubs || open || event.pointerType === "touch") return;
                    scrubAt(deckKey, track, event.clientX, event.currentTarget);
                  }}
                  onPointerLeave={() => {
                    if (scrubs) setScrub(null);
                  }}
                  aria-expanded={open}
                  aria-controls={panelId}
                  aria-label={`${deckKey.name}: ${readings}. ${open ? "Hide" : "Show"} detail.`}
                  className={`fr-deck-press relative flex w-full flex-col p-2.5 text-left sm:p-3 ${
                    open ? "" : wide ? "aspect-[3.4/1] sm:aspect-square" : "aspect-square"
                  }`}
                >
                  {/* The gauge's own last 24 hours, behind its reading. */}
                  {!open && deckKey.spark && deckKey.spark.length > 1 && (
                    <Sparkline series={deckKey.spark} color={deckKey.accent} at={scrubIndex} />
                  )}

                  <span className="relative flex items-start justify-between gap-2">
                    <Icon
                      className="h-[18px] w-[18px] shrink-0"
                      strokeWidth={2.25}
                      style={{ color: unavailable ? "var(--app-ink-3)" : deckKey.accent }}
                      aria-hidden
                    />
                    {open ? (
                      <span
                        className="truncate font-mono text-[10px] font-bold uppercase tracking-[0.12em]"
                        style={{ color: "var(--app-ink-3)" }}
                        aria-hidden
                      >
                        {deckKey.name}
                      </span>
                    ) : (
                      deckKey.live &&
                      !unavailable && (
                        <span
                          aria-hidden
                          className="fr-deck-live mt-[3px] h-[5px] w-[5px] shrink-0 rounded-full"
                          style={{ background: deckKey.accent }}
                        />
                      )
                    )}
                  </span>

                  <span
                    className={open ? "relative mt-2 block min-w-0" : "relative mt-auto block min-w-0"}
                    aria-hidden
                  >
                    <span
                      key={`${deckKey.id}-${faceIndex}`}
                      className="fr-deck-value block truncate font-semibold tabular-nums leading-none"
                      style={{
                        fontSize: "clamp(19px, 5.4vw, 27px)",
                        letterSpacing: "-0.02em",
                        color: unavailable ? "var(--app-ink-3)" : "var(--app-ink)",
                      }}
                    >
                      {face.value}
                    </span>
                    <span
                      key={`${deckKey.id}-${faceIndex}-label`}
                      className="fr-deck-label mt-1 block truncate text-[10.5px] leading-tight"
                      style={{ color: "var(--app-ink-3)" }}
                    >
                      {face.label}
                    </span>

                    {/* How many readings this key holds, and which one you are
                        looking at. Rotation stops being a surprise. */}
                    {/* Where you are in the key's content. Scrubbing takes the
                        indicator over: a continuous rail with a travelling
                        marker, because a scrub track can hold twenty-four
                        stops and twenty-four dots is noise. At rest it falls
                        back to the face dots. */}
                    {!open && scrubIndex !== null && track.length > 1 ? (
                      <span
                        className="mt-1.5 block h-[3px] w-full overflow-hidden rounded-full"
                        style={{ background: `color-mix(in srgb, ${deckKey.accent} 22%, transparent)` }}
                        aria-hidden
                      >
                        <span
                          className="block h-full rounded-full"
                          style={{
                            background: deckKey.accent,
                            width: `${Math.max(8, 100 / track.length)}%`,
                            marginLeft: `${(scrubIndex / (track.length - 1)) * (100 - Math.max(8, 100 / track.length))}%`,
                          }}
                        />
                      </span>
                    ) : (
                      many &&
                      !open && (
                        <span className="mt-1.5 flex gap-1" aria-hidden>
                          {deckKey.faces.map((_, dot) => (
                            <span
                              key={dot}
                              className="h-[3px] w-[3px] rounded-full transition-opacity"
                              style={{
                                background: deckKey.accent,
                                opacity: dot === faceIndex ? 0.9 : 0.25,
                              }}
                            />
                          ))}
                        </span>
                      )
                    )}
                  </span>
                </button>

                {/* The reveal. Rendered only when open so a collapsed board
                    never ships ten hidden panels to the accessibility tree. */}
                {open && (
                  <div id={panelId} className="fr-deck-panel relative px-2.5 pb-2.5 sm:px-3 sm:pb-3">
                    {deckKey.detail.length > 0 ? (
                      <ul className="border-t" style={{ borderColor: "var(--app-border)" }}>
                        {deckKey.detail.map((row, rowIndex) => (
                          <DetailRow key={`${row.lead}-${rowIndex}`} row={row} nowMs={nowMs} />
                        ))}
                      </ul>
                    ) : (
                      <p
                        className="border-t pt-2 text-[13px] leading-relaxed"
                        style={{ borderColor: "var(--app-border)", color: "var(--app-ink-2)" }}
                      >
                        {deckKey.note ?? "Nothing to list for this reading."}
                      </p>
                    )}

                    {deckKey.detail.length > 0 && deckKey.note && (
                      <p className="pt-2 text-[12px]" style={{ color: "var(--app-ink-3)" }}>
                        {deckKey.note}
                      </p>
                    )}

                    <div className="mt-2 flex items-center justify-between gap-3">
                      <span
                        className="min-w-0 truncate font-mono text-[10px] font-bold uppercase tracking-[0.1em]"
                        style={{ color: "var(--app-ink-3)" }}
                      >
                        {deckKey.source}
                      </span>
                      <Link
                        href={deckKey.href}
                        className="tap-44-y inline-flex shrink-0 items-center gap-1 text-[13px] font-medium"
                        // Brick at 13px is 3.24:1 on cream. The pressed tone is
                        // the AA-passing text variant (4.80:1).
                        style={{ color: "var(--app-brand-press)" }}
                      >
                        {deckKey.hrefLabel}
                        <ArrowRight className="h-3.5 w-3.5" strokeWidth={2.5} aria-hidden />
                      </Link>
                    </div>
                  </div>
                )}
              </div>
            </div>
          );
        })}

        <style>{`
          /* Key material: a seated cap, not a flat card. The inset highlight
             is the light catching the top bevel and the inset shade is the
             seam where the cap meets the board. */
          .fr-deck-key {
            transition: box-shadow 160ms ease, transform 160ms ease;
            box-shadow:
              inset 0 1px 0 rgba(255,255,255,0.75),
              inset 0 -1px 0 rgba(34,28,21,0.06),
              0 1px 2px rgba(34,28,21,0.06),
              0 5px 12px -9px rgba(34,28,21,0.34);
          }
          .fr-deck-press { transition: transform 120ms ease; touch-action: pan-y; }
          .fr-deck-press:active { transform: translateY(1px) scale(0.98); }
          @media (hover: hover) {
            .fr-deck-key:hover {
              transform: translateY(-1.5px);
              box-shadow:
                inset 0 1px 0 rgba(255,255,255,0.85),
                inset 0 -1px 0 rgba(34,28,21,0.06),
                0 2px 4px rgba(34,28,21,0.07),
                0 16px 26px -14px rgba(34,28,21,0.42);
            }
          }
          /* The board coming up: keys seat themselves in a wave rather than
             all appearing at once. Runs once on mount, never on refresh. */
          .fr-deck-boot { animation: fr-deck-seat 460ms cubic-bezier(.2,.8,.3,1) both; }
          @keyframes fr-deck-seat {
            from { opacity: 0; transform: translateY(8px) scale(0.965); }
            to { opacity: 1; transform: none; }
          }
          .fr-deck-value, .fr-deck-label { animation: fr-deck-in 420ms ease both; }
          .fr-deck-label { animation-delay: 40ms; }
          /* Never dips to zero. A reading that blinks out, even for 200ms,
             reads as the feed dropping rather than the face turning over. */
          @keyframes fr-deck-in {
            from { opacity: 0.3; transform: translateY(3px); }
            to { opacity: 1; transform: none; }
          }
          .fr-deck-panel { animation: fr-deck-open 220ms ease both; }
          @keyframes fr-deck-open {
            from { opacity: 0; transform: translateY(-4px); }
            to { opacity: 1; transform: none; }
          }
          .fr-deck-live { animation: fr-deck-pulse 2.6s ease-in-out infinite; }
          @keyframes fr-deck-pulse {
            0%, 100% { opacity: 1; }
            50% { opacity: 0.28; }
          }
          @media (prefers-reduced-motion: reduce) {
            .fr-deck-value, .fr-deck-label, .fr-deck-live, .fr-deck-panel, .fr-deck-boot {
              animation: none !important;
            }
            .fr-deck-key, .fr-deck-press { transition: none !important; }
          }
        `}</style>
      </div>

      {/* The second band: every tool in the guide as a folder key. A folder
          opens in place exactly like a reading does, so the whole index is one
          press deep and nothing has to navigate away to be browsed. */}
      <div className="flex items-baseline justify-between gap-3 pt-2">
        <h3
          className="font-serif text-[19px] font-semibold leading-tight tracking-tight"
          style={{ color: "var(--app-ink)" }}
        >
          Tools
        </h3>
        <p
          className="shrink-0 font-mono text-[10px] font-bold uppercase tracking-[0.12em] tabular-nums"
          style={{ color: "var(--app-ink-3)" }}
        >
          {folders.reduce((sum, group) => sum + group.tools.length, 0)} in{" "}
          {folders.length} sets
        </p>
      </div>

      <div className="grid grid-flow-dense grid-cols-3 gap-2 sm:grid-cols-5">
        {folders.map((group, index) => {
          const open = openFolder === group.id;
          const panelId = `${panelBase}-folder-${group.id}`;
          // The set's own face, declared on the group. Borrowing the first
          // tool's icon put the Open-now pulse line on "Eat & drink".
          const Icon = TOOL_ICONS[group.icon];
          const accent = TOOL_TONE_COLOR[group.tone];
          const wide = folders.length % 3 === 1 && index === folders.length - 1;

          return (
            <div
              key={group.id}
              className={
                open ? "col-span-3 sm:col-span-5" : wide ? "col-span-3 sm:col-span-1" : "col-span-1"
              }
            >
              <div
                className="fr-deck-key fr-deck-boot relative overflow-hidden"
                style={{
                  borderRadius: "var(--app-radius-md)",
                  background:
                    "linear-gradient(177deg, var(--app-bg-elevated-solid) 0%, color-mix(in srgb, var(--app-bg-sunken) 55%, var(--app-bg-elevated-solid)) 100%)",
                  border: "1px solid var(--app-border)",
                  animationDelay: `${Math.min(keys.length + index, 18) * 45}ms`,
                }}
              >
                <span
                  aria-hidden
                  className="pointer-events-none absolute inset-0"
                  style={{
                    background: `radial-gradient(120% 90% at 0% 0%, ${accent} 0%, transparent 72%)`,
                    opacity: 0.22,
                  }}
                />
                <span
                  aria-hidden
                  className="pointer-events-none absolute inset-x-0 top-0 h-[3px]"
                  style={{ background: accent, opacity: 0.85 }}
                />

                <button
                  type="button"
                  onClick={() => setOpenFolder(open ? null : group.id)}
                  aria-expanded={open}
                  aria-controls={panelId}
                  aria-label={`${group.label}: ${group.tools.length} tools. ${open ? "Hide" : "Show"} them.`}
                  className={`fr-deck-press relative flex w-full flex-col p-2.5 text-left sm:p-3 ${
                    open ? "" : wide ? "aspect-[3.4/1] sm:aspect-square" : "aspect-square"
                  }`}
                >
                  <Icon
                    className="h-[18px] w-[18px] shrink-0"
                    strokeWidth={2.25}
                    style={{ color: accent }}
                    aria-hidden
                  />
                  <span className={open ? "mt-2 block min-w-0" : "mt-auto block min-w-0"} aria-hidden>
                    <span
                      className="block text-[14px] font-semibold leading-tight [text-wrap:balance]"
                      style={{ color: "var(--app-ink)" }}
                    >
                      {group.label}
                    </span>
                    <span
                      className="mt-1 block truncate text-[10.5px] leading-tight tabular-nums"
                      style={{ color: "var(--app-ink-3)" }}
                    >
                      {group.tools.length} {group.tools.length === 1 ? "tool" : "tools"}
                    </span>
                  </span>
                </button>

                {open && (
                  <div
                    id={panelId}
                    className="fr-deck-panel relative border-t px-2.5 pb-2.5 pt-2 sm:px-3 sm:pb-3"
                    style={{ borderColor: "var(--app-border)" }}
                  >
                    <ul className="grid grid-cols-3 gap-2 sm:grid-cols-5">
                      {group.tools.map((tool) => {
                        const ToolIcon = TOOL_ICONS[tool.icon];
                        const toolAccent = TOOL_TONE_COLOR[tool.tone];
                        return (
                          <li key={tool.id}>
                            <Link
                              href={tool.href}
                              className="fr-deck-key fr-deck-press flex aspect-square flex-col p-2 text-left"
                              style={{
                                borderRadius: "var(--app-radius-sm, 10px)",
                                background: "var(--app-bg)",
                                border: "1px solid var(--app-border)",
                              }}
                            >
                              <ToolIcon
                                className="h-4 w-4 shrink-0"
                                strokeWidth={2.25}
                                style={{ color: toolAccent }}
                                aria-hidden
                              />
                              <span
                                className="mt-auto block text-[11px] font-medium leading-tight [text-wrap:balance]"
                                style={{ color: "var(--app-ink)" }}
                              >
                                {tool.label}
                              </span>
                            </Link>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
