/** Source labels describe the reviewed publisher, independently of its license. */
export function curatedPhotoSourceLabel(sourceUrl: string): string {
  try {
    const url = new URL(sourceUrl);
    if (url.protocol !== "https:" || url.username || url.password) return "Photo source";
    if (url.hostname === "commons.wikimedia.org") return "Wikimedia Commons";
    if (url.hostname === "services5.arcgis.com" && url.pathname.startsWith(
      "/o8KSxSzYaulbGcFX/arcgis/rest/services/survey123_4590893d5fdc4e6ab6d653f985715200_results/FeatureServer/0/",
    )) return "Frederick County";
  } catch { /* Unknown source identity stays generic. */ }
  return "Photo source";
}

/** Capture dates describe the photograph, not current business appearance. */
export function curatedPhotoReferenceLabel(capturedOn: unknown): string | null {
  if (typeof capturedOn !== "string" || !/^[1-9]\d{3}-\d{2}-\d{2}$/.test(capturedOn)) return null;
  const date = new Date(`${capturedOn}T00:00:00Z`);
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== capturedOn) return null;
  return `Reference photo · ${capturedOn.slice(0, 4)}`;
}
