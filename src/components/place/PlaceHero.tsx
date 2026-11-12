import { placeCardPhotoPlan } from "@/lib/place-card-photo";
import { CATEGORY_BY_SLUG } from "@/data/categories";
import CategoryIcon from "@/components/place/CategoryIcon";
import { currentSkyPalette } from "@/components/today/SkyHero";
import { nextSunHint } from "@/lib/sun";
import { FREDERICK_CENTER } from "@/lib/geo";
import PlaceHeroMedia from "@/components/place/PlaceHeroMedia";
import type { CSSProperties } from "react";
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
  // The category color reaches the seal and the pill as one custom property,
  // so each can decide per surface and per appearance how to use it.
  const tone = { "--place-cat": cat?.color ?? "var(--app-brand)" } as CSSProperties;
  const hero = size === "hero";
  const width = hero ? 1200 : 600;
  const height = hero ? 700 : 400;
  const plan = placeCardPhotoPlan({ slug, google_photo_url: photoSrc,
    google_photo_attribution: photoAttribution,
    google_photo_attributions: photoAttributions }, width / 2);

  // The Living Frame (hero + real photo only): a soft time-of-day wash echoing
  // the SkyHero, plus a warm corner glow during golden hour, both computed
  // server-side. Deliberately subtle (a low-alpha soft-light wash), so a
  // slightly-stale ISR render reads as atmosphere, never a claimed clock.
  const livingFrame = hero && plan.sources.length > 0;
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
      {/* The photoless plate, which is the common case and also what remains
          when every photo source fails. It is one flat sunken surface with the
          category emblem centered in the band. It carries no gradient, glow or
          corner marks, because a stand-in for a missing photograph should say
          plainly that there is no photograph. The place name is not repeated
          here: the <h1> sits directly below the hero and carries it.

          The 96px card band is too short to center an emblem clear of the
          category pill, which ends 36px down and can span the card. There the
          plate reserves the pill's row, so a 36px tile sits 12px under the
          pill and 12px above the bottom edge. */}
      <div
        aria-hidden
        data-place-hero-plate
        className={`absolute inset-0 z-0 grid place-items-center bg-[var(--app-bg-sunken)]${hero ? "" : " pt-9"}`}
        style={tone}
      >
        {/* The category glyph on a quiet tile (a CategoryIcon vector, never
            an emoji). In the 148px hero band a 60px tile sits 44px from each
            edge, which leaves 8px under the category pill when a long label
            reaches across it. Category colors are picked for light surfaces,
            so the dark appearance lifts the glyph toward the ink instead of
            drawing it at its raw value. */}
        <span
          data-place-hero-seal
          className="grid place-items-center rounded-[var(--app-radius-md)] border border-[var(--app-border)] bg-[color-mix(in_srgb,var(--place-cat)_13%,var(--app-bg-elevated-solid))] text-[color:var(--place-cat)] dark:text-[color:color-mix(in_srgb,var(--place-cat)_45%,var(--app-ink))]"
          style={{ width: hero ? 60 : 36, height: hero ? 60 : 36 }}
        >
          <CategoryIcon
            slug={category}
            className={hero ? "h-8 w-8" : "h-5 w-5"}
            strokeWidth={1.25}
          />
        </span>
      </div>

      {/* Category pill. Over a photograph it is a fixed white overlay with
          the label in the category color, in both appearances. With no
          photograph showing (PlaceHeroMedia reports that on its wrapper, so
          this also covers a photo that failed to load) it becomes a themed
          surface: the label in --app-ink-2 and only the glyph in the category
          color, because most category colors fail contrast as text on the
          dark surface. */}
      <div
        data-place-hero-pill
        className="pointer-events-none absolute left-3 top-3 z-20 inline-flex max-w-[calc(100%-1.5rem)] items-center gap-1.5 rounded-full bg-white/90 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-[color:var(--place-cat)] shadow-[var(--app-shadow-1)] backdrop-blur [[data-place-hero-source=none]_&]:bg-[var(--app-bg-elevated-solid)] [[data-place-hero-source=none]_&]:text-[color:var(--app-ink-2)] [[data-place-hero-source=none]_&]:shadow-[inset_0_0_0_1px_var(--app-border)] [[data-place-hero-source=none]_&]:backdrop-blur-none"
        style={tone}
      >
        <CategoryIcon
          slug={category}
          className="h-3.5 w-3.5 shrink-0 text-[color:var(--place-cat)] dark:[[data-place-hero-source=none]_&]:text-[color:color-mix(in_srgb,var(--place-cat)_45%,var(--app-ink))]"
          strokeWidth={1.75}
        />
        <span className="min-w-0 truncate">{cat?.name ?? category}</span>
      </div>

    </PlaceHeroMedia>
  );
}
