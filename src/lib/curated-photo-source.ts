import type { EventPhotoLicenseCredit } from "@/components/event/eventVisuals";
import type { PhotoCreditFacts } from "@/components/place/PhotoCreditLine";
import type { WikimediaPhoto } from "@/lib/integrations/wikimedia";

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

/** The capture year describes the photograph, not current business appearance.
 * A reviewed record may give a full date or, when the source does, a month. */
export function curatedPhotoYear(capturedOn: unknown): string | null {
  if (typeof capturedOn !== "string" || !/^[1-9]\d{3}-\d{2}(?:-\d{2})?$/.test(capturedOn)) return null;
  const day = capturedOn.length === 7 ? `${capturedOn}-01` : capturedOn;
  const date = new Date(`${day}T00:00:00Z`);
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== day) return null;
  return capturedOn.slice(0, 4);
}

const LICENSE_DEEDS: Readonly<Record<string, string>> = {
  "CC BY-SA 4.0": "https://creativecommons.org/licenses/by-sa/4.0",
  "CC BY 2.0": "https://creativecommons.org/licenses/by/2.0",
};

/** The short credit line facts for a reviewed curated or town photograph. */
export function curatedPhotoCredit(photo: WikimediaPhoto): PhotoCreditFacts {
  return {
    author: photo.author,
    year: curatedPhotoYear(photo.capturedOn),
    license: photo.license,
    // A record without its own deed link falls back to the source page's license section.
    licenseHref: photo.licenseUrl ?? LICENSE_DEEDS[photo.license] ?? `${photo.source_url}#Licensing`,
    sourceLabel: curatedPhotoSourceLabel(photo.source_url),
    sourceHref: photo.source_url,
    ...(photo.originalSourceUrl ? { originalSourceHref: photo.originalSourceUrl } : {}),
    edited: photo.edited,
  };
}

/** The same short credit line facts for a licensed event venue photograph. */
export function eventPhotoCredit(credit: EventPhotoLicenseCredit): PhotoCreditFacts {
  return {
    author: credit.creator,
    year: curatedPhotoYear(credit.captured_on),
    license: credit.license.label,
    licenseHref: credit.license.url,
    sourceLabel: curatedPhotoSourceLabel(credit.source_url),
    sourceHref: credit.source_url,
    ...(credit.original_source_url ? { originalSourceHref: credit.original_source_url } : {}),
    edited: credit.edited,
  };
}
