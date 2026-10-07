import Image from "next/image";
import { nearestAerial, currentSeason, type Aerial } from "@/lib/aerial";
import { resolveMunicipality } from "@/lib/location";
import { PAPER_CREAM_BLUR } from "@/lib/blur-placeholder";

/** A place page shows a drone frame only when it was taken this close. */
export const PLACE_AERIAL_MAX_METERS = 150;

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
 * area from the frame's own geotag and dates it from its capture time.
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

  return (
    <figure
      className={`relative overflow-hidden rounded-[var(--app-radius-lg)] ${className}`}
      style={{ boxShadow: "var(--app-edge), var(--app-elev-2)" }}
    >
      <div className="relative aspect-[16/10] w-full sm:aspect-[2/1]">
        <Image
          src={aerial.src}
          alt={captured ? `${area} seen from above in ${captured}` : `${area} seen from above`}
          fill
          sizes="(max-width: 720px) 100vw, 720px"
          placeholder="blur"
          blurDataURL={PAPER_CREAM_BLUR}
          className="object-cover"
        />
        <div
          aria-hidden
          className="absolute inset-0"
          style={{ background: "linear-gradient(to top, rgba(0,0,0,0.74) 0%, rgba(0,0,0,0.12) 42%, transparent 70%)" }}
        />
        <figcaption className="absolute inset-x-0 bottom-0 flex items-end justify-between gap-3 p-3.5">
          <div className="min-w-0">
            <p
              className="text-[10px] font-bold uppercase tracking-[0.14em]"
              style={{ color: "rgba(255,255,255,0.8)", textShadow: "0 1px 2px rgba(0,0,0,0.6)" }}
            >
              From above
            </p>
            <p
              className="font-serif text-[18px] font-semibold leading-tight text-white"
              style={{ textShadow: "0 1px 3px rgba(0,0,0,0.55)" }}
            >
              {area} from the air
            </p>
          </div>
          {meta && (
            <span
              className="shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold backdrop-blur"
              style={{
                background: "rgba(255,255,255,0.16)",
                color: "white",
                boxShadow: "inset 0 0 0 1px rgba(255,255,255,0.2)",
              }}
            >
              {meta}
            </span>
          )}
        </figcaption>
      </div>
    </figure>
  );
}
