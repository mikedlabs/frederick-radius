import type { Metadata } from "next";
import Image from "next/image";
import { Landmark, MapPin } from "lucide-react";
import { getHistoricMarkers, getRegisterSites, type HistoricMarker } from "@/lib/integrations/historicSites";
import { MUNICIPALITY_BY_SLUG } from "@/data/municipalities";
import { Row, RowList, IconTile } from "@/components/ui/Row";
import CollapsibleSection from "@/components/ui/CollapsibleSection";
import { wikimediaUrl, LANDMARK_PHOTOS } from "@/lib/integrations/wikimedia";

// Editorial hero for the page itself: the red Roddy Road covered bridge, the
// visual shorthand for "history on the ground". Reuses the single verified
// Commons entry (file + attribution) from LANDMARK_PHOTOS so the filename and
// credit never drift between here and the place hero.
const MARKERS_HERO = LANDMARK_PHOTOS["roddy-road-park-thurmont"];

export const metadata: Metadata = {
  // Orphan-by-design like /trails and /rivers: real content, reachable by URL +
  // the More sheet + a cross-link from /history; kept out of sitemap competition.
  robots: { index: false, follow: true },
  title: "Markers & landmarks",
  description:
    "The history on the ground in Frederick County, Maryland: read the inscription on every roadside marker, and find the National Register landmarks and covered bridges. Live from MDOT and the National Park Service.",
};

// Markers + the register change rarely; the integration revalidates weekly.
export const revalidate = 604800;

const muniName = (slug: string) => MUNICIPALITY_BY_SLUG[slug]?.name ?? "Around the county";

function MarkerCard({ m }: { m: HistoricMarker }) {
  return (
    <article
      className="rounded-[var(--app-radius-lg)] border bg-[var(--app-bg-elevated)] p-4"
      style={{ borderColor: "var(--app-border)", boxShadow: "var(--app-elev-1), var(--app-edge), var(--app-hi)" }}
    >
      <h3 className="text-title font-serif" style={{ color: "var(--app-ink)" }}>
        {m.title}
      </h3>
      <p className="mt-0.5 font-mono text-[11px] uppercase tracking-wide" style={{ color: "var(--app-ink-3)" }}>
        {m.town || muniName(m.municipality)}
        {m.year ? ` · placed ${m.year}` : ""}
      </p>
      {m.inscription && (
        <p className="mt-2 text-[14px] leading-relaxed" style={{ color: "var(--app-ink-2)" }}>
          {m.inscription}
        </p>
      )}
      <a
        href={`/map?focus=${m.lat},${m.lng}`}
        className="tap-44 relative mt-3 inline-flex items-center gap-1 text-[12px] font-semibold"
        style={{ color: "var(--app-brand)" }}
      >
        <MapPin className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
        Find it on the map
      </a>
    </article>
  );
}

