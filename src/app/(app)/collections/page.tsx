import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, BookOpen, CalendarCheck } from "lucide-react";
import { COLLECTIONS } from "@/data/collections";
import PageBloom from "@/components/ui/PageBloom";
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
 * The page itself is a thin index — a serif intro plus one card per
 * collection. The real content lives in /collections/[slug]; the
 * index just makes the catalogue scannable.
 */
export default function CollectionsIndex() {
  return (
    <div className="relative space-y-6">
      <PageBloom variant="warm-cool" />

      <header className="space-y-2">
        <h1 className="font-sans text-[clamp(2rem,8vw,3rem)] font-semibold leading-none tracking-[-0.035em]" style={{ color: "var(--app-ink)" }}>
          Local lists
        </h1>
        <p
          className="text-[14px] leading-snug"
          style={{ color: "var(--app-ink-3)" }}
        >
          Local shortlists organized around a specific plan.
        </p>
      </header>

      {/* The generator door — hand-picked lists below, a fresh plan here.
          (July 2026 outside review: "it's static! …you could generate
          different plans/paths." /plan already does; this is its front door.) */}
      <Link
        href="/plan"
        className="tactile tactile-interactive group flex items-center gap-3 rounded-[var(--app-radius-lg)] border border-dashed bg-[var(--app-bg-sunken)] p-4"
        style={{ borderColor: "var(--app-border-strong, var(--app-border))" }}
      >
        <span
          aria-hidden
          className="grid h-10 w-10 shrink-0 place-items-center rounded-full"
          style={{ background: "color-mix(in srgb, var(--app-brand) 14%, transparent)" }}
        >
          <CalendarCheck className="h-5 w-5" strokeWidth={2} style={{ color: "var(--app-brand)" }} aria-hidden />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block font-sans text-[16px] font-semibold leading-snug tracking-tight" style={{ color: "var(--app-ink)" }}>
            Need a plan for today?
          </span>
          <span className="mt-0.5 block text-[12.5px] leading-snug" style={{ color: "var(--app-ink-2)" }}>
            Choose a mood and how long you have. The route changes each time.
          </span>
        </span>
        <ArrowRight className="h-4 w-4 shrink-0 transition-transform group-hover:translate-x-0.5" strokeWidth={2.25} style={{ color: "var(--app-ink-3)" }} aria-hidden />
      </Link>

      <ul className="grid gap-3">
        {COLLECTIONS.map((c) => (
          <li key={c.slug}>
            <Link
              href={`/collections/${c.slug}`}
              className="tactile tactile-interactive group relative block overflow-hidden rounded-[var(--app-radius-lg)] border bg-[var(--app-bg-elevated)] p-4 transition"
              style={{
                borderColor: "var(--app-border)",
                boxShadow:
                  "var(--app-elev-1), var(--app-edge), var(--app-hi)",
              }}
            >
              {/* Color strip on the left edge — same trick as the
                  /places by-category tiles. Reads as taxonomy without
                  needing a separate eyebrow. */}
              <div
                aria-hidden
                className="absolute inset-y-0 left-0 w-1"
                style={{ background: c.accent }}
              />
              <div className="flex items-start gap-3 pl-2">
                <span
                  aria-hidden
                  className="grid h-9 w-9 shrink-0 place-items-center rounded-full"
                  style={{
                    background: `color-mix(in srgb, ${c.accent} 14%, transparent)`,
                  }}
                >
                  <BookOpen
                    className="h-4 w-4"
                    strokeWidth={2}
                    style={{ color: c.accent }}
                    aria-hidden
                  />
                </span>
                <div className="min-w-0 flex-1 space-y-1">
                  <h2
                    className="font-serif text-[18px] font-semibold leading-snug tracking-tight"
                    style={{ color: "var(--app-ink)" }}
                  >
                    {c.title}
                  </h2>
                  <p
                    className="text-[13px] leading-relaxed text-pretty"
                    style={{ color: "var(--app-ink-2)" }}
                  >
                    {c.blurb}
                  </p>
                  <p
                    className="text-[11px] font-semibold uppercase tracking-[0.08em]"
                    style={{ color: "var(--app-ink-3)" }}
                  >
                    {c.places.length} {c.places.length === 1 ? "place" : "places"}
                  </p>
                </div>
                <ArrowRight
                  className="mt-1 h-4 w-4 shrink-0 transition-transform group-hover:translate-x-0.5"
                  strokeWidth={2.25}
                  style={{ color: "var(--app-ink-3)" }}
                  aria-hidden
                />
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
