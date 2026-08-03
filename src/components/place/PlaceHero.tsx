import Image from "next/image";
import { getLandmarkPhoto, wikimediaUrl } from "@/lib/integrations/wikimedia";
import { CATEGORY_BY_SLUG } from "@/data/categories";
import CategoryIcon from "@/components/place/CategoryIcon";
import { PAPER_CREAM_BLUR } from "@/lib/blur-placeholder";
import { currentSkyPalette } from "@/components/today/SkyHero";
import { nextSunHint } from "@/lib/sun";
import { FREDERICK_CENTER } from "@/lib/geo";
import { GooglePhotoAttributionLine } from "@/components/place/GoogleAttribution";
import type { GooglePhotoAttribution } from "@/lib/integrations/google-places";

type Props = {
  slug: string;
  name: string;
  category: string;
  blurb?: string;
  aspectRatio?: "16/10" | "16/9" | "4/3" | "1/1";
  size?: "card" | "hero";
  priority?: boolean;
  /** Real Google photo (proxied, key-safe). Wins over generic stock. */
  photoSrc?: string;
  photoAttribution?: GooglePhotoAttribution;
  googleMapsUri?: string;
};

/**
 * Real imagery only: a curated Wikimedia landmark photo, or nothing. The
 * old third tier — generic Unsplash category stock — is gone (June-9 deep
 * audit P0-3): every URL it built was malformed (Unsplash page slugs where
 * the CDN expects hashed filenames), so each hero paid a guaranteed 404 and
 * rendered an empty box. No photo now means the designed field-guide plate
 * below renders alone — honest, on-brand, zero dead requests.
 */
function resolvePhotoSrc(slug: string, width: number) {
  const wm = getLandmarkPhoto(slug);
  if (wm) return { src: wikimediaUrl(wm.file, width), alt: wm.alt, preferCurated: Boolean(wm.preferCurated) };
  return null;
}

