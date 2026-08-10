import type { Marker as MapboxMarker } from "maplibre-gl";

/**
 * Mapbox gives every DOM-marker wrapper `role="img"` and a generic
 * "Map marker" label. When the marker contains a real button, that creates
 * nested interactive accessibility nodes and masks the useful button name.
 * Remove only the generated wrapper semantics; the child keeps ownership of
 * its own accessible name and keyboard behavior.
 */
export function exposeMarkerChild(marker: MapboxMarker | null): void {
  const element = marker?.getElement();
  element?.removeAttribute("role");
  element?.removeAttribute("aria-label");
}
