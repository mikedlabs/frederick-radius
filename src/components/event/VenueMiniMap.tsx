import Link from "next/link";
import StaticMapPreview from "@/components/map/StaticMapPreview";
import { mapboxRequestRuntimeEnabled } from "@/lib/mapbox-budget";

/**
 * VenueMiniMap — a static map thumbnail of the venue on the event page.
 *
 * The page told you WHERE only in words (venue name, town, a Directions
 * link). When Static Images is deliberately enabled, a compact image gives
 * the visual answer at a glance. Otherwise this stays a useful local locator
 * and links to the live map without issuing a known-to-fail paid proxy call.
 * Rendered only for geo-precise events, so an area-centroid event never draws
 * a confidently wrong pin. Attribution/logo stay on (Mapbox ToS).
 */
export default function VenueMiniMap({
  geom,
  name,
}: {
  geom: { lng: number; lat: number };
  name: string;
}) {
  const lng = geom.lng.toFixed(5);
  const lat = geom.lat.toFixed(5);
  const staticMapEnabled =
    mapboxRequestRuntimeEnabled("static") &&
    Boolean(process.env.MAPBOX_SERVER_TOKEN?.trim());
  // Via /api/static-map, NOT next/image against api.mapbox.com: the
  // token is URL-restricted and the image optimizer fetches with no
  // Referer, so the direct form 403s upstream and 502s to the user
  // (which is exactly how this component shipped broken). The proxy
  // adds the Referer and caches the PNG for a month.
  const src = `/api/static-map?lng=${lng}&lat=${lat}&pin=e14328&size=640x280`;
  return (
    <Link
      href={`/map?c=${lng},${lat},15.5`}
      aria-label={`Open the map centered on ${name}`}
      className="tactile tactile-interactive block overflow-hidden rounded-[var(--app-radius-md)] border"
      style={{ borderColor: "var(--app-border)" }}
    >
      {staticMapEnabled ? (
        <StaticMapPreview
          src={src}
          alt={`Map showing ${name}`}
          width={1280}
          height={560}
          className="h-[140px] w-full"
        />
      ) : (
        <div
          data-local-locator="true"
          role="img"
          aria-label={`Local locator for ${name}`}
          className="relative h-[140px] overflow-hidden bg-[color:var(--app-bg-sunken)] text-[color:var(--app-ink)]"
        >
          <div
            aria-hidden="true"
            className="absolute inset-0 opacity-55"
            style={{
              backgroundImage:
                "linear-gradient(to right, color-mix(in srgb, var(--app-ink) 9%, transparent) 1px, transparent 1px), linear-gradient(to bottom, color-mix(in srgb, var(--app-ink) 9%, transparent) 1px, transparent 1px)",
              backgroundSize: "28px 28px",
            }}
          />
          <span className="absolute left-3 top-3 rounded-full border border-[color:var(--app-border)] bg-[color:var(--app-bg)]/90 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] shadow-sm backdrop-blur-sm">
            Radius locator
          </span>
          <span
            aria-hidden="true"
            className="absolute left-1/2 top-1/2 h-10 w-10 -translate-x-1/2 -translate-y-1/2 rounded-full border-4 border-[color:var(--app-bg)] shadow-lg"
            style={{ backgroundColor: "#e14328" }}
          />
          <div className="absolute inset-x-3 bottom-3 flex items-center justify-between gap-3 rounded-[var(--app-radius-sm)] border border-[color:var(--app-border)] bg-[color:var(--app-bg)]/95 px-3 py-2 shadow-sm backdrop-blur-sm">
            <span className="min-w-0 truncate text-sm font-semibold">{name}</span>
            <span className="shrink-0 text-xs font-semibold text-[color:var(--app-brand)]">
              Open map <span aria-hidden="true">↗</span>
            </span>
          </div>
        </div>
      )}
    </Link>
  );
}
