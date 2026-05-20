import type { Metadata } from "next";
import Link from "next/link";
import {
  Coffee,
  Utensils,
  Wine,
  Trees,
  Baby,
  Palette,
  Landmark,
  Map as MapIcon,
  ArrowRight,
} from "lucide-react";
import { publicPlaces, decoratePlace } from "@/lib/loaders/places";
import PlaceCard from "@/components/place/PlaceCard";
import PageBloom from "@/components/ui/PageBloom";
import StatStrip from "@/components/ui/StatStrip";
import SectionHeading from "@/components/ui/SectionHeading";
import { FREDERICK_CENTER } from "@/lib/geo";
import { INTENTS, type Intent } from "@/data/intents";

export const metadata: Metadata = {
  title: "Discover",
  description:
    "What to do in Frederick County — coffee, food, outdoors, family, arts, civic services. The map answers a question instead of dumping every pin on the page.",
};

export const revalidate = 300;

// Lucide icon resolution kept in this server file so we don't ship an
// icon map to the client.
const ICON: Record<Intent["icon"], typeof Coffee> = {
  Coffee,
  Utensils,
  Wine,
  Trees,
  Baby,
  Palette,
  Landmark,
};

export default async function DiscoverPage() {
  const all = publicPlaces().map((p) =>
    decoratePlace(p, FREDERICK_CENTER, new Date()),
  );

  // Pre-compute the top picks per intent on the server so the page
  // ships with answers, not just buckets. Each intent gets up to 4
  // photo-backed or open results, distance-sorted.
  const intentResults = INTENTS.map((intent) => {
    let pool = all.filter(intent.match);
    if (intent.preferOpen) {
      pool = pool.filter((p) => p.open_status.state !== "closed");
    }
    const top = pool
      .sort((a, b) => {
        // Photos first, then verified, then distance.
        const aPhoto = a.google_photo_url ? 1 : 0;
        const bPhoto = b.google_photo_url ? 1 : 0;
        if (aPhoto !== bPhoto) return bPhoto - aPhoto;
        const aV = a.is_verified ? 1 : 0;
        const bV = b.is_verified ? 1 : 0;
        if (aV !== bV) return bV - aV;
        return (a.distance_m ?? Infinity) - (b.distance_m ?? Infinity);
      })
      .slice(0, 4);
    return { intent, count: pool.length, top };
  });

  return (
    <div className="relative space-y-6">
      <PageBloom variant="cool" />

      <header className="space-y-2">
        <p className="eyebrow" style={{ color: "var(--app-ink-3)" }}>
          Discover · spatial answers
        </p>
        <h1 className="display-1" style={{ color: "var(--app-ink)" }}>
          What are you up to?
        </h1>
        <p className="text-[14px] leading-relaxed text-pretty" style={{ color: "var(--app-ink-2)" }}>
          Six honest entry points instead of a wall of pins. Pick what
          you&apos;re actually doing — coffee, dinner, kids, a hike —
          and we&apos;ll give you the spots that fit, on the map and in
          a short list.
        </p>
      </header>

      <StatStrip
        stats={[
          { label: "Places", value: all.length },
          { label: "Open now", value: all.filter((p) => p.open_status.state === "open").length },
          { label: "Towns", value: 13 },
        ]}
        eyebrow="Across Frederick County"
      />

      {/* Intent tiles — six tactile cards in a 2-up grid. Each is a
          link to its dedicated map view, but the page also embeds the
          top picks inline below so users get answers without leaving. */}
      <section className="grid grid-cols-2 gap-3" aria-label="Discover by intent">
        {intentResults.map(({ intent, count }) => {
          const Icon = ICON[intent.icon];
          return (
            <Link
              key={intent.key}
              href={`/map/all?intent=${intent.key}`}
              className="tactile tactile-interactive relative overflow-hidden rounded-[var(--app-radius-lg)] p-4"
              style={{
                background: `linear-gradient(155deg, color-mix(in srgb, ${intent.color} 22%, var(--app-bg-elevated)), color-mix(in srgb, ${intent.color} 6%, var(--app-bg-elevated)))`,
              }}
            >
              <span
                aria-hidden
                className="absolute inset-y-0 left-0 w-1"
                style={{ background: intent.color }}
              />
              <div
                aria-hidden
                className="absolute -bottom-3 -right-3 opacity-15"
                style={{ color: intent.color }}
              >
                <Icon className="h-20 w-20" strokeWidth={1.25} />
              </div>
              <div
                className="relative grid h-9 w-9 place-items-center rounded-full"
                style={{ background: `color-mix(in srgb, ${intent.color} 24%, transparent)`, color: intent.color }}
              >
                <Icon className="h-4 w-4" strokeWidth={2.25} aria-hidden />
              </div>
              <p
                className="relative mt-2 font-serif text-[16px] font-semibold leading-tight tracking-tight"
                style={{ color: "var(--app-ink)" }}
              >
                {intent.label}
              </p>
              <p
                className="relative mt-1 text-[11px] leading-snug"
                style={{ color: "var(--app-ink-3)" }}
              >
                {intent.blurb}
              </p>
              <p
                className="relative mt-2 text-[10px] font-bold uppercase tracking-[0.1em]"
                style={{ color: intent.color }}
              >
                {count.toLocaleString()} {count === 1 ? "place" : "places"}
              </p>
            </Link>
          );
        })}
      </section>

      {/* Inline answers — top 4 per intent, sectioned. The map view
          at /map/all carries the full set + the spatial pan/zoom. */}
      <div className="space-y-7">
        {intentResults
          .filter(({ top }) => top.length > 0)
          .map(({ intent, top }) => (
            <section key={intent.key} className="space-y-3">
              <SectionHeading
                title={intent.label}
                count={top.length}
                href={`/map/all?intent=${intent.key}`}
                cta="See on map"
                accent={intent.color}
              />
              <ul className="grid grid-cols-2 gap-2">
                {top.map((p) => (
                  <li key={p.slug}>
                    <PlaceCard place={p} variant="grid" />
                  </li>
                ))}
              </ul>
            </section>
          ))}
      </div>

      {/* Quiet escape hatch for power users / city geeks who still want
          the full panable map. */}
      <Link
        href="/map/all"
        className="tactile tactile-interactive flex items-center justify-between gap-3 rounded-[var(--app-radius-lg)] bg-[var(--app-bg-elevated)] px-4 py-3"
      >
        <div>
          <p
            className="font-serif text-[15px] font-semibold leading-tight tracking-tight"
            style={{ color: "var(--app-ink)" }}
          >
            Or open the full map
          </p>
          <p className="mt-0.5 text-[11px]" style={{ color: "var(--app-ink-3)" }}>
            {all.length.toLocaleString()} places, all categories, full pan and zoom.
          </p>
        </div>
        <span
          className="grid h-9 w-9 place-items-center rounded-full"
          style={{ background: "color-mix(in srgb, var(--app-cool) 14%, transparent)", color: "var(--app-cool)" }}
          aria-hidden
        >
          <MapIcon className="h-4 w-4" strokeWidth={2.25} />
        </span>
        <ArrowRight className="h-4 w-4 shrink-0" strokeWidth={2} style={{ color: "var(--app-ink-3)" }} aria-hidden />
      </Link>
    </div>
  );
}
