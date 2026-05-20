import Link from "next/link";
import { Quote } from "lucide-react";
import { rankPlaces } from "@/lib/loaders/places";
import { CATEGORY_BY_SLUG } from "@/data/categories";

/**
 * QuoteOfTheDay — one real Google review, set as an editorial
 * pull-quote on Today. Adds a human voice to a page that's mostly
 * data, and surfaces a place the user might not have noticed.
 *
 * Selection: high-rated places with a real review snippet, rotated
 * by day so the quote changes day-to-day. Never fabricated — if no
 * review_snippet exists, the module self-hides.
 */
export default function QuoteOfTheDay() {
  // Filter first, then rank — otherwise rankPlaces's limit can cut all
  // photo-backed reviews off before we see them.
  const candidates = rankPlaces()
    .filter(
      (p) =>
        p.review_snippet &&
        p.review_snippet.length > 40 &&
        p.review_snippet.length < 240 &&
        (p.google_rating ?? 0) >= 4.3,
    )
    .slice(0, 80);
  if (candidates.length === 0) return null;
  const dayIdx = Math.floor(Date.now() / 86_400_000);
  const pick = candidates[((dayIdx % candidates.length) + candidates.length) % candidates.length];
  const cat = CATEGORY_BY_SLUG[pick.category];
  const accent = cat?.color ?? "var(--app-brand)";

  return (
    <section
      aria-label="Quote of the day"
      className="tactile relative overflow-hidden rounded-[var(--app-radius-lg)] bg-[var(--app-bg-elevated)] p-5"
    >
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background: `radial-gradient(80% 100% at 0% 0%, color-mix(in srgb, ${accent} 14%, transparent), transparent 60%)`,
        }}
      />
      <span
        aria-hidden
        className="pointer-events-none absolute -top-2 -right-2 font-serif text-[150px] font-bold leading-none"
        style={{ color: accent, opacity: 0.08 }}
      >
        “
      </span>
      <div className="relative">
        <Quote
          className="h-4 w-4"
          strokeWidth={2}
          style={{ color: accent }}
          aria-hidden
        />
        <blockquote
          className="mt-2 font-serif text-[18px] italic leading-snug tracking-tight text-pretty"
          style={{ color: "var(--app-ink)" }}
        >
          &ldquo;{pick.review_snippet}&rdquo;
        </blockquote>
        <Link
          href={`/places/${pick.slug}`}
          className="mt-3 inline-flex items-baseline gap-1.5"
        >
          <span
            className="text-[11px] font-bold uppercase tracking-[0.1em]"
            style={{ color: accent }}
          >
            {cat?.name ?? pick.category}
          </span>
          <span
            className="text-[13px] font-semibold leading-tight tracking-tight"
            style={{ color: "var(--app-ink-2)" }}
          >
            {pick.name}
          </span>
        </Link>
        {pick.review_author && (
          <p className="mt-1 text-[11px]" style={{ color: "var(--app-ink-3)" }}>
            — {pick.review_author}, via Google
          </p>
        )}
      </div>
    </section>
  );
}
