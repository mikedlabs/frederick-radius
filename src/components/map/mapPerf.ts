import { track } from "@/lib/track";

/**
 * Privacy-safe map performance telemetry.
 *
 * The map is measured as one short-lived session. Measurements are aggregate
 * durations and bounded counters only: this module never accepts or reports a
 * URL, coordinate, search term, place id, or feature name. Readiness timing is
 * cheap enough to record for every map. Main-thread quality and per-source
 * timing are sampled together so a busy map cannot create an analytics flood.
 */

const DEFAULT_SAMPLE_RATE = 0.05;
const DEFAULT_RUNTIME_WINDOW_MS = 10_000;
const MIN_RUNTIME_REPORT_MS = 250;
const FRAME_GAP_THRESHOLD_MS = 80;
const MAX_REPORTED_MS = 120_000;
const MAX_REPORTED_COUNT = 10_000;
const MAX_SOURCE_REPORTS_PER_SESSION = 16;

const SESSION_MARK = "fr-map-session-start";
const LOAD_MARK = "fr-map-onload";
const IDLE_MARK = "fr-map-idle";
const LOAD_TO_IDLE_MEASURE = "fr-map-onload-to-idle";

export const MAP_PERF_SOURCES = [
  "basemap",
  "places",
  "amenities",
  "events",
  "transit",
  "weather",
  "roads",
  "incidents",
  "planning",
  "mobility",
  "parking",
  "outdoors",
  "other",
] as const;

export type MapPerfSource = (typeof MAP_PERF_SOURCES)[number];
export type MapPerfSourceOutcome =
  | "ready"
  | "empty"
  | "stale"
  | "error"
  | "aborted";

export type MapPerfSessionOptions = {
  /** Set to zero to retain readiness timings while disabling sampled work. */
  sampleRate?: number;
  /**
   * Optional performance-timeline timestamp for a known route-navigation
   * start. Undefined performs a safe direct-document navigation check; null
   * explicitly suppresses navigation timing (useful for embedded maps).
   */
  navigationStartMs?: number | null;
  /** Initial observation window. Kept configurable for deterministic tests. */
  runtimeWindowMs?: number;
};

type RuntimeAggregate = {
  startedAt: number;
  lastFrameAt: number | null;
  frameGapCount: number;
  frameGapTotalMs: number;
  maxFrameGapMs: number;
  longTaskCount: number;
  longTaskTotalMs: number;
  maxLongTaskMs: number;
  rafId: number | null;
  timeoutId: ReturnType<typeof setTimeout> | null;
  observer: PerformanceObserver | null;
  onVisibilityChange: (() => void) | null;
  stopped: boolean;
};

type MapPerfSession = {
  token: symbol;
  startedAt: number;
  navigationStartedAt: number | null;
  loadAt: number | null;
  idleAt: number | null;
  readyReported: boolean;
  sampled: boolean;
  sourceReportsRemaining: number;
  runtime: RuntimeAggregate | null;
};

const SOURCE_SET = new Set<string>(MAP_PERF_SOURCES);
let activeSession: MapPerfSession | null = null;

function hasPerformanceClock(): boolean {
  return (
    typeof performance !== "undefined" &&
    typeof performance.now === "function"
  );
}

function now(): number | null {
  if (!hasPerformanceClock()) return null;
  const value = performance.now();
  return Number.isFinite(value) ? value : null;
}

function safeMark(name: string): void {
  if (typeof performance === "undefined" || typeof performance.mark !== "function") return;
  try {
    performance.mark(name);
  } catch {
    /* Performance entries are diagnostic only. */
  }
}

function safeMeasure(name: string, start: string, end: string): void {
  if (typeof performance === "undefined" || typeof performance.measure !== "function") return;
  try {
    performance.measure(name, start, end);
  } catch {
    /* A missing mark must never affect the map. */
  }
}

