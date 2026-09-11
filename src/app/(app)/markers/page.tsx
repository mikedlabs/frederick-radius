import type { Metadata } from "next";
import Image from "next/image";
import { Landmark } from "lucide-react";
import { getHistoricMarkersResult, getRegisterSitesResult } from "@/lib/integrations/historicSites";
import { MUNICIPALITY_BY_SLUG } from "@/data/municipalities";
import { Row, RowList, IconTile } from "@/components/ui/Row";
import CollapsibleSection from "@/components/ui/CollapsibleSection";
import MarkersExplorer from "@/components/markers/MarkersExplorer";
import { wikimediaUrl, LANDMARK_PHOTOS } from "@/lib/integrations/wikimedia";

// Editorial hero for the page itself: the red Roddy Road covered bridge, the
// visual shorthand for "history on the ground". Reuses the single verified
// Commons entry (file + attribution) from LANDMARK_PHOTOS so the filename and
// credit never drift between here and the place hero.
const MARKERS_HERO =
  LANDMARK_PHOTOS["historic-roddy-road-covered-bridge-thurmont"];

export const metadata: Metadata = {
  // Orphan-by-design like /trails and /rivers: real content, reachable by URL +
  // the More sheet + a cross-link from /history; kept out of sitemap competition.
  robots: { index: false, follow: true },
  title: "Markers & landmarks",
  description:
    "Read roadside marker records from MDOT and browse National Register sites returned by the National Park Service.",
};

// Markers and the register change rarely, so a week of caching cost nothing in
// freshness. It cost something worse: when a build fetched nothing, the empty
// page was frozen for SEVEN DAYS while telling readers to "check back shortly".
// Both services are keyless and this page is tiny, so an hour is effectively
// free and makes that sentence true.
export const revalidate = 3600;

const muniName = (slug: string) => MUNICIPALITY_BY_SLUG[slug]?.name ?? "Around the county";

export default async function MarkersPage() {
  // Ask each service whether it actually answered. An empty list alone cannot
  // tell the difference between "the county has no markers" and "we never
  // reached MDOT", and this page previously asserted the second from the
  // first, over services that were answering fine.
  const [markerResult, registerResult] = await Promise.all([
    getHistoricMarkersResult().catch(() => ({ items: [], ok: false })),
    getRegisterSitesResult().catch(() => ({ items: [], ok: false })),
  ]);
  const markers = markerResult.items;
  const register = registerResult.items;
  const unreachable = [
    markerResult.ok ? null : "Maryland's roadside marker service",
    registerResult.ok ? null : "the National Park Service register",
  ].filter((name): name is string => Boolean(name));

  const bridges = register.filter((s) => s.isCoveredBridge);

  return (
    <div className="space-y-6">
      {/* Editorial hero — a real photograph of the county's most iconic
          landmark carries identity before the eye reaches a word, then the
          serif title sits on a soft dark gradient so it stays readable. */}
      <header className="space-y-3">
        <div className="relative overflow-hidden rounded-[var(--app-radius-lg)]">
          <div className="relative h-40 w-full sm:h-60">
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
          Search roadside marker text from MDOT and National Register sites from
          the National Park Service. For longer local stories, see{" "}
          <a href="/history" className="font-semibold underline" style={{ color: "var(--app-brand-press)" }}>
            Frederick history
          </a>
          .
        </p>
      </header>

      {/* Name what could not be read, even when the other source carried the
          page. A layer silently missing is the same falsehood in a quieter
          form: the intro above promises both. */}
      {unreachable.length > 0 && (
        <section
          className="rounded-[var(--app-radius-lg)] border p-5"
          style={{ borderColor: "var(--app-border)", background: "var(--app-bg-elevated)" }}
        >
          <p className="text-[14px] leading-relaxed" style={{ color: "var(--app-ink-2)" }}>
            {unreachable.length === 1
              ? `We could not reach ${unreachable[0]} on this load, so those records are missing below.`
              : "We could not reach either history service on this load, so no records are shown below."}{" "}
            This page rechecks every hour.
          </p>
        </section>
      )}

      {markers.length === 0 && register.length === 0 && unreachable.length === 0 ? (
        <section
          className="rounded-[var(--app-radius-lg)] border p-5"
          style={{ borderColor: "var(--app-border)", background: "var(--app-bg-elevated)" }}
        >
          <p className="text-[14px] leading-relaxed" style={{ color: "var(--app-ink-2)" }}>
            Both history services answered and returned no Frederick County
            records.
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
