import Image from "next/image";
import { BookOpen, ArrowRight } from "lucide-react";
import { PAPER_CREAM_BLUR } from "@/lib/blur-placeholder";

/**
 * FromAboveTile — the marquee for the From Above book.
 *
 * Links to the photographer's storefront at miked.store (external).
 * The in-app /from-above/preview route used to be the destination,
 * but the storefront is where the book is sold, kept current, and
 * presented as a real product. Sending visitors there directly is
 * the honest move — no in-app teaser layer, no double click-through.
 *
 * Photo-led magazine card. Brand-book voice: serif display title +
 * Instrument Serif italic subtitle, brick rule on the left side,
 * paper-cream backplate so the cover photo punches. Opens in a new
 * tab so the visitor doesn't lose their place inside Frederick
 * Radius.
 *
 * Goes on /today so a daily visitor sees it; can also be embedded
 * on /about or in a footer brand strip later.
 */
export default function FromAboveTile() {
  return (
    <a
      href="http://www.miked.store"
      target="_blank"
      rel="noopener noreferrer"
      className="tactile tactile-interactive group relative block overflow-hidden rounded-[var(--app-radius-lg)]"
      style={{
        background: "var(--app-bg-elevated)",
        boxShadow: "var(--app-elev-2), var(--app-edge)",
      }}
      aria-label="From above — a book of Frederick from the sky. Visit miked.store."
    >
      {/* Photo — the cover. 16:10 aspect ratio so it reads like a
          magazine spread, not a square tile. Subtle scale on hover
          per the tactile-interactive idiom. */}
      <div className="relative aspect-[16/10] w-full overflow-hidden">
        <Image
          src="/from-above/cover-front.webp"
          alt="From above — the book cover, Downtown Frederick from the sky"
          fill
          sizes="(max-width: 480px) 100vw, 480px"
          priority={false}
          placeholder="blur"
          blurDataURL={PAPER_CREAM_BLUR}
          className="object-cover transition-transform duration-700 ease-out group-hover:scale-[1.03]"
        />
        {/* Bottom-to-top scrim so the eyebrow lands on contrast */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              "linear-gradient(180deg, transparent 35%, rgba(10,10,10,0.55) 100%)",
          }}
        />
        {/* Eyebrow tag — sits on the photo, paper-cream on warm dark.
            JetBrains Mono via the mono utility for the field-notebook
            stamp feel. */}
        <span
          className="absolute left-3 top-3 inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 font-mono text-[10px] font-semibold uppercase tracking-[0.14em] backdrop-blur-sm"
          style={{
            background: "rgba(244, 239, 230, 0.92)",
            color: "var(--app-ink)",
          }}
        >
          <BookOpen className="h-3 w-3" strokeWidth={2.25} aria-hidden />
          The book
        </span>
      </div>

      {/* Caption block — brick left rule + display title + Instrument
          Serif italic kicker + a quiet "open the book" affordance.
          The topo-bg utility wires sage contour rings behind the
          caption, so a peek of the brand-book topographic texture
          lives on every visit to /today. */}
      <div
        className="topo-bg relative border-l-2 px-4 py-3.5"
        style={{ borderColor: "var(--app-brand)" }}
      >
        <h2
          className="font-serif text-[20px] font-semibold leading-tight tracking-tight"
          style={{ color: "var(--app-ink)" }}
        >
          From above
        </h2>
        <p
          className="mt-1 text-[16px] leading-snug text-pretty"
          style={{
            color: "var(--app-ink-2)",
            fontFamily:
              "var(--font-italic, 'Instrument Serif', 'Iowan Old Style', Georgia, serif)",
            fontStyle: "italic",
          }}
        >
          Six years of mornings over Downtown Frederick.
        </p>
        <p
          className="mt-3 inline-flex items-center gap-1.5 text-[12px] font-semibold"
          style={{ color: "var(--app-brand)" }}
        >
          Visit miked.store
          <ArrowRight
            className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5"
            strokeWidth={2.25}
            aria-hidden
          />
        </p>
      </div>
    </a>
  );
}
