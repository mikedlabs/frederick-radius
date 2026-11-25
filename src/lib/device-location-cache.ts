// The browser can suspend timers. Recheck this deadline on every read and when
// a page resumes, and proactively remove the record while an open tab is idle.
export type GeoPosition = {
  lng: number;
  lat: number;
  accuracy: number;
  /** Reverse-geocoded muni slug if user is inside one of our 12, else "frederick-county" */
  municipality_slug?: string;
  /** Friendly label like "1.2 mi from Carroll Creek" or "Brunswick, MD" */
  label?: string;
  timestamp: number;
};

const STORAGE_KEY = "fr_geo_v1";
const TTL_MS = 1000 * 60 * 30; // 30 min cache
/** Same-document signal for surfaces that need to re-rank after a location
 * fix changes. The browser `storage` event does not fire in the tab that made
 * the change, so sessionStorage alone cannot keep independent components in
 * sync. */
export const GEOLOCATION_CHANGE_EVENT = "fr:geolocation-change";

let expiresAt: number | null = null;
let timer: ReturnType<typeof setTimeout> | undefined;
// Requests still work when sessionStorage is disabled. This fix follows the
// same deadline and stays confined to the current document.
let memoryFallback: GeoPosition | null = null;

function forgetPosition() {
  memoryFallback = null;
  try { window.sessionStorage.removeItem(STORAGE_KEY); } catch { /* storage disabled */ }
}

function stopTimer() {
  clearTimeout(timer);
  expiresAt = null;
}

function announceChange() {
  window.dispatchEvent(new Event(GEOLOCATION_CHANGE_EVENT));
}

function scheduleExpiry(timestamp: number) {
  const deadline = timestamp + TTL_MS;
  if (expiresAt === deadline) return;
  stopTimer();
  expiresAt = deadline;
  timer = setTimeout(() => {
    expiresAt = null;
    if (!readCachedGeoPosition()) announceChange();
  }, Math.max(0, deadline - Date.now()));
}

export function readCachedGeoPosition(): GeoPosition | null {
  if (typeof window === "undefined") return null;
  let position = memoryFallback;
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    if (!raw && !position) return null;
    if (raw && !position) position = JSON.parse(raw);
  } catch { /* malformed or inaccessible storage */ }
  if (position && Number.isFinite(position.timestamp) &&
      Number.isFinite(position.lng) && Number.isFinite(position.lat)) {
    const age = Date.now() - position.timestamp;
    if (age >= 0 && age < TTL_MS) {
      scheduleExpiry(position.timestamp);
      return position;
    }
  }
  forgetPosition();
  return null;
}

export function recheckLocationExpiry() {
  const hadDeadline = expiresAt !== null;
  if (readCachedGeoPosition()) return;
  stopTimer();
  if (hadDeadline) announceChange();
}

export function persistGeoPosition(position: GeoPosition) {
  if (typeof window === "undefined") return;
  const existing = readCachedGeoPosition();
  if (existing && existing.timestamp > position.timestamp) {
    // Independent location controls can finish out of order.
    announceChange();
    return;
  }
  memoryFallback = null;
  try { window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(position)); }
  catch { memoryFallback = position; }
  // Discard even a newly delivered fix if the device captured it too long ago.
  readCachedGeoPosition();
  announceChange();
}

export function clearGeoPosition() {
  if (typeof window === "undefined") return;
  forgetPosition();
  stopTimer();
  announceChange();
}
