import type { Metadata } from "next";
import Link from "next/link";
import { Mountain, Footprints, Bike, Dog, ExternalLink, ArrowRight } from "lucide-react";
import {
  getFrederickTrails,
  getFrederickTrailShapes,
  type Trail,
} from "@/lib/integrations/fcTrails";
import { getCountyBoundary } from "@/lib/integrations/fcGis";
import { publicPlaces, decoratePlace } from "@/lib/loaders/places";
import { MUNICIPALITY_BY_SLUG } from "@/data/municipalities";
import { Row, RowList, IconTile } from "@/components/ui/Row";
import CollapsibleSection from "@/components/ui/CollapsibleSection";
import TrailsMap from "@/components/trails/TrailsMap";

const EMPTY_FC = { type: "FeatureCollection" as const, features: [] };

export const metadata: Metadata = {
  // Orphan-by-design: this surface has real content but no
  // internal links from primary nav. Keep it reachable by direct
  // URL while telling crawlers not to compete it against the
  // focused surfaces in /sitemap. Reversible if the route is
  // promoted back into nav.
  robots: { index: false, follow: true },
  title: "Trails",
  description:
    "Browse trail records returned by Frederick County GIS, with surface and length where those details are available.",
};

// Trails change rarely; the integration revalidates weekly.
export const revalidate = 604800;

// Leading glyph reflects the trail's primary use (hike/bike/dog),
// falling back to the mountain mark — a little variety in the row rail.
const USE_ICON: Record<string, typeof Footprints> = {
  hiking: Footprints,
  "mountain biking": Bike,
  "road cycling": Bike,
  dogs: Dog,
};

/** One dense trail row: name + park/surface + length, taps to the map. */
function TrailRow({ t }: { t: Trail }) {
  const Icon = USE_ICON[t.uses[0] ?? ""] ?? Mountain;
  const bits = [
    t.park && t.park !== t.name ? t.park : null,
    t.surface || null,
    t.skill || null,
    t.ada ? "ADA" : null,
  ].filter(Boolean);
  return (
    <Row
      href={`/map?at=${t.lat},${t.lng}`}
      leading={<IconTile icon={Icon} tone="#1E6B3A" />}
      title={t.name}
      subtitle={bits.length ? bits.join(" · ") : undefined}
      meta={t.lengthMi != null ? `${t.lengthMi} mi` : undefined}
    />
  );
}

