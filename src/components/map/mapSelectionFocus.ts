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
  const opener = pendingOpener;
  pendingOpener = null;
  return opener;
}
