/** Optional startup reads must not begin or resume in a departing document.
 * Install the departure marker before React can flush passive effects. A
 * visible event alone cannot revive a page hidden for navigation; pageshow can. */
let departing = false;
if (typeof window !== "undefined") {
  window.addEventListener("pagehide", () => { departing = true; });
  window.addEventListener("pageshow", () => { departing = false; });
}

export function documentReadIsActive(): boolean {
  return typeof document !== "undefined"
    && !departing && document.visibilityState === "visible";
}

/** Yield startup work one frame, then recheck admission. Cancellation is also
 * reported to promise-owning callers so a skipped read cannot remain cached. */
export function scheduleDocumentRead(start: () => void, skipped: () => void = () => {}): () => void {
  if (!documentReadIsActive()) { skipped(); return () => {}; }
  let settled = false;
  const cleanup = () => {
    window.removeEventListener("pagehide", cancel);
    document.removeEventListener("visibilitychange", onVisibility);
  };
  const cancel = () => {
    if (settled) return;
    settled = true;
    window.cancelAnimationFrame(frame);
    cleanup();
    skipped();
  };
  const onVisibility = () => { if (!documentReadIsActive()) cancel(); };
  window.addEventListener("pagehide", cancel);
  document.addEventListener("visibilitychange", onVisibility);
  const frame = window.requestAnimationFrame(() => {
    if (settled) return;
    settled = true;
    cleanup();
    if (documentReadIsActive()) start();
    else skipped();
  });
  return cancel;
}
