import Image from "next/image";
import { nearestAerial, currentSeason } from "@/lib/aerial";
import { PAPER_CREAM_BLUR } from "@/lib/blur-placeholder";

/**
 * AerialBeat — a "from above" cinematic beat that drops the nearest
 * geotagged drone shot onto a coordinate-bearing surface (place detail,
 * the Frederick town page). Server component.
 *
 * Self-hiding by design: renders nothing unless a real aerial sits
 * within `maxMeters` of the point, so it only ever appears where a shot
 * genuinely shows that spot — never a downtown-Frederick photo captioned
 * as somewhere it isn't.
 */
export default function AerialBeat({
  lat,
  lng,
  label,
  maxMeters = 800,
  className = "",
}: {
  lat: number;
  lng: number;
  /** Honest area name for the caption, e.g. "Frederick". */
  label: string;
  maxMeters?: number;
  className?: string;
}) {
  const a = nearestAerial({ lng, lat }, { maxMeters, preferSeason: currentSeason() });
  if (!a) return null;

  const seasonLabel = a.season.charAt(0).toUpperCase() + a.season.slice(1);
  const meta = [
    seasonLabel,
    typeof a.altM === "number" ? `~${Math.round(a.altM)}m up` : null,
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
          src={a.src}
          alt={`${label} seen from above`}
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
              {label} from the air
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