export default async function TrailsPage() {
  // The list (curated), the map's trail geometry (county Parks GIS), and the
  // county outline all load together; each degrades to empty on a feed hiccup
  // so a slow county server never blocks the page.
  const [trails, trailLines, countyBoundary] = await Promise.all([
    getFrederickTrails(),
    getFrederickTrailShapes().catch(() => EMPTY_FC),
    getCountyBoundary().catch(() => EMPTY_FC),
  ]);

  // Tappable trailhead pins for the map: our own trail records (the trail
  // category plus Sugarloaf, which is a natural area tagged with a trail).
  const trailPoints = publicPlaces()
    .filter((p) => p.category === "trail" || (p.subcategories ?? []).includes("trail"))
    .map((p) => decoratePlace(p));

  const byMuni = new Map<string, Trail[]>();
  for (const t of trails) {
    const a = byMuni.get(t.municipality);
    if (a) a.push(t);
    else byMuni.set(t.municipality, [t]);
  }
  const groups = [...byMuni.entries()]
    .map(([slug, list]) => ({
      slug,
      name: MUNICIPALITY_BY_SLUG[slug]?.name ?? slug,
      list: list.sort((a, b) => (b.lengthMi ?? 0) - (a.lengthMi ?? 0)),
    }))
    .sort((a, b) => b.list.length - a.list.length);

  return (
    <div className="space-y-6">
      <header className="space-y-1.5">
        <p className="eyebrow">
          Frederick County GIS
        </p>
        <h1 className="display-2" style={{ color: "var(--app-ink)" }}>
          Trails
        </h1>
        <p className="text-[14px] leading-relaxed" style={{ color: "var(--app-ink-2)" }}>
          Browse the trail records returned by the county GIS. Tap a record
          to see its mapped location.
        </p>
      </header>

      <TrailsMap
        places={trailPoints}
        trailLines={trailLines}
        countyBoundary={countyBoundary}
        segmentCount={trailLines.features.length}
      />

      <Link
        href="/collections/where-to-ride"
        className="flex min-h-11 items-center gap-3 rounded-[var(--app-radius-md)] border px-3.5 py-3 transition active:scale-[0.99]"
        style={{
          borderColor: "color-mix(in srgb, var(--app-brand-2) 35%, var(--app-border))",
          background: "color-mix(in srgb, var(--app-brand-2) 7%, var(--app-bg-elevated))",
        }}
      >
        <span
          aria-hidden
          className="grid h-9 w-9 shrink-0 place-items-center rounded-full"
          style={{ background: "color-mix(in srgb, var(--app-brand-2) 16%, transparent)", color: "var(--app-brand-2)" }}
        >
          <Bike className="h-4 w-4" strokeWidth={2.25} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[14px] font-semibold" style={{ color: "var(--app-ink)" }}>
            Where to ride
          </span>
          <span className="block text-[12px]" style={{ color: "var(--app-ink-3)" }}>
            The best bike paths, from the C&amp;O towpath to the watershed singletrack.
          </span>
        </span>
        <ArrowRight className="h-4 w-4 shrink-0" strokeWidth={2} style={{ color: "var(--app-ink-3)" }} aria-hidden />
      </Link>

      {trails.length === 0 ? (
        <section
          className="space-y-3 rounded-[var(--app-radius-lg)] border p-5"
          style={{ borderColor: "var(--app-border)", background: "var(--app-bg-elevated)" }}
        >
          <p className="text-[14px] leading-relaxed" style={{ color: "var(--app-ink-2)" }}>
            We&rsquo;re rebuilding our connection to the county trail
            layer. Use these public trail sources while the feed is
            unavailable:
          </p>
          <ul className="space-y-2">
            {[
              {
                href: "https://dnr.maryland.gov/publiclands/Pages/Western/Catoctin.aspx",
                title: "Catoctin Mountain Park · NPS",
                meta: "Cunningham Falls Loop · Wolf Rock · Chimney Rock · Hog Rock",
              },
              {
                href: "https://www.nps.gov/choh/index.htm",
                title: "C&O Canal Towpath · NPS",
                meta: "184 miles flat from Cumberland to Georgetown. Brunswick &amp; Point of Rocks segments",
              },
              {
                href: "https://www.frederickcountymd.gov/253/Trails",
                title: "Frederick County Trails directory",
                meta: "Greenbrier · Gambrill · Sugarloaf · the master trail list",
              },
            ].map((t) => (
              <li key={t.href}>
                <a
                  href={t.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-start gap-3 rounded-[var(--app-radius-md)] border bg-[var(--app-bg-sunken)] px-3 py-2.5 transition hover:bg-[var(--app-bg-elevated)]"
                  style={{ borderColor: "var(--app-border)" }}
                >
                  <span
                    aria-hidden
                    className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-full"
                    style={{ background: "color-mix(in srgb, var(--app-positive, #1E6B3A) 14%, transparent)" }}
                  >
                    <Mountain className="h-4 w-4" strokeWidth={2} style={{ color: "var(--app-positive, #1E6B3A)" }} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-[14px] font-semibold" style={{ color: "var(--app-ink)" }}>
                      {t.title}
                    </span>
                    <span className="block text-[12px]" style={{ color: "var(--app-ink-3)" }}>
                      {t.meta}
                    </span>
                  </span>
                  <ExternalLink className="mt-0.5 h-3.5 w-3.5 shrink-0" strokeWidth={2} style={{ color: "var(--app-ink-3)" }} aria-hidden />
                </a>
              </li>
            ))}
          </ul>
          <p className="text-[11px]" style={{ color: "var(--app-ink-3)" }}>
            The searchable list will return when the feed reconnects.
          </p>
        </section>
      ) : (
        <>
          <p className="text-[12px]" style={{ color: "var(--app-ink-3)" }}>
            <strong className="font-serif text-base font-semibold" style={{ color: "var(--app-positive, #1E6B3A)" }}>
              {trails.length}
            </strong>{" "}
            trails across {groups.length} {groups.length === 1 ? "area" : "areas"}
          </p>
          {/* Dense, collapsed-by-area — same field-guide treatment as
              /parks so the two GIS surfaces read as one system. Largest
              area open; the rest tuck away (choice persists). */}
          {groups.map((g, i) => (
            <CollapsibleSection
              key={g.slug}
              title={g.name}
              count={g.list.length}
              countLabel={g.list.length === 1 ? "trail" : "trails"}
              headingLevel={2}
              storageKey={`fr.trails.${g.slug}`}
              defaultOpen={i === 0}
            >
              <RowList>
                {g.list.map((t) => (
                  <TrailRow key={t.id} t={t} />
                ))}
              </RowList>
            </CollapsibleSection>
          ))}
          <p className="px-1 text-[10px]" style={{ color: "var(--app-ink-3)" }}>
            Data comes from Frederick County GIS open data. Radius refreshes
            the records weekly.
          </p>
        </>
      )}
    </div>
  );
}
