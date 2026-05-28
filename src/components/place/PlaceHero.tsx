import Image from "next/image";
import { photoForCategory, unsplashUrl } from "@/lib/photos";
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

function resolvePhotoSrc(slug: string, category: string, width: number) {
  const wm = getLandmarkPhoto(slug);
  if (wm) {
    return { src: wikimediaUrl(wm.file, width), alt: wm.alt, kind: "wikimedia" as const };
  }
  const u = photoForCategory(category, slug);
  return { src: unsplashUrl(u, width), alt: u.alt, kind: "unsplash" as const };
}

export default function PlaceHero({
  slug, name, category, blurb,
  aspectRatio = "16/10", size = "hero", priority = false, photoSrc,
}: Props) {
  const cat = CATEGORY_BY_SLUG[category];
  const color = cat?.color ?? "#A8462C";
  const width = size === "hero" ? 1200 : 600;
  const height = size === "hero" ? 700 : 400;
  const glyph = GLYPH[category] ?? "📍";
  const resolved = resolvePhotoSrc(slug, category, width);
  // Real Google photo of the actual business beats generic category stock.
  const src = photoSrc ?? resolved.src;
  const alt = photoSrc ? name : resolved.alt;

  return (
    <div
      className="relative w-full overflow-hidden"
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

      {/* The hero photo runs through Vercel's image optimizer so
       *  every device gets a WebP at its true pixel size instead of
       *  a 800x downloaded 12MB JPEG. `unoptimized` was set to skip
       *  the optimizer, which was the cause of the 14s LCP on
       *  /places/[slug]. The source is the same-origin /api/place-
       *  photo proxy, which already strips the API key.
       *
       *  `placeholder="blur"` with a paper-cream data URL keeps the
       *  hero from popping in cold; the load reads as a calm fade. */}
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
        // View Transitions pair-up: a tile on /now's WorthALook rail
        // carries the same name, so the browser morphs that thumbnail
        // into this full hero on navigation (Apple-Photos style). The
        // detail page only paints one hero per slug, so the name is
        // guaranteed unique on this surface. Only applied on the hero
        // variant — the card-size variant lives inside lists where a
        // shared name would collide.
        style={size === "hero" ? { viewTransitionName: `place-photo-${slug}` } : undefined}
      />

      {/* Soft gradient darkening at bottom for text legibility */}
      <div
        aria-hidden
        style={{
          position: "absolute", inset: 0,
          background: "linear-gradient(180deg, transparent 50%, rgba(0,0,0,0.55) 100%)",
        }}
      />

      {/* Category pill + glyph */}
      <div className="absolute left-3 top-3 inline-flex items-center gap-1.5 rounded-full bg-white/90 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider shadow-[var(--app-shadow-1)] backdrop-blur"
           style={{ color }}>
        <span aria-hidden>{glyph}</span> {cat?.name ?? category}
      </div>

      {/* Hero overlay: blurb only. The place's H1 lives on the page
          immediately below the hero, so re-rendering the name here as
          an H2 (the 2026-05 review caught this) duplicated the heading
          and made the layout feel doubled-up. The category pill at
          top-left already anchors what the photo shows; the blurb adds
          one line of editorial context when we have it. */}
      {size === "hero" && blurb && (
        <div className="absolute inset-x-3 bottom-3 text-white">
          <p className="line-clamp-2 text-[13px] leading-snug opacity-95 drop-shadow">
            {blurb}
          </p>
        </div>
      )}
    </div>
  );
}

export function PhotoCredit({
  category, slug, hasGooglePhoto,
}: { category: string; slug: string; hasGooglePhoto?: boolean }) {
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
  const photo = photoForCategory(category, slug);
  return (
    <p className="text-[10px]" style={{ color: "var(--app-ink-3)" }}>
      Hero photo:{" "}
      <a
        href={photo.photographer_url + "?utm_source=frederick_radius&utm_medium=referral"}
        target="_blank"
        rel="noopener noreferrer"
        style={{ color: "var(--app-ink-2)" }}
      >
        {photo.photographer}
      </a>{" "}
      on{" "}
      <a
        href="https://unsplash.com?utm_source=frederick_radius&utm_medium=referral"
        target="_blank"
        rel="noopener noreferrer"
        style={{ color: "var(--app-ink-2)" }}
      >
        Unsplash
      </a>
    </p>
  );
}
