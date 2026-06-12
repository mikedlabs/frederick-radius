import CategoryIcon from "@/components/place/CategoryIcon";
import { CATEGORY_BY_SLUG } from "@/data/categories";

/**
 * SpecimenPanel — the papery "field guide plate" stand-in for a place
 * card with no photo. The premium counterpart to CategoryGraphic:
 * where CategoryGraphic is a full-saturation poster (right for event
 * cards, which want poster energy), SpecimenPanel stays matte paper
 * with ONE category accent, so a shelf of photo-less places reads as
 * plates in a guide rather than a wall of color.
 *
 * Three layers, all decorative:
 *   1. Accent wash dissolving into the elevated paper (the Wallet
 *      materiality from the FieldCard prototype).
 *   2. A faint dot-grid "plate paper" texture, masked out toward the
 *      bottom so the body copy area underneath stays calm.
 *   3. An oversized category glyph watermark in the accent at low
 *      opacity, rotation varied by seed so a shelf doesn't look
 *      stamped.
 *
 * Same contract as CategoryGraphic: fills its slot via absolute
 * inset-0, so the parent supplies the size and rounding.
 */

/** Deterministic djb2-style hash, mirroring CategoryGraphic's. */
function seedHash(s: string): number {
  let h = 5381;
  for (let i = 0; i < s.length; i++) {
    h = ((h * 33) ^ s.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

export default function SpecimenPanel({
  category,
  seed,
  className = "",
}: {
  /** Category slug; resolves the accent via CATEGORY_BY_SLUG. */
  category: string;
  /** Anything stable per card (slug, id) — varies the watermark pose. */
  seed: string;
  className?: string;
}) {
  const h = seedHash(seed);
  const accent = CATEGORY_BY_SLUG[category]?.color ?? "var(--app-cool)";
  // Watermark rotation in [-12, +12] degrees; anchor alternates between
  // bottom-right and top-right so adjacent plates don't echo.
  const rotate = ((h >> 5) % 25) - 12;
  const anchorTop = (h >> 11) % 2 === 0;

  return (
    <div
      aria-hidden
      className={`absolute inset-0 overflow-hidden ${className}`}
      style={{
        background: `linear-gradient(150deg, color-mix(in srgb, ${accent} 14%, var(--app-bg-elevated)) 0%, var(--app-bg-elevated) 62%)`,
      }}
    >
      {/* Plate-paper dot grid, fading out toward the bottom. */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          backgroundImage: `radial-gradient(circle, color-mix(in srgb, var(--app-ink) 7%, transparent) 1px, transparent 1.4px)`,
          backgroundSize: "13px 13px",
          maskImage: "linear-gradient(180deg, black, transparent 78%)",
          WebkitMaskImage: "linear-gradient(180deg, black, transparent 78%)",
        }}
      />
      {/* Oversized glyph watermark — the plate's identity beat. */}
      <CategoryIcon
        slug={category}
        strokeWidth={1.1}
        className="pointer-events-none absolute h-[150%] w-[150%]"
        style={{
          color: accent,
          opacity: 0.09,
          right: "-28%",
          ...(anchorTop ? { top: "-30%" } : { bottom: "-30%" }),
          transform: `rotate(${rotate}deg)`,
        }}
      />
      {/* Accent glyph chip — small, set where a photo's subject would
          sit, so the plate has a focal point at shelf-scan distance. */}
      <span
        className="absolute left-1/2 top-1/2 grid h-12 w-12 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full"
        style={{
          background: `color-mix(in srgb, ${accent} 16%, transparent)`,
          color: accent,
          boxShadow: `inset 0 0 0 1px color-mix(in srgb, ${accent} 24%, transparent)`,
        }}
      >
        <CategoryIcon slug={category} strokeWidth={2} className="h-5 w-5" />
      </span>
    </div>
  );
}
