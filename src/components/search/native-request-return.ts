"use client";

/** Optional editing and focus context belongs to one browser history entry. */
export const NATIVE_REQUEST_ENTRY_KEY = "frNativeRequestEntryV1";
const MAX_DRAFT_METADATA_CHARS = 4096;
export type NativeRequestKind = "search" | "tools";
export type NativeReturnTarget = "search-input" | "tool-filter" | "compass-find" | "tools-opener";
type Entry = {
  v: 1;
  id: string;
  href: string;
  draft?: { kind: NativeRequestKind; query: string };
  target?: NativeReturnTarget;
};
type Return = { entry: Entry; sequence: number };
let popped: Return | null = null;
let sequence = 0;
let owners = 0;
let stopOwner: (() => void) | undefined;
const subscribers = new Set<() => void>();

function currentHref() {
  return window.location.pathname + window.location.search + window.location.hash;
}
function stateObject(state: unknown): Record<string, unknown> {
  return state && typeof state === "object" && !Array.isArray(state) ? state as Record<string, unknown> : {};
}
function readEntry(state: unknown, href = currentHref()): Entry | null {
  const value = stateObject(state)[NATIVE_REQUEST_ENTRY_KEY];
  if (!value || typeof value !== "object") return null;
  const entry = value as Partial<Entry>;
  if (entry.v !== 1 || typeof entry.id !== "string" || !entry.id || entry.href !== href) return null;
  if (entry.draft && (!(["search", "tools"] as const).includes(entry.draft.kind) || typeof entry.draft.query !== "string" || entry.draft.query.length > MAX_DRAFT_METADATA_CHARS)) return null;
  if (entry.target && !(["search-input", "tool-filter", "compass-find", "tools-opener"] as const).includes(entry.target)) return null;
  return entry as Entry;
}
function publish(value: Return | null) {
  popped = value;
  for (const subscriber of subscribers) subscriber();
}
function cancelReturn() { if (popped) publish(null); }
export function subscribeNativeReturn(subscriber: () => void) {
  subscribers.add(subscriber);
  return () => { subscribers.delete(subscriber); };
}
export function getNativeReturn() { return popped; }
export function noNativeReturn() { return null; }
export function isCurrentNativeReturn(value: Return): boolean {
  return popped === value && readEntry(window.history.state)?.id === value.entry.id;
}

/** No storage, query replay, cached results, or writes to Next's reserved fields. */
export function rememberNativeRequest(context: { draft?: { kind: NativeRequestKind; query: string }; target?: NativeReturnTarget }) {
  const previous = readEntry(window.history.state);
  const entry: Entry = { ...previous, v: 1, id: previous?.id ?? (globalThis.crypto?.randomUUID?.() ?? `entry-${Date.now()}-${Math.random()}`), href: currentHref(), ...context };
  if (context.draft && context.draft.query.length > MAX_DRAFT_METADATA_CHARS) delete entry.draft;
  try {
    window.history.replaceState({ ...stateObject(window.history.state), [NATIVE_REQUEST_ENTRY_KEY]: entry }, "", window.location.href);
  } catch {
    // Optional history metadata must never prevent editing or navigation.
  }
}

export function consumeNativeReturnFocus(value: Return) {
  if (!isCurrentNativeReturn(value)) return;
  const entry = { ...value.entry };
  delete entry.target;
  try {
    window.history.replaceState({ ...stateObject(window.history.state), [NATIVE_REQUEST_ENTRY_KEY]: entry }, "", window.location.href);
  } catch {
    // Still consume this transient return if optional history writes fail.
  }
  publish({ ...value, entry });
}

/** An explicit scope refinement keeps this workspace and its entry identity. */
export function replaceNativeWorkspaceScope(href: string) {
  const url = new URL(href, window.location.href);
  const previous = readEntry(window.history.state);
  const state = { ...stateObject(window.history.state) };
  if (previous) state[NATIVE_REQUEST_ENTRY_KEY] = { ...previous, href: url.pathname + url.search + url.hash };
  // Let Next’s installed native-history adapter synchronize useSearchParams.
  // It copies its own existing internal fields back onto this caller object.
  delete state.__NA;
  delete state._N;
  window.history.replaceState(state, "", href);
}

/** The persistent header is the sole pop owner; consumers only use their own refs. */
export function installNativeReturnOwner() {
  owners += 1;
  if (owners === 1) {
    const originalPush = window.history.pushState;
    const originalReplace = window.history.replaceState;
    let active = true;
    let lastHref = currentHref();
    let lastLayer: unknown = stateObject(window.history.state).__frederickRadiusLayer;
    const rememberPosition = () => {
      lastHref = currentHref();
      lastLayer = stateObject(window.history.state).__frederickRadiusLayer;
    };
    const push: History["pushState"] = function (this: History, data, unused, url) {
      if (!active) return originalPush.call(this, data, unused, url);
      cancelReturn();
      // Next may copy custom state. A new entry must not inherit an old draft
      // or return target, including a push to the identical URL.
      const next = data && typeof data === "object" && !Array.isArray(data) ? { ...stateObject(data) } : data;
      if (next && typeof next === "object") delete (next as Record<string, unknown>)[NATIVE_REQUEST_ENTRY_KEY];
      originalPush.call(this, next, unused, url);
      rememberPosition();
    };
    const replace: History["replaceState"] = function (this: History, data, unused, url) {
      if (!active) return originalReplace.call(this, data, unused, url);
      const destination = url == null ? currentHref() : new URL(String(url), window.location.href);
      const href = typeof destination === "string" ? destination : destination.pathname + destination.search + destination.hash;
      const next = data && typeof data === "object" && !Array.isArray(data) ? { ...stateObject(data) } : data;
      if (next && typeof next === "object" && !readEntry(next, href)) delete (next as Record<string, unknown>)[NATIVE_REQUEST_ENTRY_KEY];
      if (href !== currentHref()) cancelReturn();
      originalReplace.call(this, next, unused, url);
      rememberPosition();
    };
    window.history.pushState = push;
    window.history.replaceState = replace;
    const onPop = (event: PopStateEvent) => {
      // Global Find already owns same-workspace layer dismissal and focus.
      const closingLayer = typeof lastLayer === "string" && lastHref === currentHref();
      rememberPosition();
      const entry = closingLayer ? null : readEntry(event.state);
      publish(entry ? { entry, sequence: ++sequence } : null);
    };
    window.addEventListener("popstate", onPop, true);
    // A newer intent always wins over a delayed return while a route mounts.
    const events = ["pointerdown", "keydown", "wheel", "touchstart"] as const;
    for (const event of events) window.addEventListener(event, cancelReturn, { capture: true, passive: true });
    stopOwner = () => {
      active = false;
      if (window.history.pushState === push) window.history.pushState = originalPush;
      if (window.history.replaceState === replace) window.history.replaceState = originalReplace;
      window.removeEventListener("popstate", onPop, true);
      for (const event of events) window.removeEventListener(event, cancelReturn, true);
      cancelReturn();
    };
  }
  let released = false;
  return () => {
    if (released) return;
    released = true;
    if (--owners === 0) { stopOwner?.(); stopOwner = undefined; }
  };
}
