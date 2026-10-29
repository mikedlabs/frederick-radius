/** Root-tab browse memory only. URLs/positions stay in this browser tab's
 * session; private Events search/view state stays in this document's memory. */
export const PRIMARY_TAB_SESSION_KEY = "fr:primary-tabs:v1";
const INTENT_KEY = "fr:primary-tab-resume:v1";
const BASE = new URL("https://frederick-radius.invalid");
const MAX_AGE_MS = 12 * 60 * 60_000;
const INTENT_AGE_MS = 30_000;
export type PrimaryTabRoot = "/today" | "/map" | "/events" | "/my-radius";
type SessionStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;
export type PrimaryTabSnapshot = { href: string; scrollY: number; at: number };
type Session = Partial<Record<PrimaryTabRoot, PrimaryTabSnapshot>>;
const ROOTS: readonly PrimaryTabRoot[] = ["/today", "/map", "/events", "/my-radius"];
const KEYS: Record<PrimaryTabRoot, readonly string[]> = {
  "/today": ["in", "view"],
  "/map": ["in", "c", "cats", "am", "gems", "m", "when", "r", "civic", "unv", "intent", "sub", "t", "open", "at", "amenity", "show", "scene", "deals", "music", "mode", "place", "event", "layers", "minutes", "task", "area"],
  "/events": ["in", "cats", "m", "when", "r", "civic", "unv", "d", "lens", "tod", "intent", "sub", "free", "happy", "kids", "lgbtq", "access", "recurring", "sort"],
  "/my-radius": [],
};
const FORBIDDEN = /^(?:returnTo|return|redirect|next|callback|token|code|key|secret|email|account|note|notes|signature|sig|endpoint|manage_token)$/i;
let fallback: Session = {};
let fallbackIntent: PrimaryTabSnapshot | null = null;
let appliedIntent: PrimaryTabSnapshot | null = null;
let eventsView: { href: string; at: number; q: string; view: EventsTabView["view"] } | null = null;
let mapView: { href: string; at: number; q: string; pendingUrlWrite: boolean } | null = null;
export type EventsTabView = { q: string; view: "list" | "calendar" | "compact" | "map" };
export type MapTabView = { q: string };

export function primaryTabRoot(raw: string): PrimaryTabRoot | null {
  return ROOTS.includes(raw as PrimaryTabRoot) ? raw as PrimaryTabRoot : null;
}

/** No detail/account/return paths or arbitrary query payloads enter storage.
 * Free search text is intentionally absent from this URL codec. */
