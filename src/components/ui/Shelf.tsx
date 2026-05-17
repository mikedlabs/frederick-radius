import Link from "next/link";
import { ArrowRight } from "lucide-react";

/**
 * Shelf — a titled horizontal rail. The structural answer to the
 * "infinite directory column" problem: instead of stacking 44 identical
 * rows vertically, a category becomes a calm editorial header + a
 * swipeable row of tiles, with the next tile peeking so it reads as
 * "there's more this way."
 *
 * Refined and restrained on purpose: the header is the same quiet
 * uppercase eyebrow + serif count used elsewhere, the rail does the
 * work, motion lives in the scroll itself (see .shelf-rail). Reusable
 * across Radius, Today, Saved, search, and municipality pages.
 */

export default function Shelf({
  title,
  count,
  href,
  cta = "See all",
  children,
}: {
  title: string;
  count?: number;
  href?: string;
  cta?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-2.5">
      <header className="flex items-baseline justify-between gap-3">
        <h2
          className="font-serif text-lg font-semibold tracking-tight"
          style={{ color: "var(--app-ink)" }}
        >
          {title}
          {count !== undefined && (
            <span
              className="ml-1.5 text-sm font-normal tabular-nums"
              style={{ color: "var(--app-ink-3)" }}
            >
              · {count}
            </span>
          )}
        </h2>
        {href && (
          <Link
            href={href}
            className="inline-flex shrink-0 items-center gap-1 text-xs font-medium tracking-tight"
            style={{ color: "var(--app-brand)" }}
          >
            {cta}
            <ArrowRight className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
          </Link>
        )}
      </header>
      {/* Negative margin + padding so the edge-fade mask and the first
          tile align to the page gutter, not the card's inner edge. */}
      <div className="-mx-4 px-4">
        <div className="shelf-rail gap-3 pb-1">{children}</div>
      </div>
    </section>
  );
}
