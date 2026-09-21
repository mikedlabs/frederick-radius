/** Image-space camera only. These coordinates are never geographic positions. */
export type BoothCamera = { x: number; y: number; zoom: number };
export type BoothCanvas = { x?: number; y?: number; width: number; height: number };
export type BoothBox = { x: number; y: number; width: number; height: number; rotationDeg: number };
export const MAX_BOOTH_ZOOM = 18;

export function fitBoothCamera(map: BoothCanvas): BoothCamera {
  return { x: (map.x ?? 0) + map.width / 2, y: (map.y ?? 0) + map.height / 2, zoom: 1 };
}

export function boothViewBox(map: BoothCanvas, viewport: BoothCanvas, camera: BoothCamera) {
  const aspect = Math.max(1, viewport.width) / Math.max(1, viewport.height);
  const width = Math.max(map.width, map.height * aspect) / camera.zoom;
  const height = Math.max(map.height, map.width / aspect) / camera.zoom;
  return { x: camera.x - width / 2, y: camera.y - height / 2, width, height };
}

export function constrainBoothCamera(map: BoothCanvas, viewport: BoothCanvas, camera: BoothCamera): BoothCamera {
  const zoom = Math.min(MAX_BOOTH_ZOOM, Math.max(1, camera.zoom));
  if (zoom === 1) return fitBoothCamera(map);
  const bounds = boothViewBox(map, viewport, { ...camera, zoom });
  const clampAxis = (value: number, origin: number, size: number, visible: number) => visible >= size
    ? origin + size / 2
    : Math.max(origin + visible / 2, Math.min(origin + size - visible / 2, value));
  return { x: clampAxis(camera.x, map.x ?? 0, map.width, bounds.width), y: clampAxis(camera.y, map.y ?? 0, map.height, bounds.height), zoom };
}

export function fitBoothAreaCamera(map: BoothCanvas, viewport: BoothCanvas, area: BoothCanvas): BoothCamera {
  const full = boothViewBox(map, viewport, fitBoothCamera(map));
  const zoom = Math.max(1, Math.min(MAX_BOOTH_ZOOM, full.width / (area.width * 1.08), full.height / (area.height * 1.08)));
  return constrainBoothCamera(map, viewport, { x: (area.x ?? 0) + area.width / 2, y: (area.y ?? 0) + area.height / 2, zoom });
}

export function zoomBoothCamera(map: BoothCanvas, viewport: BoothCanvas, camera: BoothCamera, factor: number, anchor = { x: viewport.width / 2, y: viewport.height / 2 }): BoothCamera {
  const zoom = Math.min(MAX_BOOTH_ZOOM, Math.max(1, camera.zoom * factor));
  const oldBox = boothViewBox(map, viewport, camera);
  const newBox = boothViewBox(map, viewport, { ...camera, zoom });
  return constrainBoothCamera(map, viewport, {
    x: camera.x + (anchor.x / Math.max(1, viewport.width) - 0.5) * (oldBox.width - newBox.width),
    y: camera.y + (anchor.y / Math.max(1, viewport.height) - 0.5) * (oldBox.height - newBox.height),
    zoom,
  });
}

export function panBoothCamera(map: BoothCanvas, viewport: BoothCanvas, camera: BoothCamera, dx: number, dy: number): BoothCamera {
  const box = boothViewBox(map, viewport, camera);
  return constrainBoothCamera(map, viewport, {
    ...camera,
    x: camera.x - dx * box.width / Math.max(1, viewport.width),
    y: camera.y - dy * box.height / Math.max(1, viewport.height),
  });
}

export function focusBoothCamera(map: BoothCanvas, viewport: BoothCanvas, booth: BoothBox): BoothCamera {
  const angle = booth.rotationDeg * Math.PI / 180;
  const width = Math.abs(booth.width * Math.cos(angle)) + Math.abs(booth.height * Math.sin(angle));
  const height = Math.abs(booth.width * Math.sin(angle)) + Math.abs(booth.height * Math.cos(angle));
  const full = boothViewBox(map, viewport, fitBoothCamera(map));
  // Aim for a roughly 48px booth while leaving neighboring rows in view.
  // Manual zoom can go farther; a selection should retain useful context.
  const fitScale = Math.max(1, viewport.width) / full.width;
  const zoom = Math.min(10, MAX_BOOTH_ZOOM, Math.max(2.5, 48 / (Math.max(width, height) * fitScale)));
  return constrainBoothCamera(map, viewport, {
    x: booth.x + booth.width / 2 * Math.cos(angle) - booth.height / 2 * Math.sin(angle),
    y: booth.y + booth.width / 2 * Math.sin(angle) + booth.height / 2 * Math.cos(angle),
    zoom,
  });
}
