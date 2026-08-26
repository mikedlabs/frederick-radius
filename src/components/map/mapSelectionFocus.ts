export type MapSelectionOpener = {
  exact: HTMLElement | null;
  fallback: HTMLElement | null;
};

let pendingOpener: MapSelectionOpener | null = null;

function validActiveElement(): HTMLElement | null {
  if (typeof document === "undefined") return null;

  const active = document.activeElement;
  return active instanceof HTMLElement &&
    active !== document.body &&
    active !== document.documentElement
    ? active
    : null;
}

/**
 * Capture the exact map control that opened a result before the result state
 * makes the surrounding dock inert.
 */
export function rememberMapSelectionOpener(): void {
  // A person can switch from one pin to another while the same closeable
  // history entry is active. Keep the original journey opener so Back returns
  // to the control they actually came from, unless that element has left the
  // document (for example after a real route change).
  if (pendingOpener?.exact?.isConnected) return;

  const exact = validActiveElement();
  const dock = exact?.closest<HTMLElement>("[data-map-dock]");
  pendingOpener = {
    exact,
    fallback:
      dock?.querySelector<HTMLElement>('[role="combobox"]') ??
      document.querySelector<HTMLElement>(
        '[data-map-dock] [role="combobox"]',
      ),
  };
}

export function takeMapSelectionOpener(): MapSelectionOpener | null {
  // MapResultSurface snapshots this target for its close button, while AppMap
  // still needs the same target if the browser's Back button closes the
  // result. The history close path clears it after focus is restored.
  return pendingOpener;
}

function canRestoreFocus(element: HTMLElement | null): element is HTMLElement {
  if (!element?.isConnected) return false;
  if (element.closest("[hidden], [inert], [aria-hidden='true']")) return false;
  if ("disabled" in element && element.disabled === true) return false;
  return true;
}

/** Restore focus after React removes the result sheet and its dock inertness. */
export function restoreMapSelectionOpenerFocus(): void {
  if (typeof document === "undefined" || typeof window === "undefined") return;

  const opener = pendingOpener;
  pendingOpener = null;
  if (!opener) return;
  const restore = (attempt = 0) => {
    if (canRestoreFocus(opener?.exact ?? null)) {
      opener?.exact?.focus({ preventScroll: true });
      return;
    }
    if (canRestoreFocus(opener?.fallback ?? null)) {
      opener?.fallback?.focus({ preventScroll: true });
      return;
    }
    if (attempt < 2) {
      window.requestAnimationFrame(() => restore(attempt + 1));
      return;
    }
    document
      .querySelector<HTMLElement>("[data-map-browse-trigger]")
      ?.focus({ preventScroll: true });
  };

  window.requestAnimationFrame(() => restore());
}

/** Test and lifecycle escape hatch; ordinary selection close should restore. */
export function clearMapSelectionOpener(): void {
  pendingOpener = null;
}
