/**
 * The anchor id a moment guide gives a section heading ("Getting there" to
 * "getting-there"). Its own module, free of data imports, so client surfaces
 * that link into a guide do not pull the photo or moment tables with it.
 */
export function momentSectionId(heading: string): string {
  return heading.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}
