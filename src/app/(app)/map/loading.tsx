import MapLoadingScene from "@/components/map/MapLoadingScene";

/**
 * The map's route-change placeholder reuses the existing Frederick County
 * loading plate at the exact browse-map height, so a tap on the Map tab
 * shows the county plate at once instead of holding the previous page.
 *
 * /map is a static (ISR) route, so this boundary only shows during client
 * navigation; the prerendered page still ships its own copy of the plate.
 */
export default function MapLoading() {
  return (
    <div data-map-loading className="relative -mx-4 sm:-mx-5 lg:ml-0">
      <div className="relative overflow-hidden" style={{ height: "var(--app-browse-map-height)" }}>
        <MapLoadingScene height="100%" />
      </div>
    </div>
  );
}
