"use client";

/**
 * Storage durability for the signed-out majority.
 *
 * Everything a signed-out user keeps — saves, passport stamps, notes,
 * home town — lives in localStorage, and browsers treat that as
 * best-effort: iOS Safari evicts a site's script-writable storage after
 * about seven days without a visit, and any "clear browsing data"
 * removes it silently. The user experiences that as "the app lost all
 * my stuff", and they are right.
 *
 * navigator.storage.persist() asks the browser to move this origin from
 * best-effort to persistent. Chromium grants it silently based on
 * engagement (and always for installed PWAs); Safari honors it for
 * installed/home-screen apps. There is no prompt on modern browsers and
 * no downside to asking, but the request carries the most weight when
 * the user has just DONE something worth protecting — so callers invoke
 * this on the first save-class write, not at boot.
 */
let requested = false;

export function ensurePersistentStorage(): void {
  if (requested || typeof navigator === "undefined") return;
  requested = true;
  try {
    void navigator.storage?.persist?.().catch(() => {});
  } catch {
    /* older browsers — best-effort storage remains the honest default */
  }
}
