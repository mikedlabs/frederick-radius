import { normalizeBrowseReturnTo } from "./browse-return";

export const BROWSE_SCROLL_RETURN_KEY = "fr:browse-scroll-return:v1";
const RETURN_INTENT_MAX_AGE_MS = 30_000;
type ReturnStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

function listingKey(raw: unknown): string | null {
  const path = normalizeBrowseReturnTo(raw);
  if (!path) return null;
  const url = new URL(path, "https://frederick-radius.invalid");
  return `${url.pathname}${url.search}`;
}

/** Explicit Back links load a fresh document to preserve the correct map
 * state. Carry only the intent to reuse its existing per-URL scroll memory. */
export function markBrowseScrollReturn(raw: unknown, storage?: ReturnStorage, now = Date.now()): void {
  const key = listingKey(raw);
  if (!key) return;
  try {
    (storage ?? window.sessionStorage).setItem(BROWSE_SCROLL_RETURN_KEY, JSON.stringify({ key, at: now }));
  } catch {
    // Device storage can be unavailable; the ordinary safe link still works.
  }
}

/** One use, exact route/query, short lifetime. An unrelated navigation removes
 * the intent so a later visit cannot unexpectedly restore an old position. */
export function consumeBrowseScrollReturn(raw: unknown, storage?: ReturnStorage, now = Date.now()): boolean {
  try {
    const target = storage ?? window.sessionStorage;
    const serialized = target.getItem(BROWSE_SCROLL_RETURN_KEY);
    if (serialized === null) return false;
    target.removeItem(BROWSE_SCROLL_RETURN_KEY);
    const value = JSON.parse(serialized) as { key?: unknown; at?: unknown } | null;
    if (!value || typeof value.key !== "string" || typeof value.at !== "number" || !Number.isFinite(value.at)) return false;
    const key = listingKey(raw);
    const age = now - value.at;
    return key !== null && key === value.key && age >= 0 && age <= RETURN_INTENT_MAX_AGE_MS;
  } catch {
    return false;
  }
}
