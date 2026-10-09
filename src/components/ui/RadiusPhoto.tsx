"use client";

import Image from "next/image";
import {
  createContext,
  useContext,
  type CSSProperties,
  type ReactNode,
  type SyntheticEvent,
} from "react";
import CategoryIcon from "@/components/place/CategoryIcon";
import { isPlacePhotoFailureSignal } from "@/components/place/PlaceHeroMedia";
import {
  usePlacePhotoState,
  type PlacePhotoState,
} from "@/components/place/PlacePhotoState";
import { CATEGORY_BY_SLUG } from "@/data/categories";
import { PAPER_CREAM_BLUR } from "@/lib/blur-placeholder";
import { proxyPhotoAtWidth } from "@/lib/format/img";

/**
 * RadiusPhoto is the one way a surface paints a place, venue or event photo.
 *
 * The place-photo proxy answers a daily cap, rate limit or upstream error
 * with a 200 image, so a plain `<Image>` cannot tell its fallback plate from a
 * photograph. RadiusPhoto always asks the proxy for its 1px failure signal
 * (through `usePlacePhotoState`, which owns that contract) and treats an
 * error or a 1px decode as missing. It then follows the honest image ladder
 * in docs/VISUAL_FIRST.md:
 *
 * - a photo that is loading or has loaded fills the frame, with any overlay
 *   `children` riding on it;
 * - a missing photo in a frame under 120px becomes the category mark, a flat
 *   fill on the place's own hue when the caller has one;
 * - a missing photo in a larger frame hands the space back to the caller's
 *   own `fallback` layout (or nothing), never a lettered plate.
 *
 * `onLoaded` fires only after a real image decodes, so a credit can wait for
 * it. `onMissing` fires when a requested photo fails. A null `src` is missing
 * from the first render, which the caller already knows, so it fires nothing.
 *
 * Server-rendered layouts whose photo, credit and photoless state live in
 * separate subtrees wrap them in `RadiusPhotoScope` and switch with
 * `RadiusPhotoWhen`; a RadiusPhoto inside a scope paints the scope's photo.
 */

/** Frames narrower than this fall back to the category mark. */
export const RADIUS_PHOTO_MARK_MAX = 120;

export type RadiusPhotoStatus = PlacePhotoState["status"];

/** Narrow the proxy to the painted width; other sources pass through. */
function sizedSource(
  src: string | null | undefined,
  size: number,
): string | null {
  return src ? proxyPhotoAtWidth(src, size) : null;
}

const RadiusPhotoContext = createContext<PlacePhotoState | null>(null);

/**
 * Shares one photo's state across a layout, so a server component can put the
 * credit outside a link and the photoless layout somewhere else entirely.
 */
export function RadiusPhotoScope({
  src,
  size,
  children,
}: {
  src: string | null | undefined;
  /** Painted width in CSS pixels, used to narrow the proxy request. */
  size: number;
  children: ReactNode;
}) {
  const state = usePlacePhotoState(sizedSource(src, size));
  return (
    <RadiusPhotoContext.Provider value={state}>
      {children}
    </RadiusPhotoContext.Provider>
  );
}

/**
 * Render children only in one state of the enclosing scope's photo:
 * - `visible`: loading or loaded (the photo slot and anything drawn on it);
 * - `ready`: a real image decoded (the photo credit);
 * - `missing`: no usable photo (the photoless layout).
 */
export function RadiusPhotoWhen({
  is,
  children,
}: {
  is: "visible" | "ready" | "missing";
  children: ReactNode;
}) {
  const state = useContext(RadiusPhotoContext);
  if (!state) {
    throw new Error("RadiusPhotoWhen must render inside RadiusPhotoScope.");
  }
  const show =
    is === "visible" ? state.status !== "missing" : state.status === is;
  return show ? <>{children}</> : null;
}

/**
 * The small-frame fallback: the category glyph on a flat fill. With a place
 * hue (src/data/place-hues.json) the fill is that hue mixed 60% toward Ink,
 * the mix the hue build verified for Cream at WCAG AA. Without one it is a
 * quiet tint of the category color. Never a gradient, texture or initial.
 */
