import type { Metadata } from "next";
import { Suspense } from "react";
import { PLACES } from "@/data/places";
import { TOP_CATEGORIES } from "@/data/categories";
import { decoratePlace } from "@/lib/loaders/places";
import { fetchOsmFrederick } from "@/lib/integrations/overpass";
import PlaceCard from "@/components/place/PlaceCard";
import AppMapClient from "@/components/map/AppMapClient";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Map",
  description: "Every business, park, trail, library, and civic service in Frederick County on one map.",
};

export const revalidate = 86400;

export default async function MapPage() {
  const decorated = PLACES.map((p) => decoratePlace(p));
  const osmPlaces = await fetchOsmFrederick();

  return (
    <div className="space-y-4">
      <header className="space-y-1">
        <p className="text-[11px] font-medium uppercase tracking-[0.1em]" style={{ color: "var(--app-ink-3)" }}>
          {PLACES.length} curated + {osmPlaces.length.toLocaleString()} OSM businesses · all 12 municipalities
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

      <Suspense fallback={<MapFallback />}>
        <AppMapClient places={PLACES} osmPlaces={osmPlaces} />
      </Suspense>

      <p className="px-1 text-[10px]" style={{ color: "var(--app-ink-3)" }}>
        Business data from{" "}
        <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer" className="underline">
          OpenStreetMap contributors
        </a>{" "}
        · refreshed daily.
      </p>

      <section className="space-y-2 pt-2">
        <h2 className="text-xs font-medium uppercase tracking-[0.08em]" style={{ color: "var(--app-ink-3)" }}>
          Editorial picks
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

function MapFallback() {
  return (
    <div
      className="grid h-[65vh] place-items-center rounded-[var(--app-radius-lg)] border bg-[var(--app-bg-sunken)]"
      style={{ borderColor: "var(--app-border)" }}
    >
      <p className="text-sm" style={{ color: "var(--app-ink-3)" }}>Loading every business in Frederick County…</p>
    </div>
  );
}