export default function PlaceHero({
  slug, name, category,
  aspectRatio = "16/10", size = "hero", priority = false, photoSrc,
  photoAttribution, googleMapsUri,
}: Props) {
  const cat = CATEGORY_BY_SLUG[category];
  // Vermilion brand fallback for uncategorized places. Kept as a literal
  // (not var(--app-brand)) because `color` is consumed in hex-alpha concat
  // below (`${color}26`), which a CSS var cannot satisfy.
  const color = cat?.color ?? "#B5462B";
  const width = size === "hero" ? 1200 : 600;
  const height = size === "hero" ? 700 : 400;
  const resolved = resolvePhotoSrc(slug, width);
  // Real Google photo of the actual business beats a landmark photo — unless
  // the curated entry is preferCurated (the Google hero is wrong/weak for this
  // landmark, verified per-place), which then wins.
  let src: string | null;
  let alt: string;
  if (resolved?.preferCurated) {
    src = resolved.src;
    alt = resolved.alt;
  } else if (photoSrc) {
    src = photoSrc;
    alt = name;
  } else {
    src = resolved?.src ?? null;
    alt = resolved?.alt ?? "";
  }

  // The Living Frame (hero + real photo only): a soft time-of-day wash echoing
  // the SkyHero, plus a warm corner glow during golden hour, both computed
  // server-side. Deliberately subtle (a low-alpha soft-light wash), so a
  // slightly-stale ISR render reads as atmosphere, never a claimed clock.
  const livingFrame = size === "hero" && Boolean(src);
  const now = new Date();
  const sky = livingFrame ? currentSkyPalette(now) : null;
  const golden =
    livingFrame && nextSunHint(now, FREDERICK_CENTER.lat, FREDERICK_CENTER.lng)?.label === "Golden hour now";

  // Photoless places don't get to reserve photo real estate. The designed
  // plate renders instantly (server component, no client boot), but at the
  // full 16/10 aspect it held a phone-viewport-eating void with one glyph in
  // the middle — the beta trust audit read it as an empty placeholder. With
  // no photo the hero collapses to a short identity band: same plate, same
  // category pill, a quarter of the height, and the place name is on screen
  // from the first paint.
  const hasPhoto = Boolean(src);
  const usesGooglePhoto = Boolean(photoSrc && !resolved?.preferCurated);

  return (
    <div
      // The detail-page hero is clamped to ~half the viewport height so a
      // 16/10 ratio at full width can't swallow a short LANDSCAPE-phone
      // screen — at 844×390 the un-capped hero rendered 455px tall (taller
      // than the viewport), pushing the place name and everything below it
      // off-screen. The cap never binds in portrait (16/10 of phone width
      // is well under 52vh), so it only kicks in where the bug lived. The
      // card variant keeps its exact aspect for list layouts.
      className={`relative w-full overflow-hidden${size === "hero" && hasPhoto ? " max-h-[38vh]" : ""}`}
      style={hasPhoto ? { aspectRatio } : { height: size === "hero" ? 148 : 96 }}
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

      {/* The hero photo runs through Vercel's image optimizer so every
       *  device gets a WebP at its true pixel size. The source is the
       *  same-origin /api/place-photo proxy, which strips the API key.
       *  Only rendered when we actually HAVE a real photo — otherwise the
       *  designed plate below carries the hero. */}
      {src && (
        <Image
          src={src}
          alt={alt}
          width={width}
          height={height}
          unoptimized={src.startsWith("/api/place-photo")}
          priority={priority}
          sizes={size === "hero" ? "(max-width: 720px) 100vw, 720px" : "(max-width: 720px) 50vw, 360px"}
          placeholder="blur"
          blurDataURL={PAPER_CREAM_BLUR}
          className={`absolute inset-0 h-full w-full object-cover${size === "hero" ? " ken-burns" : ""}`}
        />
      )}

      {usesGooglePhoto && (
        <div
          className="absolute bottom-2 right-2 z-10 max-w-[80%] rounded bg-black/70 px-2 py-1 text-right text-white shadow-sm backdrop-blur-sm"
          aria-label="Google photo attribution"
        >
          <GooglePhotoAttributionLine
            attribution={photoAttribution}
            placeGoogleMapsUri={googleMapsUri}
            compact={size === "card"}
            touchTarget
          />
        </div>
      )}

      {/* The Living Frame wash — a soft time-of-day tint (soft-light, low alpha
          so the photo dominates) + a warm corner glow at golden hour. Sits
          above the photo, below the bottom-darken + pill. Decorative only. */}
      {sky && (
        <>
          <div
            aria-hidden
            style={{
              position: "absolute", inset: 0, mixBlendMode: "soft-light",
              background: `linear-gradient(165deg, color-mix(in srgb, ${sky.top} 24%, transparent) 0%, transparent 46%, color-mix(in srgb, ${sky.bottom} 32%, transparent) 100%)`,
            }}
          />
          {golden && (
            <div
              aria-hidden
              style={{
                position: "absolute", inset: 0,
                background: "radial-gradient(120% 80% at 85% 8%, color-mix(in srgb, var(--app-brand) 16%, transparent) 0%, transparent 60%)",
              }}
            />
          )}
        </>
      )}

      {/* Designed field-guide plate — the deliberate hero for a place with
          no real photograph (the common case). A single category emblem
          centered over the contour gradient: a specimen mark, not an empty
          box. The place name is NOT repeated here — the <h1> sits directly
          below the hero and carries it, so a name on the plate too would be
          a duplicate title (the same reason the photo hero has no overlay). */}
      {!src && (
        <div className="fg-plate absolute inset-0 grid place-items-center">
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
      )}

      {/* Soft gradient darkening at bottom for text legibility — only over
          a real photo (the plate manages its own contrast). */}
      {src && (
        <div
          aria-hidden
          style={{
            position: "absolute", inset: 0,
            background: "linear-gradient(180deg, transparent 50%, rgba(0,0,0,0.55) 100%)",
          }}
        />
      )}

      {/* Category pill — engraved glyph + label (woodcut vector, no emoji) */}
      <div className="absolute left-3 top-3 inline-flex items-center gap-1.5 rounded-full bg-white/90 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider shadow-[var(--app-shadow-1)] backdrop-blur"
           style={{ color }}>
        <CategoryIcon slug={category} className="h-3.5 w-3.5" strokeWidth={1.75} /> {cat?.name ?? category}
      </div>

      {/* No name overlay on a PHOTO hero: the place's <h1> + address sit on
          the card directly below, so painting the name on the photo too
          was a duplicate title. (The no-photo plate above shows the name
          because there is no photo competing with it.) */}
    </div>
  );
}

export function PhotoCredit({
  slug, hasGooglePhoto,
}: { slug: string; hasGooglePhoto?: boolean }) {
  const wm = getLandmarkPhoto(slug);
  // A preferCurated entry overrides the Google hero in PlaceHero, so credit the
  // curated source even when a Google photo exists. Otherwise Google wins.
  if (hasGooglePhoto && !wm?.preferCurated) {
    // Google attribution is rendered directly on the photo container above,
    // where it remains visible and unambiguously attached to that content.
    return null;
  }
  if (wm) {
    return (
      <p className="text-[10px]" style={{ color: "var(--app-ink-3)" }}>
        Photo:{" "}
        <a
          href={wm.source_url}
          target="_blank"
          rel="noopener noreferrer"
          className="tap-44-y inline-flex items-center"
          style={{ color: "var(--app-ink-2)" }}
        >
          {wm.author}
        </a>{" "}
        · {wm.license} · via{" "}
        <a
          href="https://commons.wikimedia.org"
          target="_blank"
          rel="noopener noreferrer"
          className="tap-44-y inline-flex items-center"
          style={{ color: "var(--app-ink-2)" }}
        >
          Wikimedia Commons
        </a>
      </p>
    );
  }
  // No Google photo and no Wikimedia landmark → the hero is our own designed
  // field-guide plate, not a third-party photo, so there is nothing to credit.
  return null;
}
