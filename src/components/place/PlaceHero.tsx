import Image from "next/image";
import { getLandmarkPhoto, wikimediaUrl } from "@/lib/integrations/wikimedia";
import { CATEGORY_BY_SLUG } from "@/data/categories";
import { PAPER_CREAM_BLUR } from "@/lib/blur-placeholder";

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
};

const GLYPH: Record<string, string> = {
  coffee: "☕", restaurant: "🍽", brewery: "🍺", bar: "🍸", bakery: "🥐",
  pizza: "🍕", park: "🌳", trail: "⛰", museum: "🏛", gallery: "🎨",
  theater: "🎭", music: "🎵", library: "📚", market: "🛒", antiques: "🪑",
  yoga: "🧘", lodging: "🏨", parking: "🅿️", "book-store": "📖",
  "public-safety": "🚒", government: "🏛", playground: "🛝",
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
  if (wm) return { src: wikimediaUrl(wm.file, width), alt: wm.alt };
  return null;
}

export default function PlaceHero({
  slug, name, category,
  aspectRatio = "16/10", size = "hero", priority = false, photoSrc,
}: Props) {
  const cat = CATEGORY_BY_SLUG[category];
  const color = cat?.color ?? "#A03A22";
  const width = size === "hero" ? 1200 : 600;
  const height = size === "hero" ? 700 : 400;
  const glyph = GLYPH[category] ?? "📍";
  const resolved = resolvePhotoSrc(slug, width);
  // Real Google photo of the actual business beats a landmark photo.
  const src = photoSrc ?? resolved?.src ?? null;
  const alt = photoSrc ? name : resolved?.alt ?? "";

  return (
    <div
      // The detail-page hero is clamped to ~half the viewport height so a
      // 16/10 ratio at full width can't swallow a short LANDSCAPE-phone
      // screen — at 844×390 the un-capped hero rendered 455px tall (taller
      // than the viewport), pushing the place name and everything below it
      // off-screen. The cap never binds in portrait (16/10 of phone width
      // is well under 52vh), so it only kicks in where the bug lived. The
      // card variant keeps its exact aspect for list layouts.
      className={`relative w-full overflow-hidden${size === "hero" ? " max-h-[38vh]" : ""}`}
      style={{ aspectRatio }}
    >
      {/* Gradient fallback — always rendered behind the photo so 404s look intentional */}
      <div
        aria-hidden
        style={{
          position: "absolute", inset: 0,
          background: `linear-gradient(135deg, ${color}26 0%, ${color}12 40%, var(--app-bg-sunken) 100%)`,
        }}
      />
      {/* Topographic-feel overlay (very subtle) */}
      <svg
        aria-hidden
        viewBox="0 0 600 400"
        preserveAspectRatio="xMidYMid slice"
        style={{ position: "absolute", inset: 0, width: "100%", height: "100%", opacity: 0.07 }}
      >
        <defs>
          <radialGradient id={`r-${slug}`} cx="50%" cy="50%" r="60%">
            <stop offset="0%" stopColor={color} stopOpacity="0.0" />
            <stop offset="100%" stopColor={color} stopOpacity="1" />
          </radialGradient>
        </defs>
        {[40, 90, 140, 200, 260, 320].map((r) => (
          <circle key={r} cx="320" cy="200" r={r} fill="none" stroke={color} strokeWidth="0.6" />
        ))}
        <rect width="600" height="400" fill={`url(#r-${slug})`} />
      </svg>

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
          priority={priority}
          sizes={size === "hero" ? "(max-width: 720px) 100vw, 720px" : "(max-width: 720px) 50vw, 360px"}
          placeholder="blur"
          blurDataURL={PAPER_CREAM_BLUR}
          className="absolute inset-0 h-full w-full object-cover"
          style={size === "hero" ? { viewTransitionName: `place-photo-${slug}` } : undefined}
        />
      )}

      {/* Designed field-guide plate — the deliberate hero for a place with
          no real photograph (the common case). A large category glyph and
          the place name in the display face, centered over the contour
          gradient, so an unphotographed place reads as a specimen plate
          rather than an empty box. */}
      {!src && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 px-6 text-center">
          <span
            aria-hidden
            className="grid place-items-center rounded-full"
            style={{
              width: size === "hero" ? 64 : 44,
              height: size === "hero" ? 64 : 44,
              background: `color-mix(in srgb, ${color} 16%, white)`,
              fontSize: size === "hero" ? 30 : 22,
            }}
          >
            {glyph}
          </span>
          {size === "hero" && (
            <span
              className="max-w-[80%] font-serif font-semibold leading-tight tracking-tight"
              style={{ color: `color-mix(in srgb, ${color} 72%, var(--app-ink))`, fontSize: 22 }}
            >
              {name}
            </span>
          )}
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

      {/* Category pill + glyph */}
      <div className="absolute left-3 top-3 inline-flex items-center gap-1.5 rounded-full bg-white/90 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider shadow-[var(--app-shadow-1)] backdrop-blur"
           style={{ color }}>
        <span aria-hidden>{glyph}</span> {cat?.name ?? category}
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
  if (hasGooglePhoto) {
    return (
      <p className="text-[10px]" style={{ color: "var(--app-ink-3)" }}>
        Photos via Google
      </p>
    );
  }
  const wm = getLandmarkPhoto(slug);
  if (wm) {
    return (
      <p className="text-[10px]" style={{ color: "var(--app-ink-3)" }}>
        Photo:{" "}
        <a
          href={wm.source_url}
          target="_blank"
          rel="noopener noreferrer"
          style={{ color: "var(--app-ink-2)" }}
        >
          {wm.author}
        </a>{" "}
        · {wm.license} · via{" "}
        <a
          href="https://commons.wikimedia.org"
          target="_blank"
          rel="noopener noreferrer"
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
