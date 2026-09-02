import Link from "next/link";
import StaticMapPreview from "@/components/map/StaticMapPreview";
import { mapboxRequestRuntimeEnabled } from "@/lib/mapbox-budget";

/**
 * PlaceMiniMap — the Location-section locator on a place page.
 *
 * Was a full GL map instance (a ~200KB deferred chunk, a WebGL context, and a
 * billed map load per scroll-into-view). The default is now a local-only
 * coordinate locator. When Static Images is deliberately enabled, it upgrades
 * to one CDN-cached image. Both states tap through to the live Radius map.
 *
 * The paid image is served via /api/static-map (not next/image) only when its
 * switch, nonzero budget, and dedicated server token are all present. With the
 * default-off configuration, the rendered markup contains no image URL and
 * therefore cannot make even a failed request to the paid proxy.
 */
export default function PlaceMiniMap({
  lng,
  lat,
  name,
  color,
}: {
  lng: number;
  lat: number;
  /** For the alt text + tap-through label. */
  name: string;
  /** Category hex like "#B5462B"; non-hex values fall back to brand. */
  color?: string;
}) {
  const markerColor =
    color && /^#[0-9a-fA-F]{6}$/.test(color)
      ? color.toLowerCase()
      : "#e14328";
  const pin = markerColor.slice(1);
  const staticMapEnabled =
    mapboxRequestRuntimeEnabled("static") &&
    Boolean(process.env.MAPBOX_SERVER_TOKEN?.trim());
  // The image proxy resolves coordinates to four decimals (~11m). Match its
  // public URL precision so nearly identical pins share one edge-cache key;
  // the interactive-map handoff keeps the more precise five-decimal camera.
  const src = `/api/static-map?lng=${lng.toFixed(4)}&lat=${lat.toFixed(4)}&pin=${pin}&size=320x150`;
  const latitude = `${Math.abs(lat).toFixed(4)}° ${lat >= 0 ? "N" : "S"}`;
  const longitude = `${Math.abs(lng).toFixed(4)}° ${lng >= 0 ? "E" : "W"}`;
  return (
    <Link
      href={`/map?c=${lng.toFixed(5)},${lat.toFixed(5)},15.5`}
      prefetch={false}
      aria-label={`Open the map centered on ${name}`}
      className="tactile tactile-interactive block overflow-hidden rounded-[var(--app-radius-md)] border"
      style={{ borderColor: "var(--app-border)" }}
    >
      {staticMapEnabled ? (
        <StaticMapPreview
          src={src}
          alt={`Map showing ${name}`}
          width={640}
          height={300}
          className="h-44 w-full"
        />
      ) : (
        <div
          data-local-locator="true"
          role="img"
          aria-label={`Local locator for ${name} at ${latitude}, ${longitude}`}
          className="relative h-44 w-full overflow-hidden bg-[color:var(--app-bg-sunken)] text-[color:var(--app-ink)]"
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
          <svg
            aria-hidden="true"
            viewBox="0 0 320 176"
            preserveAspectRatio="none"
            className="absolute inset-0 h-full w-full text-[color:var(--app-ink)] opacity-15"
          >
            <circle cx="160" cy="83" r="31" fill="none" stroke="currentColor" />
            <circle cx="160" cy="83" r="58" fill="none" stroke="currentColor" />
            <circle cx="160" cy="83" r="89" fill="none" stroke="currentColor" />
          </svg>

          <div className="absolute left-3 top-3 flex items-center gap-2 rounded-full border border-[color:var(--app-border)] bg-[color:var(--app-bg)]/90 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] shadow-sm backdrop-blur-sm">
            <span
              aria-hidden="true"
              className="h-1.5 w-1.5 rounded-full"
              style={{ backgroundColor: markerColor }}
            />
            Radius locator
          </div>
          <span className="absolute right-3 top-3 rounded-full border border-[color:var(--app-border)] bg-[color:var(--app-bg)]/90 px-2.5 py-1 text-[10px] font-medium text-[color:var(--app-ink-2)] shadow-sm backdrop-blur-sm">
            Position only
          </span>

          <div
            aria-hidden="true"
            className="absolute left-1/2 top-[47%] flex h-11 w-11 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border-4 border-[color:var(--app-bg)] shadow-lg"
            style={{ backgroundColor: markerColor }}
          >
            <svg
              viewBox="0 0 24 24"
              className="h-5 w-5 text-white"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M20 10c0 4.7-5.1 9.4-7.3 11.2a1.1 1.1 0 0 1-1.4 0C9.1 19.4 4 14.7 4 10a8 8 0 1 1 16 0Z" />
              <circle cx="12" cy="10" r="2.25" />
            </svg>
          </div>

          <div className="absolute inset-x-3 bottom-3 flex min-w-0 items-center justify-between gap-3 rounded-[var(--app-radius-sm)] border border-[color:var(--app-border)] bg-[color:var(--app-bg)]/95 px-3 py-2 shadow-sm backdrop-blur-sm">
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold">{name}</p>
              <p className="font-mono text-[10px] text-[color:var(--app-ink-2)]">
                {latitude} · {longitude}
              </p>
            </div>
            <span className="shrink-0 text-xs font-semibold text-[color:var(--app-brand)]">
              Open map <span aria-hidden="true">↗</span>
            </span>
          </div>
        </div>
      )}
    </Link>
  );
}
