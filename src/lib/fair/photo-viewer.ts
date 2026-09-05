/** Public, fixed assets only. The viewer never receives a plan or position. */
export const FAIR_PHOTO_VIEWER_PATH = "/fair-photo-viewer";
export const FAIR_PHOTO_VIEWER_SCRIPT = "/fair-viewer-assets/viewer.js";
export const FAIR_PHOTO_SOURCE = "/images/fair/fairgrounds-night-mike-d-1920.webp";
export const FAIR_PHOTO_PREVIEW = "/images/fair/fairgrounds-night-mike-d-960.webp";
export const FAIR_PHOTO_ASPECT = 16 / 9;
export const FAIR_PHOTO_MAX_SPLATS = 1_200;
export const FAIR_PHOTO_MAX_DPR = 1.5;

export const FAIR_PHOTO_VIEWER_CSP = [
  "default-src 'none'",
  "base-uri 'none'",
  "object-src 'none'",
  "frame-ancestors 'self'",
  "form-action 'none'",
  "script-src 'self' 'wasm-unsafe-eval'",
  "style-src 'unsafe-inline'",
  "img-src 'self'",
  "connect-src 'self' data:",
  "worker-src 'self' blob:",
].join("; ");

export type FairPhotoViewerMessage =
  | { type: "radius:fair-photo"; version: 1; status: "ready" }
  | {
      type: "radius:fair-photo";
      version: 1;
      status: "error";
      reason: "motion" | "data" | "webgl" | "timeout" | "render";
    };

/** Check BOTH origin and the mounted iframe window before accepting its data. */
export function readFairPhotoViewerMessage(
  event: Pick<MessageEvent, "origin" | "source" | "data">,
  expectedOrigin: string,
  expectedSource: MessageEventSource | null,
): FairPhotoViewerMessage | null {
  if (!expectedSource || event.origin !== expectedOrigin || event.source !== expectedSource) return null;
  const value: unknown = event.data;
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const candidate = value as Record<string, unknown>;
  if (candidate.type !== "radius:fair-photo" || candidate.version !== 1) return null;
  if (candidate.status === "ready" && Object.keys(candidate).length === 3) {
    return { type: "radius:fair-photo", version: 1, status: "ready" };
  }
  if (
    candidate.status === "error" && Object.keys(candidate).length === 4 &&
    typeof candidate.reason === "string" &&
    ["motion", "data", "webgl", "timeout", "render"].includes(candidate.reason)
  ) {
    return candidate as FairPhotoViewerMessage;
  }
  return null;
}

export type PhotoLightSample = { x: number; y: number; red: number; green: number; blue: number; brightness: number };

/** Select actual bright photo pixels, without inventing depth or new landmarks. */
export function samplePhotoLights(
  rgba: ArrayLike<number>, width: number, height: number, limit = FAIR_PHOTO_MAX_SPLATS,
): PhotoLightSample[] {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width <= 0 || height <= 0 || rgba.length !== width * height * 4) return [];
  const lights: PhotoLightSample[] = [];
  for (let y = 0; y < height; y += 2) {
    for (let x = 0; x < width; x += 2) {
      const index = (y * width + x) * 4;
      const red = rgba[index] / 255;
      const green = rgba[index + 1] / 255;
      const blue = rgba[index + 2] / 255;
      const brightness = Math.max(red, green, blue);
      if (rgba[index + 3] < 200 || brightness < 0.72) continue;
      lights.push({ x: (x + 0.5) / width, y: (y + 0.5) / height, red, green, blue, brightness });
    }
  }
  return lights.sort((a, b) => b.brightness - a.brightness).slice(0, Math.max(0, Math.min(FAIR_PHOTO_MAX_SPLATS, Math.floor(limit))));
}