function clearOwnPerformanceEntries(): void {
  if (typeof performance === "undefined") return;
  try {
    performance.clearMarks?.(SESSION_MARK);
    performance.clearMarks?.(LOAD_MARK);
    performance.clearMarks?.(IDLE_MARK);
    performance.clearMeasures?.(LOAD_TO_IDLE_MEASURE);
  } catch {
    /* Older browsers may expose partial Performance APIs. */
  }
}

function boundedMs(value: number): number {
  return Math.min(MAX_REPORTED_MS, Math.max(0, Math.round(value)));
}

function boundedCount(value: number): number {
  return Math.min(MAX_REPORTED_COUNT, Math.max(0, Math.round(value)));
}

function safeTrack(
  event: string,
  props: Record<string, string | number | boolean>,
): void {
  try {
    track(event, props);
  } catch {
    /* Telemetry is never allowed to interrupt the product. */
  }
}

/**
 * Return navigation start only for a full-document navigation whose original
 * pathname is still the current pathname. After a Next.js client transition,
 * the Navigation Timing entry still names the previous page, so omitting this
 * metric is more honest than calling time spent elsewhere "map load". The URL
 * is compared locally and is never retained or reported.
 */
function directDocumentNavigationStart(): number | null {
  if (
    typeof performance === "undefined" ||
    typeof performance.getEntriesByType !== "function" ||
    typeof location === "undefined"
  ) {
    return null;
  }
  try {
    const entry = performance.getEntriesByType("navigation")[0] as
      | PerformanceNavigationTiming
      | undefined;
    if (!entry || !Number.isFinite(entry.startTime)) return null;
    const originalPath = new URL(entry.name, location.href).pathname;
    if (originalPath !== location.pathname) return null;
    return entry.startTime;
  } catch {
    return null;
  }
}

function isVisibleDocument(): boolean {
  return typeof document === "undefined" || document.visibilityState !== "hidden";
}

function stopRuntimeMonitor(runtime: RuntimeAggregate, report: boolean): void {
  if (runtime.stopped) return;
  runtime.stopped = true;
  if (runtime.rafId !== null && typeof cancelAnimationFrame === "function") {
    cancelAnimationFrame(runtime.rafId);
  }
  if (runtime.timeoutId !== null) clearTimeout(runtime.timeoutId);
  runtime.observer?.disconnect();
  if (
    runtime.onVisibilityChange &&
    typeof document !== "undefined" &&
    typeof document.removeEventListener === "function"
  ) {
    document.removeEventListener("visibilitychange", runtime.onVisibilityChange);
  }

  const endedAt = now();
  if (!report || endedAt === null) return;
  const observedMs = endedAt - runtime.startedAt;
  if (!Number.isFinite(observedMs) || observedMs < MIN_RUNTIME_REPORT_MS) return;
  safeTrack("map_runtime_quality", {
    observed_ms: boundedMs(observedMs),
    frame_gap_count: boundedCount(runtime.frameGapCount),
    frame_gap_total_ms: boundedMs(runtime.frameGapTotalMs),
    max_frame_gap_ms: boundedMs(runtime.maxFrameGapMs),
    long_task_count: boundedCount(runtime.longTaskCount),
    long_task_total_ms: boundedMs(runtime.longTaskTotalMs),
    max_long_task_ms: boundedMs(runtime.maxLongTaskMs),
  });
}

