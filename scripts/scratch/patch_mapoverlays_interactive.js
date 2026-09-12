const fs = require('fs');
let content = fs.readFileSync('src/components/map/MapOverlays.tsx', 'utf8');

const layerIdsAnchor = 'const layerIds = active.flatMap((k) => [`ov-${k}-pt`, `ov-${k}-fill`]);';
const layerIdsInjection = 'const layerIds = active.flatMap((k) => [`ov-${k}-pt`, `ov-${k}-fill`, `ov-${k}-extrusion`]);';
content = content.replace(layerIdsAnchor, layerIdsInjection);

const popupAnchor = `function popupFromFeature(
  key: OverlayKey,
  feature: GeoJSON.Feature,
  anchor: { lng: number; lat: number },
): PopupState {
  const p = (feature.properties ?? {}) as Record<string, string>;
  return {`;

const popupInjection = `function popupFromFeature(
  key: OverlayKey,
  feature: GeoJSON.Feature,
  anchor: { lng: number; lat: number },
): PopupState {
  const p = (feature.properties ?? {}) as Record<string, any>;
  if (key === "land-value") {
    return {
      ...anchor,
      key,
      name: "Estimated Value: " + new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(p.land_value || 0),
      summary: "Simulated land value based on proximity to downtown and I-270 corridor.",
      popupLabel: "Parcel Hexagon"
    };
  }
  return {`;

content = content.replace(popupAnchor, popupInjection);

fs.writeFileSync('src/components/map/MapOverlays.tsx', content);
console.log('Patched MapOverlays.tsx interactive');
