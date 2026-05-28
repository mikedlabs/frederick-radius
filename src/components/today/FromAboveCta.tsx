import Link from "next/link";
import Image from "next/image";
import { ArrowRight } from "lucide-react";

/**
 * FromAboveCta — a quiet doorway from /now into the From Above book
 * route. The book is real: six years of drone photography over
 * Downtown Frederick, organized by season. The route exists at
 * /from-above/preview as a full-bleed coffee-table-book experience.
 *
 * This card sits at the very end of /now as a deliberate "exit
 * beat" — once the user has the day's utility (weather, events,
 * places), this is the page's invitation to stay a little longer
 * in the county's photography. The thumbnail is the ACTUAL book
 * cover (a daily-rotating seasonal photo read like marketing for
 * a generic gallery — the cover IS the book's identity and the
 * link target).
 *
 * Server component, no fetches.
 */
export default function FromAboveCta() {
  return (
    <Link
      href="/from-above/preview"
      className="tactile tactile-interactive group relative flex items-center gap-3.5 overflow-hidden rounded-[var(--app-radius-lg)] border bg-[var(--app-bg-elevated)] p-3 transition active:scale-[0.99]"
      style={{
        borderColor: "var(--app-border)",
        boxShadow: "var(--app-elev-1), var(--app-edge), var(--app-hi)",
      }}
    >
      {/* Book-cover thumbnail. Portrait aspect matches the actual
          hardcover (1200 × 1496 ≈ 4:5), so it reads as a book
          rather than a square photo. Subtle inner ring + lift gives
          it the "object" feel of a hardcover spine catching light. */}
      <div
        className="relative h-[92px] w-[74px] shrink-0 overflow-hidden rounded-[6px] sm:h-[100px] sm:w-[80px]"
        style={{
          boxShadow:
            "0 4px 10px -2px rgba(20,20,18,0.28), inset 0 0 0 1px rgba(20,20,18,0.18)",
        }}
      >
        <Image
          src="/from-above/cover-front.webp"
          alt="From Above book cover"
          fill
          sizes="80px"
          className="object-cover"
        />
      </div>
      <span className="min-w-0 flex-1">
        <span
          className="block text-[10px] font-bold uppercase tracking-[0.12em]"
          style={{ color: "var(--app-accent)" }}
        >
          From above
        </span>
        <span
          className="block font-serif text-[17px] font-semibold leading-tight tracking-tight"
          style={{ color: "var(--app-ink)" }}
        >
          Six years over Frederick
        </span>
        <span
          className="block truncate text-[12px]"
          style={{ color: "var(--app-ink-3)" }}
        >
          A drone-photography book by Michael DeMattia
        </span>
      </span>
      <ArrowRight
        aria-hidden
        className="h-4 w-4 shrink-0 transition group-hover:translate-x-0.5"
        strokeWidth={2.25}
        style={{ color: "var(--app-ink-3)" }}
      />
    </Link>
  );
}
