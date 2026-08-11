/**
 * MapLibre deliberately opens compact attribution on first render and waits
 * for a drag before minimizing it. On a touch-first map that leaves the legal
 * copy over the most useful part of the HUD until someone happens to pan.
 *
 * Keep the standard control and its accessible toggle, but start it in the
 * same compact state MapLibre reaches after the first interaction.
 */
export function collapseInitialMapAttribution(container: HTMLElement): boolean {
  const attribution = container.querySelector<HTMLElement>(
    ".maplibregl-ctrl-attrib.maplibregl-compact",
  );
  if (!attribution) return false;

  attribution.classList.remove("maplibregl-compact-show");
  return true;
}