export default async function MarkersPage() {
  const [markers, register] = await Promise.all([
    getHistoricMarkers().catch(() => []),
    getRegisterSites().catch(() => []),
  ]);

  // Markers grouped by town, towns ordered by how many they carry.
  const byMuni = new Map<string, HistoricMarker[]>();
  for (const m of markers) {
    const a = byMuni.get(m.municipality);
    if (a) a.push(m);
    else byMuni.set(m.municipality, [m]);
  }
  const markerGroups = [...byMuni.entries()]
    .map(([slug, list]) => ({ slug, name: muniName(slug), list }))
    .sort((a, b) => b.list.length - a.list.length || a.name.localeCompare(b.name));

  const bridges = register.filter((s) => s.isCoveredBridge);

  return (
    <div className="space-y-6">
      {/* Editorial hero — a real photograph of the county's most iconic
          landmark carries identity before the eye reaches a word, then the
          serif title sits on a soft dark gradient so it stays readable. */}
      <header className="space-y-3">
        <div className="relative overflow-hidden rounded-[var(--app-radius-lg)]">
          <div className="relative h-48 w-full sm:h-60">
            <Image
              src={wikimediaUrl(MARKERS_HERO.file, 1200)}
              alt=""
              aria-hidden
              fill
              priority
              sizes="(max-width: 768px) 100vw, 640px"
              className="object-cover"
              style={{ objectPosition: "center 38%" }}
            />
            <div
              className="absolute inset-0"
              style={{
                background:
                  "linear-gradient(to top, rgba(0,0,0,0.72) 0%, rgba(0,0,0,0.25) 55%, transparent 90%)",
              }}
            />
            <div className="absolute inset-x-0 bottom-0 p-4 sm:p-5">
              <p className="eyebrow" style={{ color: "rgba(255,255,255,0.82)" }}>
                Frederick County · on the ground
              </p>
              <h1 className="display-2 text-white">Markers &amp; landmarks</h1>
            </div>
          </div>
        </div>
        <p className="text-[14px] leading-relaxed" style={{ color: "var(--app-ink-2)" }}>
          Read the inscription on every roadside marker in the county, and find the
          National Register landmarks and covered bridges. Live from MDOT and the
          National Park Service. For the stories behind them, see{" "}
          <a href="/history" className="font-semibold underline" style={{ color: "var(--app-brand-press)" }}>
            Frederick history
          </a>
          .
        </p>
      </header>

      {markers.length === 0 && register.length === 0 ? (
        <section
          className="rounded-[var(--app-radius-lg)] border p-5"
          style={{ borderColor: "var(--app-border)", background: "var(--app-bg-elevated)" }}
        >
          <p className="text-[14px] leading-relaxed" style={{ color: "var(--app-ink-2)" }}>
            The state and federal history layers aren&rsquo;t answering right now.
            Check back shortly.
          </p>
        </section>
      ) : (
        <>
          {markerGroups.length > 0 && (
            <section className="space-y-4">
              <div className="space-y-1">
                <h2 className="display-3 font-serif" style={{ color: "var(--app-ink)" }}>
                  Roadside markers
                </h2>
                <p className="font-mono text-[11px] uppercase tracking-wide" style={{ color: "var(--app-ink-3)" }}>
                  {markers.length} markers · MDOT SHA
                </p>
              </div>
              {markerGroups.map((g) => (
                <div key={g.slug} className="space-y-3">
                  <p className="fg-eyebrow">{g.name}</p>
                  {g.list.map((m) => (
                    <MarkerCard key={m.id} m={m} />
                  ))}
                </div>
              ))}
            </section>
          )}

          {register.length > 0 && (
            <CollapsibleSection title="On the National Register" count={register.length} storageKey="markers-register" defaultOpen={false}>
              <RowList>
                {register.map((s) => (
                  <Row
                    key={s.id}
                    href={`/map?focus=${s.lat},${s.lng}`}
                    leading={<IconTile icon={Landmark} tone="#7A5C2E" />}
                    title={s.name}
                    subtitle={[muniName(s.municipality), s.isCoveredBridge ? "Covered bridge" : null]
                      .filter(Boolean)
                      .join(" · ")}
                    meta={s.isNHL ? "National Landmark" : s.year ? `Listed ${s.year}` : undefined}
                  />
                ))}
              </RowList>
            </CollapsibleSection>
          )}

          {bridges.length > 0 && (
            <p className="text-[13px] leading-relaxed" style={{ color: "var(--app-ink-3)" }}>
              Includes {bridges.length} of the county&rsquo;s historic bridges, among them the
              Utica, Loys Station, and Roddy Road covered bridges.
            </p>
          )}
        </>
      )}

      <footer className="pt-2">
        <p className="text-[10px]" style={{ color: "var(--app-ink-3)" }}>
          Photo:{" "}
          <a href={MARKERS_HERO.source_url} target="_blank" rel="noopener noreferrer" style={{ color: "var(--app-ink-2)" }}>
            {MARKERS_HERO.author}
          </a>{" "}
          · {MARKERS_HERO.license} · via{" "}
          <a href="https://commons.wikimedia.org" target="_blank" rel="noopener noreferrer" style={{ color: "var(--app-ink-2)" }}>
            Wikimedia Commons
          </a>
        </p>
      </footer>
    </div>
  );
}
