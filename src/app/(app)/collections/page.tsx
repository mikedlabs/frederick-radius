import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, BookOpen, CalendarCheck } from "lucide-react";
import { COLLECTIONS } from "@/data/collections";
import { PRODUCT_NAMES } from "@/lib/product-names";

export const metadata: Metadata = {
  alternates: { canonical: "/collections" },
  title: PRODUCT_NAMES.localLists.pageTitle,
  description: PRODUCT_NAMES.localLists.description,
};

/**
 * /collections — the editorial-collections index.
 *
 * Pre-launch review §6 caught that /places reads as a directory.
 * Google Maps shows 2,000 pins; a field guide says "if it's raining,
 * here are the six places I'd send a stranger downtown." Collections
 * is the layer that makes those recommendations explicit.
 *
 * The page itself is a thin index: a plain intro, then one ruled row per
 * collection on the page ground. The real content lives in
 * /collections/[slug]; the index just makes the catalogue scannable.
 */
export default function CollectionsIndex() {
  return (
    <div className="relative space-y-6">
      <header className="space-y-2">
        <h1 className="font-sans text-[clamp(2rem,8vw,3rem)] font-bold leading-none tracking-[-0.035em]" style={{ color: "var(--app-ink)" }}>
          Local lists
        </h1>
        <p
          className="text-[14px] leading-snug"
          style={{ color: "var(--app-ink-2)" }}
        >
          Local shortlists organized around a specific plan.
        </p>
      </header>

      {/* PLAIN TOOL: the generator door and the lists are ruled rows on the
          page ground. Each row leads with its glyph in ink-3 inside a fixed
          slot (no tile, tint or stripe), a 17px title and a 14px muted line.
          (July 2026 outside review: "it's static! ...you could generate
          different plans/paths." /plan already does; the first row is its
          front door.) */}
      <div>
        <Link href="/plan" className="group flex min-h-11 items-start gap-3 border-y py-3.5" style={{ borderColor: "var(--app-border)" }}>
          <span aria-hidden className="flex w-7 shrink-0 justify-start pt-px">
            <CalendarCheck className="h-6 w-6" strokeWidth={1.75} style={{ color: "var(--app-ink-3)" }} aria-hidden />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-[17px] font-semibold leading-[1.3] tracking-tight group-hover:underline" style={{ color: "var(--app-ink)" }}>
              Need a plan for today?
            </span>
            <span className="mt-0.5 block text-[14px] leading-snug" style={{ color: "var(--app-ink-2)" }}>
              Choose a mood and how long you have. The route changes each time.
            </span>
          </span>
          <ArrowRight className="mt-1 h-4 w-4 shrink-0" strokeWidth={2.25} style={{ color: "var(--app-ink-3)" }} aria-hidden />
        </Link>
        <ul>
        {COLLECTIONS.map((c) => (
          <li key={c.slug} className="border-b" style={{ borderColor: "var(--app-border)" }}>
            <Link href={`/collections/${c.slug}`} className="group flex min-h-11 items-start gap-3 py-3.5">
              <span aria-hidden className="flex w-7 shrink-0 justify-start pt-px">
                <BookOpen className="h-6 w-6" strokeWidth={1.75} style={{ color: "var(--app-ink-3)" }} aria-hidden />
              </span>
              <div className="min-w-0 flex-1 space-y-1">
                <h2
                  className="text-[17px] font-semibold leading-[1.3] tracking-tight group-hover:underline"
                  style={{ color: "var(--app-ink)" }}
                >
                  {c.title}
                </h2>
                <p
                  className="text-[14px] leading-relaxed text-pretty"
                  style={{ color: "var(--app-ink-2)" }}
                >
                  {c.blurb}
                </p>
                <p
                  className="text-[13px] tabular-nums"
                  style={{ color: "var(--app-ink-3)" }}
                >
                  {c.places.length} {c.places.length === 1 ? "place" : "places"}
                </p>
              </div>
              <ArrowRight
                className="mt-1 h-4 w-4 shrink-0"
                strokeWidth={2.25}
                style={{ color: "var(--app-ink-3)" }}
                aria-hidden
              />
            </Link>
          </li>
        ))}
      </ul>
      </div>
    </div>
  );
}