export function normalizePrimaryTabHref(raw: unknown): string | null {
  if (typeof raw !== "string" || !raw.startsWith("/") || raw.startsWith("//")
    || raw.length > 2_048 || /[\\\u0000-\u001f\u007f]/.test(raw)) return null;
  let url: URL;
  try { url = new URL(raw, BASE); } catch { return null; }
  const root = primaryTabRoot(url.pathname);
  if (!root || url.origin !== BASE.origin || raw.split(/[?#]/, 1)[0] !== root) return null;
  const query = new URLSearchParams();
  for (const [key, value] of url.searchParams) {
    if (FORBIDDEN.test(key)) return null;
    if (!KEYS[root].includes(key)) continue;
    if (query.has(key)) return null;
    if (!value || value.length > 160 || /[\\\u0000-\u001f\u007f@/]/.test(value)) continue;
    if (key === "c") {
      const camera = value.split(",").map(Number);
      if (camera.length !== 3 || !camera.every(Number.isFinite) || Math.abs(camera[0]) > 180
        || Math.abs(camera[1]) > 90 || camera[2] < 0 || camera[2] > 24) continue;
    } else if (!/^[a-zA-Z0-9_:.,-]+$/.test(value)) continue;
    query.set(key, value);
  }
  // Only public section identifiers; never arbitrary user-provided fragments.
  const hash = /^#(?:today-discovery|today-saved|main-content|events-heading)$/.test(url.hash) ? url.hash : "";
  return `${root}${query.size ? `?${query}` : ""}${hash}`;
}

function validSnapshot(value: unknown, now: number): value is PrimaryTabSnapshot {
  if (!value || typeof value !== "object") return false;
  const item = value as PrimaryTabSnapshot;
  return normalizePrimaryTabHref(item.href) === item.href && Number.isFinite(item.scrollY)
    && item.scrollY >= 0 && item.scrollY <= 100_000 && Number.isFinite(item.at)
    && now >= item.at && now - item.at <= MAX_AGE_MS;
}
function storageOrDefault(storage?: SessionStorage) { return storage ?? window.sessionStorage; }
function readSession(storage: SessionStorage | undefined, now: number): Session {
  let raw: string | null;
  try {
    raw = storageOrDefault(storage).getItem(PRIMARY_TAB_SESSION_KEY);
  } catch { return Object.fromEntries(Object.entries(fallback).filter(([, item]) => validSnapshot(item, now))); }
  try {
    if (!raw || raw.length > 12_000) return {};
    const parsed = JSON.parse(raw) as Session;
    return Object.fromEntries(ROOTS.flatMap(root => {
      const item = parsed?.[root];
      return validSnapshot(item, now) && new URL(item.href, BASE).pathname === root
        ? [[root, { href: item.href, scrollY: item.scrollY, at: item.at }]] : [];
    }));
  } catch { return {}; }
}
export function rememberPrimaryTab(raw: string, scrollY: number, storage?: SessionStorage, now = Date.now()): void {
  const href = normalizePrimaryTabHref(raw);
  if (appliedIntent && appliedIntent.href !== href) appliedIntent = null;
  if (!href || !Number.isFinite(scrollY) || scrollY < 0 || scrollY > 100_000) return;
  const root = new URL(href, BASE).pathname as PrimaryTabRoot;
  // Map q is already a supported URL field, but a new tab-memory copy of
  // its free text must stay in this document. AppMap owns mount restoration.
  if (root === "/map" && !(mapView?.href === href && mapView.pendingUrlWrite
    && now >= mapView.at && now - mapView.at <= MAX_AGE_MS)) {
    rememberMapTabView(raw, { q: new URL(raw, BASE).searchParams.get("q") ?? "" }, now);
  }
  const next = { ...readSession(storage, now), [root]: { href, scrollY, at: now } };
  fallback = next;
  try { storageOrDefault(storage).setItem(PRIMARY_TAB_SESSION_KEY, JSON.stringify(next)); } catch { /* in-document fallback */ }
}
function readIntent(storage: SessionStorage | undefined, now: number): PrimaryTabSnapshot | null {
  let value: unknown;
  let raw: string | null;
  try {
    raw = storageOrDefault(storage).getItem(INTENT_KEY);
  } catch { return validSnapshot(fallbackIntent, now) && now - fallbackIntent.at <= INTENT_AGE_MS ? fallbackIntent : null; }
  try { value = raw && raw.length <= 3_000 ? JSON.parse(raw) : null; } catch { return null; }
  return validSnapshot(value, now) && now - value.at <= INTENT_AGE_MS ? value : null;
}
export function cancelPrimaryTabResume(storage?: SessionStorage): void {
  fallbackIntent = null; appliedIntent = null;
  try { storageOrDefault(storage).removeItem(INTENT_KEY); } catch { /* optional session memory */ }
}
function matchesResumeHref(intent: PrimaryTabSnapshot, raw: string): boolean {
  if (intent.href === raw) return true;
  if (!mapView || mapView.href !== intent.href || !mapView.q || normalizePrimaryTabHref(raw) !== intent.href) return false;
  const expected = new URL(intent.href, BASE);
  if (expected.pathname !== "/map") return false;
  // AppMap's one-time layout handoff may write this admitted private query
  // before ScrollMemory's passive effect consumes the public-only intent.
  expected.searchParams.set("q", mapView.q);
  return `${expected.pathname}${expected.search}${expected.hash}` === raw;
}
/** Called only by a plain primary-tab activation, never on route arrival. */
export function preparePrimaryTabResume(root: string, storage?: SessionStorage, now = Date.now()): PrimaryTabSnapshot | null {
  const tab = primaryTabRoot(root);
  const snapshot = tab ? readSession(storage, now)[tab] ?? null : null;
  cancelPrimaryTabResume(storage);
  if (!snapshot) return null;
  const intent = { ...snapshot, at: now };
  fallbackIntent = intent;
  try { storageOrDefault(storage).setItem(INTENT_KEY, JSON.stringify(intent)); } catch { /* in-document fallback */ }
  return intent;
}
/** Distinct from explicit detail Back: resuming a tab must not resurrect an
 * unrelated old detail focus-return transaction. Exact URL and one use. */
export function consumePrimaryTabResume(raw: string, storage?: SessionStorage, now = Date.now()): PrimaryTabSnapshot | null {
  const pending = readIntent(storage, now);
  fallbackIntent = null;
  try { storageOrDefault(storage).removeItem(INTENT_KEY); } catch { /* optional session memory */ }
  if (!pending || !matchesResumeHref(pending, raw)) {
    if (appliedIntent && !matchesResumeHref(appliedIntent, raw)) appliedIntent = null;
    return null;
  }
  appliedIntent = pending;
  return pending;
}
export function rememberEventsTabView(raw: string, value: EventsTabView, now = Date.now()): void {
  const href = normalizePrimaryTabHref(raw);
  if (!href || new URL(href, BASE).pathname !== "/events" || typeof value.q !== "string"
    || !["list", "calendar", "compact", "map"].includes(value.view)) return;
  eventsView = { href, at: now, q: value.q.slice(0, 200), view: value.view };
}
/** Mount-only reader for an explicitly resumed Events tab. Never reads or
 * writes search text in persistent storage or restores it on a direct link. */
export function readResumedEventsTabView(raw: string, now = Date.now()): EventsTabView | null {
  const intent = readIntent(undefined, now) ?? appliedIntent;
  if (!intent || now < intent.at || now - intent.at > INTENT_AGE_MS || intent.href !== raw
    || !eventsView || eventsView.href !== raw || now < eventsView.at || now - eventsView.at > MAX_AGE_MS) return null;
  return { q: eventsView.q, view: eventsView.view };
}

export function rememberMapTabView(raw: string, value: MapTabView, now = Date.now(), options: { pendingUrlWrite?: boolean } = {}): void {
  const href = normalizePrimaryTabHref(raw);
  if (!href || new URL(href, BASE).pathname !== "/map" || typeof value.q !== "string") return;
  mapView = { href, at: now, q: value.q.slice(0, 160), pendingUrlWrite: options.pendingUrlWrite ?? false };
}
/** AppMap must give an explicit URL q precedence. This optional handoff is
 * admitted only by a root-tab activation, and never persists the search. */
export function readResumedMapTabView(raw: string, now = Date.now()): MapTabView | null {
  const intent = readIntent(undefined, now) ?? appliedIntent;
  if (!intent || now < intent.at || now - intent.at > INTENT_AGE_MS || !matchesResumeHref(intent, raw)
    || !mapView || mapView.href !== normalizePrimaryTabHref(raw) || now < mapView.at || now - mapView.at > MAX_AGE_MS) return null;
  return { q: mapView.q };
}