export function RadiusPhotoMark({
  category,
  hue,
  color,
  size,
  height = size,
  className = "",
  style,
}: {
  category?: string;
  hue?: string | null;
  /** Category or surface color, used when the place has no hue. */
  color?: string;
  size: number;
  height?: number;
  className?: string;
  style?: CSSProperties;
}) {
  const tint =
    color ?? (category ? CATEGORY_BY_SLUG[category]?.color : undefined) ??
    "var(--app-ink-3)";
  const glyph = Math.max(12, Math.round(Math.min(size, height) * 0.44));
  return (
    <span
      aria-hidden
      data-radius-photo="mark"
      className={`flex shrink-0 items-center justify-center overflow-hidden ${className}`}
      style={{
        width: size,
        height,
        background: hue
          ? `color-mix(in srgb, ${hue} 60%, var(--app-ink))`
          : `color-mix(in srgb, ${tint} 14%, var(--app-bg-elevated-solid))`,
        color: hue
          ? "var(--app-bg)"
          : `color-mix(in srgb, ${tint} 78%, var(--app-ink))`,
        ...style,
      }}
    >
      <CategoryIcon
        slug={category ?? ""}
        strokeWidth={1.75}
        style={{ width: glyph, height: glyph }}
      />
    </span>
  );
}

export type RadiusPhotoProps = {
  /** Photo source. Ignored inside a RadiusPhotoScope, which owns the source. */
  src?: string | null;
  /**
   * Painted width in CSS pixels. It narrows the proxy request, sets the
   * default `sizes`, and picks the fallback rung. Frames under 120px are
   * square at this size unless `height` says otherwise; larger frames are
   * sized by the caller's className.
   */
  size: number;
  /** Height of a small frame, when it is not square. */
  height?: number;
  alt?: string;
  /** Category slug for the small-frame mark's glyph and tint. */
  category?: string;
  /** The place's own hue, for the small-frame mark's flat fill. */
  hue?: string | null;
  /** Mark tint when the place has no hue (defaults to the category color). */
  color?: string;
  /** `contain` shows a flyer whole on the frame's paper; `cover` crops. */
  fit?: "cover" | "contain";
  sizes?: string;
  priority?: boolean;
  loading?: "lazy" | "eager";
  fetchPriority?: "high" | "low" | "auto";
  /** Frame classes: radius, shadow, and the size of a large frame. */
  className?: string;
  style?: CSSProperties;
  imageClassName?: string;
  /** What a large frame shows when the photo is missing. */
  fallback?: ReactNode;
  /** Overlays drawn on the photo. They disappear with the photo. */
  children?: ReactNode;
  onLoaded?: () => void;
  onMissing?: () => void;
};

export default function RadiusPhoto({
  src,
  size,
  height,
  alt = "",
  category,
  hue,
  color,
  fit = "cover",
  sizes,
  priority,
  loading,
  fetchPriority,
  className = "",
  style,
  imageClassName = "",
  fallback = null,
  children,
  onLoaded,
  onMissing,
}: RadiusPhotoProps) {
  const scoped = useContext(RadiusPhotoContext);
  // Hooks run unconditionally; inside a scope this one never requests.
  const own = usePlacePhotoState(scoped ? null : sizedSource(src, size));
  const photo = scoped ?? own;
  const small = size < RADIUS_PHOTO_MARK_MAX;
  const frameSize: CSSProperties = small
    ? { width: size, height: height ?? size }
    : {};

  if (!photo.src || photo.status === "missing") {
    if (!small) return <>{fallback}</>;
    return (
      <RadiusPhotoMark
        category={category}
        hue={hue}
        color={color}
        size={size}
        height={height}
        className={className}
        style={style}
      />
    );
  }

  const handleLoad = (event: SyntheticEvent<HTMLImageElement>) => {
    const failed = isPlacePhotoFailureSignal(event.currentTarget);
    photo.onLoad(event);
    if (failed) onMissing?.();
    else onLoaded?.();
  };
  const handleError = () => {
    photo.onError();
    onMissing?.();
  };

  return (
    <span
      data-radius-photo={photo.status === "ready" ? "photo" : "loading"}
      className={`relative block shrink-0 overflow-hidden ${className}`}
      style={{ background: "var(--app-bg-sunken)", ...frameSize, ...style }}
    >
      <Image
        src={photo.src}
        alt={alt}
        fill
        sizes={sizes ?? `${size}px`}
        priority={priority}
        loading={priority ? undefined : loading}
        fetchPriority={fetchPriority}
        unoptimized={photo.src.startsWith("/api/place-photo")}
        placeholder="blur"
        blurDataURL={PAPER_CREAM_BLUR}
        className={`${fit === "contain" ? "object-contain" : "object-cover"} ${imageClassName}`}
        onLoad={handleLoad}
        onError={handleError}
      />
      {children}
    </span>
  );
}
