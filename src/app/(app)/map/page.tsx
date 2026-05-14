import type { Metadata } from "next";
import { PLACES } from "@/data/places";
import { TOP_CATEGORIES } from "@/data/categories";
import { decoratePlace } from "@/lib/loaders/places";
import PlaceCard from "@/components/place/PlaceCard";
import AppMapClient from "@/components/map/AppMapClient";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Map",
  description: "All Frederick County places on a map — restaurants, parks, trails, parking, events.",
};

export default function MapPage() {
  const decorated = PLACES.map((p) => decoratePlace(p));

  return (
    <div className="space-y-4">
      <header className="space-y-1">
        <p className="text-[11px] font-medium uppercase tracking-[0.1em]" style={{ color: "var(--app-ink-3)" }}>
          {PLACES.length} places · all 12 municipalities
        </p>
        <h1 className="font-serif text-[24px] font-semibold tracking-tight" style={{ color: "var(--app-ink)" }}>
          Map
        </h1>
      </header>

      <div className="-mx-4 overflow-x-auto px-4 scrollbar-hide">
        <ul className="flex min-w-max gap-1.5">
          {TOP_CATEGORIES.map((c) => (
            <li key={c.slug}>
              <Link
                href={`/category/${c.slug}`}
                className="inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors hover:bg-[var(--app-bg-sunken)]"
                style={{ borderColor: "var(--app-border)", color: "var(--app-ink-2)" }}
              >
                <span style={{ color: c.color }}>●</span>
                {c.name}
              </Link>
            </li>
          ))}
        </ul>
      </div>

      <AppMapClient places={PLACES} />

      <section className="space-y-2 pt-2">
        <h2 className="text-xs font-medium uppercase tracking-[0.08em]" style={{ color: "var(--app-ink-3)" }}>
          On the map
        </h2>
        <ul className="space-y-2">
          {decorated.slice(0, 15).map((p) => (
            <li key={p.slug}><PlaceCard place={p} /></li>
          ))}
        </ul>
      </section>
    </div>
  );
}
