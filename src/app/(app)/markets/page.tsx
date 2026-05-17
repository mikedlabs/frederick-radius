import type { Metadata } from "next";
import { Sprout } from "lucide-react";
import { publicPlaces, decoratePlace } from "@/lib/loaders/places";
import { isFarmersMarket } from "@/lib/farmersMarkets";
import { MUNICIPALITY_BY_SLUG } from "@/data/municipalities";
import PlaceCard from "@/components/place/PlaceCard";

export const metadata: Metadata = {
  title: "Farmers markets",
  description:
    "Every farmers and farm market across Frederick County, by town.",
};

export const revalidate = 3600;

export default function MarketsPage() {
  const markets = publicPlaces()
    .filter((p) => isFarmersMarket(p.name))
    .map((p) => decoratePlace(p))
    .sort((a, b) => b.feature_score - a.feature_score);

  const byMuni = new Map<string, typeof markets>();
  for (const m of markets) {
    const a = byMuni.get(m.municipality);
    if (a) a.push(m);
    else byMuni.set(m.municipality, [m]);
  }
  const groups = [...byMuni.entries()]
    .map(([slug, list]) => ({
      slug,
      name: MUNICIPALITY_BY_SLUG[slug]?.name ?? slug,
      list,
    }))
    .sort((a, b) => b.list.length - a.list.length);

  return (
    <div className="space-y-6">
      <header className="space-y-1.5">
        <p className="text-[11px] font-semibold uppercase tracking-[0.12em]" style={{ color: "var(--app-ink-3)" }}>
          Frederick County
        </p>
        <h1 className="font-serif text-[28px] font-semibold leading-tight tracking-tight" style={{ color: "var(--app-ink)" }}>
          Farmers markets
        </h1>
        <p className="text-[14px] leading-relaxed" style={{ color: "var(--app-ink-2)" }}>
          Real farmers and farm markets across the county, by town. Tap
          one for hours, location, and what it offers.
        </p>
      </header>

      {markets.length === 0 ? (
        <p
          className="rounded-[var(--app-radius-lg)] border border-dashed px-4 py-8 text-center text-sm"
          style={{ borderColor: "var(--app-border)", color: "var(--app-ink-3)" }}
        >
          No farmers markets are listed yet.
        </p>
      ) : (
        <>
          <p className="text-[12px]" style={{ color: "var(--app-ink-3)" }}>
            <strong className="font-serif text-base font-semibold" style={{ color: "var(--app-positive, #1E6B3A)" }}>
              {markets.length}
            </strong>{" "}
            markets across {groups.length} {groups.length === 1 ? "town" : "towns"}
          </p>
          {groups.map((g) => (
            <section key={g.slug} className="space-y-2.5">
              <h2 className="flex items-center gap-2 font-serif text-lg font-semibold tracking-tight" style={{ color: "var(--app-ink)" }}>
                <Sprout className="h-4 w-4" strokeWidth={2} style={{ color: "var(--app-positive, #1E6B3A)" }} aria-hidden />
                {g.name}{" "}
                <span className="text-[12px] font-normal" style={{ color: "var(--app-ink-3)" }}>
                  {g.list.length}
                </span>
              </h2>
              <div className="grid grid-cols-2 gap-2.5">
                {g.list.map((m) => (
                  <PlaceCard key={m.slug} place={m} variant="grid" />
                ))}
              </div>
            </section>
          ))}
        </>
      )}
    </div>
  );
}
