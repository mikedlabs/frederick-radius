export const ERROR_BOUNDARY_MARKERS_BY_KIND = {
  component: [
    "Something glitched",
    "A piece of this page failed to render on your device.",
  ],
  route: [
    "Page error",
    "This page could not load.",
    "Frederick Radius could not finish loading this page.",
  ],
  global: [
    "Application error",
    "Frederick Radius could not load.",
    "Something failed while loading this page.",
  ],
} as const;

export const ERROR_BOUNDARY_MARKERS = Object.values(
  ERROR_BOUNDARY_MARKERS_BY_KIND,
).flat();

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Matches every distinctive sentence in the component, route, and root
 * fallbacks. Keeping several markers per boundary makes the runtime gate
 * resilient to a small copy edit instead of depending on one headline.
 */
export const ERROR_BOUNDARY_PATTERN = new RegExp(
  ERROR_BOUNDARY_MARKERS.map(escapeRegex).join("|"),
  "i",
);

export function findErrorBoundaryMarker(text: string | null | undefined): string | null {
  return text?.match(ERROR_BOUNDARY_PATTERN)?.[0] ?? null;
}
