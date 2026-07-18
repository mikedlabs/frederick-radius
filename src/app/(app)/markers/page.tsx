import type { Metadata } from "next";
import Image from "next/image";
import { Landmark } from "lucide-react";
import { getHistoricMarkers, getRegisterSites } from "@/lib/integrations/historicSites";
import { MUNICIPALITY_BY_SLUG } from "@/data/municipalities";
import { Row, RowList, IconTile } from "@/components/ui/Row";
import CollapsibleSection from "@/components/ui/CollapsibleSection";
import MarkersExplorer from "@/components/markers/MarkersExplorer";
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
    "Read roadside marker records from MDOT and browse National Register sites returned by the National Park Service.",
};

// Markers + the register change rarely; the integration revalidates weekly.
export const revalidate = 604800;

const muniName = (slug: string) => MUNICIPALITY_BY_SLUG[slug]?.name ?? "Around the county";

export default async function MarkersPage() {
  const [markers, register] = await Promise.all([
    getHistoricMarkers().catch(() => []),
    getRegisterSites().catch(() => []),
  ]);

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
          Read roadside marker text returned by MDOT and browse National Register
          sites from the National Park Service. For longer local stories, see{" "}
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
          {markers.length > 0 && <MarkersExplorer markers={markers} />}

          {register.length > 0 && (
            <CollapsibleSection title="On the National Register" count={register.length} headingLevel={2} storageKey="markers-register" defaultOpen={false}>
              <RowList>
                {register.map((s) => (
                  <Row
                    key={s.id}
                    href={`/map?at=${s.lat},${s.lng}`}
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
              The returned register data includes {bridges.length} historic bridges, among them the
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