function startRuntimeMonitor(startedAt: number, windowMs: number): RuntimeAggregate | null {
  const canWatchFrames = typeof requestAnimationFrame === "function";
  const canWatchLongTasks = typeof PerformanceObserver !== "undefined";
  if (!canWatchFrames && !canWatchLongTasks) return null;

  const runtime: RuntimeAggregate = {
    startedAt,
    lastFrameAt: null,
    frameGapCount: 0,
    frameGapTotalMs: 0,
    maxFrameGapMs: 0,
    longTaskCount: 0,
    longTaskTotalMs: 0,
    maxLongTaskMs: 0,
    rafId: null,
    timeoutId: null,
    observer: null,
    onVisibilityChange: null,
    stopped: false,
  };

  if (canWatchFrames) {
    const frame = (timestamp: number) => {
      if (runtime.stopped) return;
      if (!isVisibleDocument()) {
        runtime.lastFrameAt = null;
      } else if (runtime.lastFrameAt !== null) {
        const gap = timestamp - runtime.lastFrameAt;
        if (Number.isFinite(gap) && gap >= FRAME_GAP_THRESHOLD_MS) {
          runtime.frameGapCount += 1;
          runtime.frameGapTotalMs += gap;
          runtime.maxFrameGapMs = Math.max(runtime.maxFrameGapMs, gap);
        }
      }
      runtime.lastFrameAt = timestamp;
      runtime.rafId = requestAnimationFrame(frame);
    };
    runtime.rafId = requestAnimationFrame(frame);
  }

  if (canWatchLongTasks) {
    try {
      runtime.observer = new PerformanceObserver((list) => {
        if (runtime.stopped || !isVisibleDocument()) return;
        for (const entry of list.getEntries()) {
          if (!Number.isFinite(entry.duration) || entry.duration < 50) continue;
          runtime.longTaskCount += 1;
          runtime.longTaskTotalMs += entry.duration;
          runtime.maxLongTaskMs = Math.max(runtime.maxLongTaskMs, entry.duration);
        }
      });
      runtime.observer.observe({ type: "longtask", buffered: false });
    } catch {
      runtime.observer?.disconnect();
      runtime.observer = null;
    }
  }

  if (typeof document !== "undefined" && typeof document.addEventListener === "function") {
    runtime.onVisibilityChange = () => {
      // Never count time spent backgrounded as a frozen map frame.
      runtime.lastFrameAt = null;
    };
    document.addEventListener("visibilitychange", runtime.onVisibilityChange);
  }

  runtime.timeoutId = setTimeout(
    () => stopRuntimeMonitor(runtime, true),
    Math.max(MIN_RUNTIME_REPORT_MS, windowMs),
  );
  return runtime;
}

function normalizedSampleRate(value: number | undefined): number {
  if (!Number.isFinite(value)) return DEFAULT_SAMPLE_RATE;
  return Math.min(1, Math.max(0, value as number));
}

/**
 * Begin one map-readiness session. Call during map mount, before MapLibre's
 * `load` event. The returned cleanup reports the sampled runtime aggregate and
 * releases observers, animation frames, timers, and performance entries.
 */
export function startMapPerfSession(
  options: MapPerfSessionOptions = {},
): () => void {
  const startedAt = now();
  if (startedAt === null) return () => {};

  // A second map replaces the one global map session. Flush the old sampled
  // window first so observers cannot leak across route or mode changes.
  if (activeSession?.runtime) stopRuntimeMonitor(activeSession.runtime, true);
  clearOwnPerformanceEntries();

  const sampleRate = normalizedSampleRate(options.sampleRate);
  const sampled = sampleRate > 0 && Math.random() < sampleRate;
  const candidateNavigationStart =
    options.navigationStartMs === undefined
      ? directDocumentNavigationStart()
      : options.navigationStartMs;
  const navigationStartedAt =
    candidateNavigationStart !== null &&
    Number.isFinite(candidateNavigationStart) &&
    candidateNavigationStart <= startedAt
      ? Math.max(0, candidateNavigationStart)
      : null;
  const token = Symbol("map-performance-session");
  const runtimeWindowMs = Number.isFinite(options.runtimeWindowMs)
    ? Math.max(MIN_RUNTIME_REPORT_MS, options.runtimeWindowMs as number)
    : DEFAULT_RUNTIME_WINDOW_MS;

  activeSession = {
    token,
    startedAt,
    navigationStartedAt,
    loadAt: null,
    idleAt: null,
    readyReported: false,
    sampled,
    sourceReportsRemaining: MAX_SOURCE_REPORTS_PER_SESSION,
    runtime: sampled ? startRuntimeMonitor(startedAt, runtimeWindowMs) : null,
  };
  safeMark(SESSION_MARK);

  return () => {
    if (activeSession?.token !== token) return;
    finishMapPerfSession();
  };
}

