import Link from "next/link";
import { ArrowRight } from "lucide-react";
import SeasonalPhoto from "@/components/ui/SeasonalPhoto";

/**
 * FromAboveCta — a quiet doorway from /now into the From Above book
 * route. The book is real: six years of drone photography over
 * Downtown Frederick, organized by season. The route exists at
 * /from-above/preview as a full-bleed coffee-table-book experience.
 *
 * This card sits at the very end of /now as a deliberate "exit
 * beat" — once the user has the day's utility (weather, events,
 * places), this is the page's invitation to stay a little longer
 * in the county's photography. Daily-rotated seasonal thumbnail
 * carries the visual identity; the copy keeps the offer plain.
 *
 * Server component. SeasonalPhoto reads the same manifest as the
 * /about hero so this card can never get out of sync with what's
 * actually on disk.
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
      {/* Square seasonal thumbnail on the left. Aspect-locked so the
          next/image fill works against a sized parent. */}
      <div className="relative h-[72px] w-[72px] shrink-0 overflow-hidden rounded-[var(--app-radius-md)] sm:h-20 sm:w-20">
        <SeasonalPhoto
          season="auto"
          alt="Frederick from above"
          sizes="80px"
          className="absolute inset-0"
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
