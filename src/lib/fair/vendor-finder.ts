/**
 * The Fair's own vendor directory is the source of truth for temporary
 * concession and commercial booths. Keep this as a handoff rather than
 * mirroring its inventory or floorplan: public access to that directory does
 * not grant Radius permission to republish its data or artwork.
 */
export const GREAT_FREDERICK_FAIR_2026_VENDOR_DIRECTORY = {
  publisher: "The Great Frederick Fair",
  sourceUrl: "https://thegreatfrederickfair.com/vendors/",
  guideUrl: "https://mobile.eventhub-floorplan.net/?Show_ID=18209",
  directoryUrl: "https://mobile.eventhub-floorplan.net/exhibitors-g2app.php",
  showId: "18209",
} as const;

/**
 * Opens the organizer's current vendor-search result. A query is deliberately
 * passed through unchanged (apart from trimming), so Radius never claims that
 * a vendor is on the grounds or assigns it a guessed map coordinate.
 */
export function fairVendorDirectoryHref(query?: string): string {
  const url = new URL(GREAT_FREDERICK_FAIR_2026_VENDOR_DIRECTORY.directoryUrl);
  url.searchParams.set("Show_ID", GREAT_FREDERICK_FAIR_2026_VENDOR_DIRECTORY.showId);

  const normalizedQuery = query?.trim();
  if (normalizedQuery) {
    url.searchParams.set("q", normalizedQuery);
  }

  return url.toString();
}