function ensureSession(): MapPerfSession | null {
  if (activeSession) return activeSession;
  startMapPerfSession();
  return activeSession;
}

/** MapLibre `load` fired: the style and first usable tiles are available. */
export function markMapOnLoad(): void {
  const session = ensureSession();
  const timestamp = now();
  if (!session || timestamp === null || session.loadAt !== null) return;
  session.loadAt = timestamp;
  safeMark(LOAD_MARK);
}

/**
 * First settled map movement. Reports readiness exactly once. A direct
 * document navigation includes navigation-to-load; a client-side transition
 * deliberately does not, because its Navigation Timing entry belongs to the
 * previous route.
 */
export function markMapIdleOnce(): void {
  const session = ensureSession();
  const timestamp = now();
  if (!session || timestamp === null || session.readyReported) return;
  session.readyReported = true;
  session.idleAt = timestamp;
  safeMark(IDLE_MARK);
  safeMeasure(LOAD_TO_IDLE_MEASURE, LOAD_MARK, IDLE_MARK);

  const props: Record<string, number> = {
    ms_session_to_idle: boundedMs(timestamp - session.startedAt),
  };
  if (session.loadAt !== null) {
    props.ms_session_to_load = boundedMs(session.loadAt - session.startedAt);
    props.ms_onload_to_idle = boundedMs(timestamp - session.loadAt);
    if (session.navigationStartedAt !== null) {
      props.ms_navigation_to_load = boundedMs(
        session.loadAt - session.navigationStartedAt,
      );
      props.ms_navigation_to_idle = boundedMs(
        timestamp - session.navigationStartedAt,
      );
    }
  }
  safeTrack("map_ready", props);
}

/**
 * Start a sampled fetch/source timer. The source and outcome are closed
 * allowlists, keeping analytics cardinality bounded. The returned function is
 * one-shot and safe to call from every success/error/abort branch.
 */
export function beginMapSourceTiming(
  source: MapPerfSource,
): (
  outcome?: MapPerfSourceOutcome,
  options?: { cached?: boolean },
) => void {
  const session = ensureSession();
  const startedAt = now();
  if (
    !session?.sampled ||
    startedAt === null ||
    !SOURCE_SET.has(source)
  ) {
    return () => {};
  }

  let reported = false;
  return (
    outcome: MapPerfSourceOutcome = "ready",
    options: { cached?: boolean } = {},
  ) => {
    if (reported) return;
    reported = true;
    const endedAt = now();
    if (
      activeSession?.token !== session.token ||
      session.sourceReportsRemaining <= 0 ||
      endedAt === null ||
      endedAt < startedAt
    ) {
      return;
    }
    session.sourceReportsRemaining -= 1;
    const props: Record<string, string | number | boolean> = {
      source,
      outcome,
      ms: boundedMs(endedAt - startedAt),
    };
    if (typeof options.cached === "boolean") props.cached = options.cached;
    safeTrack("map_source_timing", props);
  };
}

/**
 * End the active map session, reporting its sampled runtime aggregate and
 * releasing observers/timers. Safe to call more than once.
 */
export function finishMapPerfSession(): void {
  const session = activeSession;
  if (!session) return;
  activeSession = null;
  if (session.runtime) stopRuntimeMonitor(session.runtime, true);
  clearOwnPerformanceEntries();
}

/** Reset all module state without reporting partial measurements (tests/HMR). */
export function resetMapPerf(): void {
  const session = activeSession;
  activeSession = null;
  if (session?.runtime) stopRuntimeMonitor(session.runtime, false);
  clearOwnPerformanceEntries();
}
