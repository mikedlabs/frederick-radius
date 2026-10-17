import { placeCardPhotoPlan } from "@/lib/place-card-photo";
import { CATEGORY_BY_SLUG } from "@/data/categories";
import CategoryIcon from "@/components/place/CategoryIcon";
import { currentSkyPalette } from "@/components/today/SkyHero";
import { nextSunHint } from "@/lib/sun";
import { FREDERICK_CENTER } from "@/lib/geo";
import PlaceHeroMedia from "@/components/place/PlaceHeroMedia";
import type { GooglePhotoAttribution } from "@/lib/integrations/google-places";

type Props = {
  slug: string;
  name: string;
  category: string;
  blurb?: string;
  aspectRatio?: "16/10" | "16/9" | "4/3" | "1/1";
  size?: "card" | "hero";
  priority?: boolean;
  /** Canonical provider photo, eligible only with its individual attribution. */
  photoSrc?: string;
  photoAttribution?: GooglePhotoAttribution;
  photoAttributions?: GooglePhotoAttribution[];
  googleMapsUri?: string;
};

export default function PlaceHero({
  slug, name, category,
  aspectRatio = "16/10", size = "hero", priority = false, photoSrc,
  photoAttribution, photoAttributions, googleMapsUri,
}: Props) {
  const cat = CATEGORY_BY_SLUG[category];
  // Vermilion brand fallback for uncategorized places. Kept as a literal
  // (not var(--app-brand)) because `color` is consumed in hex-alpha concat
  // below (`${color}26`), which a CSS var cannot satisfy.
  const color = cat?.color ?? "#B5462B";
  const width = size === "hero" ? 1200 : 600;
  const height = size === "hero" ? 700 : 400;
  const plan = placeCardPhotoPlan({ slug, google_photo_url: photoSrc,
    google_photo_attribution: photoAttribution,
    google_photo_attributions: photoAttributions }, width / 2);

  // The Living Frame (hero + real photo only): a soft time-of-day wash echoing
  // the SkyHero, plus a warm corner glow during golden hour, both computed
  // server-side. Deliberately subtle (a low-alpha soft-light wash), so a
  // slightly-stale ISR render reads as atmosphere, never a claimed clock.
  const livingFrame = size === "hero" && plan.sources.length > 0;
  const now = new Date();
  const sky = livingFrame ? currentSkyPalette(now) : null;
  const golden =
    livingFrame && nextSunHint(now, FREDERICK_CENTER.lat, FREDERICK_CENTER.lng)?.label === "Golden hour now";

  return (
    <PlaceHeroMedia
      key={plan.key}
      plan={plan}
      name={name}
      aspectRatio={aspectRatio}
      width={width}
      height={height}
      size={size}
      priority={priority}
      googleMapsUri={googleMapsUri}
      skyTop={sky?.top}
      skyBottom={sky?.bottom}
      golden={Boolean(golden)}
    >
      {/* Gradient fallback — always rendered behind the photo so 404s look intentional */}
      <div
        aria-hidden
        style={{
          position: "absolute", inset: 0,
          background: `linear-gradient(135deg, ${color}26 0%, ${color}12 40%, var(--app-bg-sunken) 100%)`,
        }}
      />
      {/* Soft radial sheen — a single gentle focal glow behind the centered
          emblem (replaces the old concentric "target ring" stamp, which read
          as a map crosshair, not a field-guide mark). No motif, just light. */}
      <div
        aria-hidden
        style={{
          position: "absolute",
          inset: 0,
          background: `radial-gradient(58% 58% at 50% 44%, color-mix(in srgb, ${color} 16%, transparent) 0%, transparent 72%)`,
        }}
      />

      {/* Designed field-guide plate — the deliberate hero for a place with
          no real photograph (the common case). A single category emblem
          centered over the contour gradient: a specimen mark, not an empty
          box. The place name is NOT repeated here — the <h1> sits directly
          below the hero and carries it, so a name on the plate too would be
          a duplicate title (the same reason the photo hero has no overlay). */}
      <div className="fg-plate absolute inset-0 z-0 grid place-items-center">
          {/* The engraved category glyph, pressed into a tactile seal — the
              field-guide specimen mark, drawn in the category's ink (woodcut
              vector via CategoryIcon, never an emoji). The .fg-plate corner
              registration ticks frame the hero like a printed plate. */}
          <span
            aria-hidden
            className="grid place-items-center rounded-[var(--app-radius-md)]"
            style={{
              // Sized for the SHORT photoless band (148px hero / 96px card),
              // not the old full-aspect void — the seal reads as a mark on a
              // plate, with room for the category pill above it.
              width: size === "hero" ? 68 : 48,
              height: size === "hero" ? 68 : 48,
              background: `color-mix(in srgb, ${color} 13%, var(--app-bg-elevated-solid))`,
              boxShadow: "0 1px 0 rgba(255,255,255,0.6) inset, var(--app-edge)",
              color,
            }}
          >
            <CategoryIcon
              slug={category}
              className={size === "hero" ? "h-9 w-9" : "h-6 w-6"}
              strokeWidth={1.25}
            />
          </span>
      </div>

      {/* Category pill — engraved glyph + label (woodcut vector, no emoji) */}
      <div className="pointer-events-none absolute left-3 top-3 z-20 inline-flex items-center gap-1.5 rounded-full bg-white/90 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider shadow-[var(--app-shadow-1)] backdrop-blur"
           style={{ color }}>
        <CategoryIcon slug={category} className="h-3.5 w-3.5" strokeWidth={1.75} /> {cat?.name ?? category}
      </div>

    </PlaceHeroMedia>
  );
}
