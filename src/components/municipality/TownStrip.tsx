import Link from "next/link";
import { MUNICIPALITIES, MUNICIPALITY_BY_SLUG } from "@/data/municipalities";

/**
 * TownStrip — sibling-town nav for /m/[slug] pages.
 *
 * A horizontal scrolling pill row of every municipality the app
 * covers. The active town is filled in the brand color and pinned to
 * the LEFT so the user always sees "you are here · jump elsewhere"
 * as they land. Tapping a sibling navigates to that town's /m page.
 *
 * Pre-launch the only way to switch towns was BottomNav → Browse →
 * pan + search. This adds a direct "pick a different town" affordance
 * right where the user already is.
 *
 * Server component — no client JS. Each pill is a plain Link so the
 * Next.js prefetcher warms the target page on viewport intersection.
 */
export default function TownStrip({ activeSlug }: { activeSlug: string }) {
  const active = MUNICIPALITY_BY_SLUG[activeSlug];
  // Reorder so the active town comes first; the rest follow in the
  // original display order. This keeps the active pill visible without
  // requiring a horizontal scroll on mount for towns near the end of
  // the list (e.g. Urbana, Burkittsville).
  const others = MUNICIPALITIES.filter((m) => m.slug !== activeSlug);
  const ordered = active ? [active, ...others] : MUNICIPALITIES;

  return (
    <nav
      aria-label="Switch town"
      // -mx-4 lets the strip bleed to the screen edge so users see the
      // last chip clipping rather than ending flush, hinting at scroll.
      // overflow-x-auto + scrollbar-hide gives a clean horizontal sweep.
      className="-mx-4 flex gap-1.5 overflow-x-auto px-4 py-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
    >
      <span
        className="shrink-0 self-center pr-1 text-[10px] font-bold uppercase tracking-[0.12em]"
        style={{ color: "var(--app-ink-3)" }}
        aria-hidden
      >
        Towns
      </span>
      {ordered.map((m) => {
        const isActive = m.slug === activeSlug;
        return (
          <Link
            key={m.slug}
            href={`/m/${m.slug}`}
            aria-current={isActive ? "page" : undefined}
            className="inline-flex shrink-0 items-center rounded-full px-3 py-1.5 text-[11px] font-semibold tracking-tight transition active:scale-[0.97]"
            style={{
              background: isActive ? "var(--app-brand)" : "var(--app-bg-elevated)",
              color: isActive ? "#fff" : "var(--app-ink-2)",
              border: `1px solid ${isActive ? "var(--app-brand)" : "var(--app-border)"}`,
              boxShadow: isActive ? "var(--app-shadow-1)" : "none",
            }}
          >
            {m.name}
          </Link>
        );
      })}
    </nav>
  );
}
