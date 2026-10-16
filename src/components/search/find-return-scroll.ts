const LAYER_KEY = "__frederickRadiusLayer";
let cancelPendingReturn: (() => void) | null = null;

function currentLayer(): unknown {
  return window.history.state?.[LAYER_KEY] ?? null;
}

function historySignature(): string | null {
  try {
    return JSON.stringify(window.history.state) ?? "null";
  } catch {
    // Unreadable history cannot establish that Find still owns this return.
    return null;
  }
}

/** Give a quiet Close its final layout-settling return, never a later action. */
export function settleFindReturnScroll(scrollY: number | null, layerId: string): () => void {
  cancelPendingReturn?.();
  if (scrollY === null || !Number.isFinite(scrollY)) return () => {};

  const href = window.location.href;
  const initialScrollY = window.scrollY;
  const openingLayer = currentLayer();
  let expectedHistory = historySignature();
  if (expectedHistory === null || (openingLayer !== null && openingLayer !== layerId)) return () => {};
  let awaitingClosePop = openingLayer === layerId;
  let cancelled = false;
  const interactions = ["pointerdown", "wheel", "touchstart", "keydown", "pagehide"] as const;

  const cancel = () => {
    if (cancelled) return;
    cancelled = true;
    window.clearTimeout(timer);
    for (const type of interactions) window.removeEventListener(type, cancel, true);
    window.removeEventListener("scroll", onScroll, true);
    window.removeEventListener("popstate", onPopState, true);
    window.removeEventListener("hashchange", cancel, true);
    if (cancelPendingReturn === cancel) cancelPendingReturn = null;
  };
  const onScroll = () => {
    // The history hook's existing two-frame restoration may reach this exact
    // target. Any different scroll, including scrollIntoView, is a new choice.
    if (Math.abs(window.scrollY - scrollY) > 1) cancel();
  };
  const onPopState = () => {
    if (awaitingClosePop && window.location.href === href && currentLayer() === null) {
      awaitingClosePop = false;
      expectedHistory = historySignature();
      if (expectedHistory === null) cancel();
    } else {
      cancel();
    }
  };

  cancelPendingReturn = cancel;
  for (const type of interactions) window.addEventListener(type, cancel, { capture: true, passive: true });
  window.addEventListener("scroll", onScroll, { capture: true, passive: true });
  window.addEventListener("popstate", onPopState, true);
  window.addEventListener("hashchange", cancel, true);
  const timer = window.setTimeout(() => {
    const unchangedScroll = Math.abs(window.scrollY - initialScrollY) <= 1
      || Math.abs(window.scrollY - scrollY) <= 1;
    const mayRestore = !awaitingClosePop
      && window.location.href === href
      && historySignature() === expectedHistory
      && currentLayer() === null
      && !document.getElementById("radius-find-dialog")
      && unchangedScroll;
    cancel();
    if (mayRestore) window.scrollTo({ top: scrollY, behavior: "auto" });
  }, 220);
  return cancel;
}
