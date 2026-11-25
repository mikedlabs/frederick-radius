/** Only a native history entry that originally owned Find may reopen it.
 * Keep search words and the public place slug in this tab. The history entry
 * already has an opaque layer ID and never needs a query, result or location. */
type FindResultReturn = { query: string; href: string };
const memory = new Map<string, FindResultReturn>();
const key = (id: string) => `fr:find-result-return:${id}`;

export function isPlaceDetailPath(href: string) {
  return /^\/places\/[a-z0-9][a-z0-9-]*\/?$/i.test(href);
}

export function rememberFindResult(id: string, query: string, href: string) {
  if (!isPlaceDetailPath(href)) return;
  const result = { query, href };
  memory.set(id, result);
  try { window.sessionStorage.setItem(key(id), JSON.stringify(result)); } catch { /* BFCache still has memory. */ }
}

export function readFindResultReturn() {
  const state = window.history.state;
  const id = state?.__frederickRadiusLayer;
  if (typeof id !== "string" || !/^find:\d+:\d+$/.test(id)) return null;
  let result = memory.get(id);
  if (!result) {
    try { result = JSON.parse(window.sessionStorage.getItem(key(id)) ?? "null"); } catch { return null; }
  }
  if (!result || typeof result.query !== "string" || typeof result.href !== "string" || !isPlaceDetailPath(result.href)) return null;
  const scrollY = state.__frederickRadiusLayerScrollY;
  return { id, ...result, scrollY: typeof scrollY === "number" && Number.isFinite(scrollY) ? scrollY : null };
}

export function forgetFindResult(id: string) {
  memory.delete(id);
  try { window.sessionStorage.removeItem(key(id)); } catch { /* Storage is optional. */ }
}
