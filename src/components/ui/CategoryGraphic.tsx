import RippleMark from "@/components/brand/RippleMark";
import CategoryIcon from "@/components/place/CategoryIcon";
import { CATEGORY_BY_SLUG } from "@/data/categories";

/**
 * Honest missing-photo artwork.
 *
 * The old fallback generated a different gradient, texture, sheen, hue shift,
 * rotation, and oversized icon from every seed. That made real Frederick
 * listings look like stock illustration. This plate uses one repeatable visual
 * language instead: category ink, the actual Radius mark, and a small legend
 * glyph. It reads as part of the guide and never pretends to be a photograph.
 */
export default function CategoryGraphic({
  category,
  seed,
  className = "",
  ariaHidden = true,
}: {
  category: string;
  seed: string;
  className?: string;
  ariaHidden?: boolean;
}) {
  const definition = CATEGORY_BY_SLUG[category];
  const color = definition?.color ?? "var(--app-ink-3)";

  return (
    <div
      aria-hidden={ariaHidden || undefined}
      aria-label={ariaHidden ? undefined : definition?.name ?? "Place"}
      role={ariaHidden ? undefined : "img"}
      data-radius-plate={seed}
      className={`absolute inset-0 overflow-hidden ${className}`}
      style={{
        color,
        background:
          `color-mix(in srgb, ${color} 15%, var(--app-bg-elevated-solid))`,
        boxShadow: `inset 0 -3px 0 ${color}`,
      }}
    >
      <div className="absolute -right-12 -top-16 opacity-[0.18]">
        <RippleMark size={190} detail="full" />
      </div>
      <span
        className="absolute left-3 top-3 grid h-8 w-8 place-items-center border"
        style={{
          borderColor: `color-mix(in srgb, ${color} 34%, transparent)`,
          borderRadius: "var(--app-radius-sm)",
          background: "color-mix(in srgb, var(--app-bg-elevated-solid) 76%, transparent)",
        }}
      >
        <CategoryIcon slug={category} className="h-4 w-4" strokeWidth={1.8} />
      </span>
    </div>
  );
}
