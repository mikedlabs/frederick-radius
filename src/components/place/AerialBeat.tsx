import RadiusPhoto, { RadiusPhotoScope, RadiusPhotoWhen } from "@/components/ui/RadiusPhoto";
import { nearestAerial, currentSeason, type Aerial } from "@/lib/aerial";
import { resolveMunicipality } from "@/lib/location";

/** A place page shows a drone frame only when it was taken this close. */
export const PLACE_AERIAL_MAX_METERS = 150;

/** Painted width of the frame at its widest, in CSS pixels. */
const AERIAL_PX = 720;

const CAPTURE_MONTH = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/New_York",
  month: "long",
  year: "numeric",
});

/** "October 2024" on the Frederick clock, or null without a capture time. */
export function aerialCaptureMonth(takenAt: string | null | undefined): string | null {
  if (!takenAt) return null;
  const time = Date.parse(takenAt);
  return Number.isFinite(time) ? CAPTURE_MONTH.format(time) : null;
}

export type AerialFrame = {
  aerial: Aerial & { distance_m: number };
  /** The municipality the frame was taken in, named from its own geotag. */
  area: string;
  captured: string | null;
};

/**
 * The nearest aerial that honestly shows this spot, named for where the
 * drone actually was. The frame's own geotag is resolved against the county's
 * municipal extents (resolveMunicipality, the same static table the location
 * chip uses), and the frame is used only when that municipality is the one
 * the caller is about. A Frederick drone shot therefore never appears on a
 * Walkersville page captioned "Walkersville from the air", and an aerial
 * whose geotag falls outside every town is not given a town's name.
 */
export function aerialFrameFor(
  at: { lng: number; lat: number },
  {
    municipality,
    maxMeters = PLACE_AERIAL_MAX_METERS,
    now = new Date(),
  }: { municipality: string; maxMeters?: number; now?: Date },
): AerialFrame | null {
  const aerial = nearestAerial(at, { maxMeters, preferSeason: currentSeason(now) });
  if (!aerial) return null;
  const hit = resolveMunicipality({ lng: aerial.lng, lat: aerial.lat });
  if (!hit.inside || hit.municipality.slug !== municipality) return null;
  return {
    aerial,
    area: hit.municipality.name,
    captured: aerialCaptureMonth(aerial.takenAt),
  };
}

/**
 * AerialBeat — a "from above" beat that drops the nearest geotagged drone
 * shot onto a coordinate-bearing surface (place detail, the Frederick town
 * page). Server component.
 *
 * Self-hiding by design: renders nothing unless a real aerial sits within
 * `maxMeters` of the point and inside the caller's municipality, so it only
 * ever appears where a shot genuinely shows that spot. The caption names the
 * area from the frame's own geotag and dates it from its capture time, and it
 * renders only after the image decodes (the RadiusPhotoScope pattern).
 */
export default function AerialBeat({
  lat,
  lng,
  municipality,
  maxMeters = PLACE_AERIAL_MAX_METERS,
  className = "",
}: {
  lat: number;
  lng: number;
  /** Municipality slug of the page; the frame must have been taken inside it. */
  municipality: string;
  maxMeters?: number;
  className?: string;
}) {
  const frame = aerialFrameFor({ lng, lat }, { municipality, maxMeters });
  if (!frame) return null;
  const { aerial, area, captured } = frame;

  const meta = [
    captured,
    typeof aerial.altM === "number" ? `~${Math.round(aerial.altM)}m up` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  // The frame holds its space while the photo loads, but the scrim, the
  // "From above" label and the capture date appear only once a real image has
  // decoded. A frame that fails to load removes the whole figure, so the page
  // never shows a caption over nothing.
  return (
    <RadiusPhotoScope src={aerial.src} size={AERIAL_PX}>
      <RadiusPhotoWhen is="visible">
        <figure
          data-aerial-beat
          className={`relative overflow-hidden rounded-[var(--app-radius-lg)] ${className}`}
          style={{ boxShadow: "var(--app-edge), var(--app-elev-2)" }}
        >
          <RadiusPhoto
            size={AERIAL_PX}
            alt={captured ? `${area} seen from above in ${captured}` : `${area} seen from above`}
            sizes="(max-width: 720px) 100vw, 720px"
            className="aspect-[16/10] w-full sm:aspect-[2/1]"
          />
          <RadiusPhotoWhen is="ready">
            <div
              aria-hidden
              className="pointer-events-none absolute inset-0"
              style={{
                background:
                  "linear-gradient(to top, color-mix(in srgb, var(--app-ink) 78%, transparent) 0%, color-mix(in srgb, var(--app-ink) 14%, transparent) 42%, transparent 70%)",
              }}
            />
            <figcaption className="absolute inset-x-0 bottom-0 flex items-end justify-between gap-3 p-3.5">
              <div className="min-w-0">
                <p className="text-caption font-semibold" style={{ color: "var(--app-ink-inverse)" }}>
                  From above
                </p>
                <p className="text-title" style={{ color: "var(--app-ink-inverse)" }}>
                  {area} from the air
                </p>
              </div>
              {meta && (
                <span
                  className="text-caption shrink-0 rounded-full px-2 py-0.5 font-semibold"
                  style={{
                    background: "color-mix(in srgb, var(--app-ink) 55%, transparent)",
                    color: "var(--app-ink-inverse)",
                  }}
                >
                  {meta}
                </span>
              )}
            </figcaption>
          </RadiusPhotoWhen>
        </figure>
      </RadiusPhotoWhen>
    </RadiusPhotoScope>
  );
}
