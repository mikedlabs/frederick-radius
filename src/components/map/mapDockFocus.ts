/**
 * Move focus out of the map command dock before React makes an open pane
 * hidden and inert. Browsers warn (and assistive technology can become
 * stranded) when an element keeps focus while one of its ancestors is hidden.
 *
 * A map gesture is different from the Done/Escape path: the person has
 * already returned to the canvas, so focus belongs on that canvas rather than
 * back on the Browse trigger.
 */
export function focusMapBeforeDockDismiss(
  dockElement: HTMLElement | null,
): boolean {
  if (!dockElement) return false;

  const doc = dockElement.ownerDocument;
  const HTMLElementCtor = doc.defaultView?.HTMLElement;
  const active = doc.activeElement;
  if (!HTMLElementCtor || !(active instanceof HTMLElementCtor)) return false;
  if (!dockElement.contains(active)) return false;

  const host = dockElement.closest<HTMLElement>(".dock-host");
  const canvas = host?.querySelector<HTMLElement>(
    ".mapboxgl-canvas, .maplibregl-canvas",
  );

  if (canvas && !dockElement.contains(canvas)) {
    canvas.focus({ preventScroll: true });
  }

  // A canvas without its expected tabindex may reject programmatic focus.
  // Blurring is still safer than hiding an ancestor around focused content.
  if (doc.activeElement === active) active.blur();
  return true;
}
