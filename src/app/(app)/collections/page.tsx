import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, BookOpen } from "lucide-react";
import { COLLECTIONS } from "@/data/collections";
import PageBloom from "@/components/ui/PageBloom";

export const metadata: Metadata = {
  alternates: { canonical: "/collections" },
  title: "Collections",
  description:
    "Editorial collections of Frederick places, picked by a resident. Walkable date nights, rainy-day spots, kid energy burners, and more.",
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
        <p className="eyebrow" style={{ color: "var(--app-ink-3)" }}>
          Collections
        </p>
        <h1 className="display-1" style={{ color: "var(--app-ink)" }}>
          Where a local would send you.
        </h1>
        <p
          className="text-[15px] leading-relaxed text-pretty"
          style={{ color: "var(--app-ink-2)" }}
        >
          Picks from a downtown resident, grouped by the question you came in
          with. None of these is a list of every option in town. Each one is
          the short answer.
        </p>
      </header>

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
