import Link from "next/link";
import type { Metadata } from "next";
import Image from "next/image";
import { Landmark } from "lucide-react";
import { getHistoricMarkersResult, getRegisterSitesResult } from "@/lib/integrations/historicSites";
import { MUNICIPALITY_BY_SLUG } from "@/data/municipalities";
import { Row, RowList, IconTile } from "@/components/ui/Row";
import CollapsibleSection from "@/components/ui/CollapsibleSection";
import MarkersExplorer from "@/components/markers/MarkersExplorer";
import { RODDY_ROAD_ARCHIVE_PHOTO as bridge } from "@/data/roddy-road-archive-photo";

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
      <header className="space-y-3">
        <div className="grid grid-cols-[minmax(0,1fr)_35%] overflow-hidden rounded-[var(--app-radius-lg)] border border-[var(--app-border)] bg-[var(--app-bg-elevated)]">
          <div className="flex flex-col justify-center gap-2 px-4 py-6 sm:px-7">
            <h1 className="display-2">Markers &amp; landmarks</h1>
            <p className="text-sm leading-snug text-[var(--app-ink-2)]">
              Roddy Road Covered Bridge, near Thurmont
            </p>
            <p className="text-xs leading-normal text-[var(--app-ink-2)]">
              Photographed {bridge.review.capture_period}
            </p>
          </div>
          <div className="relative min-h-40 sm:min-h-52">
            <Image
              src={bridge.image.src}
              alt={bridge.image.alt}
              fill
              priority
              sizes="(max-width: 960px) 35vw, 340px"
              className="object-cover"
              style={{ objectPosition: bridge.objectPosition }}
            />
          </div>
        </div>
        <p className="text-xs leading-normal text-[var(--app-ink-2)]">
          <a href={bridge.image.source_url} className="underline underline-offset-2">
            {bridge.image.creator}, Library of Congress
          </a>
          {" · "}
          <a href={bridge.image.license.url} className="underline underline-offset-2">{bridge.image.license.label}</a>
        </p>
        <p className="text-[14px] leading-relaxed" style={{ color: "var(--app-ink-2)" }}>
          Search roadside marker text from MDOT and National Register sites from
          the National Park Service. For longer local stories, see{" "}
          <Link href="/history" prefetch={false} className="font-semibold underline" style={{ color: "var(--app-brand-press)" }}>
            Frederick history
          </Link>
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
    </div>
  );
}
