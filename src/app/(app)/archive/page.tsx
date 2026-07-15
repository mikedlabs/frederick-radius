import type { Metadata } from "next";
import { Building2, Camera, Library, Map, Newspaper, ShieldCheck } from "lucide-react";
import ArchiveLens, { type ArchiveViewRecord } from "@/components/archive/ArchiveLens";
import { PageWide } from "@/components/layout/Page";
import PageBloom from "@/components/ui/PageBloom";
import {
  FSA_OWI_PHOTOS,
  FREDERICK_COUNTY_LANDOWNER_MAP,
  HABS_RECORDS,
  LOC_ARCHIVE_RECORDS,
  NEWSPAPER_FEATURES,
  SANBORN_EDITIONS,
  formatLocAttribution,
  getLocArchiveImageUrl,
  type LocArchiveRecord,
} from "@/data/loc-archive";

export const metadata: Metadata = {
  alternates: { canonical: "/archive" },
  title: "Archive Lens",
  description:
    "Inspect curated Frederick maps, building surveys, newspaper pages, and documentary photographs from the Library of Congress.",
  openGraph: {
    title: "Archive Lens | Frederick Radius",
    description:
      "Primary-source maps, building surveys, newspapers, and photographs from Frederick's past.",
    type: "website",
  },
};

/**
 * Keep the Client Component payload intentionally narrow. The source module is
 * the reviewed record of truth; this adapter only selects display fields and
 * asks the shared image helper for a bounded high-resolution rendition.
 */
function toViewRecord(record: LocArchiveRecord): ArchiveViewRecord {
  const coordinates = record.location?.coordinates;
  const common: ArchiveViewRecord = {
    id: record.id,
    kind: record.kind,
    title: record.title,
    summary: record.summary,
    dateLabel: record.dateLabel,
    year: record.year,
    itemUrl: record.itemUrl,
    sourceUrl: record.sourceUrl,
    image: {
      url: getLocArchiveImageUrl(record, 2200),
      width: record.image.width,
      height: record.image.height,
      alt: record.image.alt,
    },
    attribution: formatLocAttribution(record),
    creditLine: record.creditLine,
    rights: record.rights,
    reviewedAt: record.reviewedAt,
    address: record.location?.address,
    coordinates: coordinates
      ? {
          lat: coordinates.lat,
          lng: coordinates.lng,
          precision: coordinates.precision,
        }
      : undefined,
  };

  switch (record.kind) {
    case "sanborn":
      return {
        ...common,
        editionYear: record.editionYear,
        sheetCount: record.sheetCount,
        manifestUrl: record.manifestUrl,
      };
    case "county-map":
      return { ...common, manifestUrl: record.manifestUrl };
    case "habs":
      return {
        ...common,
        address: record.address,
        surveyNumber: record.surveyNumber,
        documentationStats: [
          { label: "photos", value: record.documentation.photos },
          { label: "drawings", value: record.documentation.measuredDrawings },
          { label: "data pages", value: record.documentation.dataPages },
        ],
      };
    case "newspaper":
      return {
        ...common,
        publication: record.publication,
        issueDate: record.issueDate,
        pageNumber: record.pageNumber,
        ocrUrl: record.ocrUrl,
        featureTitle: record.featureTitle,
        excerpt: record.excerpt,
        ocrReview: record.ocrReview,
      };
    case "fsa-owi":
      return {
        ...common,
        photographer: record.photographer,
        createdDate: record.createdDate,
      };
  }
}

const chapters = [
  { href: "#map-room", label: "Map room", Icon: Map },
  { href: "#building-records", label: "Buildings", Icon: Building2 },
  { href: "#papers", label: "The papers", Icon: Newspaper },
  { href: "#documentary-photos", label: "Photographs", Icon: Camera },
] as const;

export default function ArchivePage() {
  const maps = [FREDERICK_COUNTY_LANDOWNER_MAP, ...SANBORN_EDITIONS].map(toViewRecord);
  const buildings = HABS_RECORDS.map(toViewRecord);
  const papers = NEWSPAPER_FEATURES.map(toViewRecord);
  const photos = FSA_OWI_PHOTOS.map(toViewRecord);
  const totalSheets = SANBORN_EDITIONS.reduce((sum, record) => sum + record.sheetCount, 0);
  const firstEdition = FREDERICK_COUNTY_LANDOWNER_MAP.year;
  const lastEdition = SANBORN_EDITIONS.at(-1)?.editionYear;

  return (
    <PageWide className="relative">
      <PageBloom variant="cool" />

      <header
        className="relative isolate overflow-hidden rounded-[var(--app-radius-xl)] border px-5 py-7 sm:px-8 sm:py-9 lg:px-10 lg:py-11"
        style={{
          borderColor: "color-mix(in srgb, var(--app-on-brand) 16%, transparent)",
          background: "var(--app-brand-2)",
          color: "var(--app-on-brand)",
          boxShadow: "var(--app-elev-3)",
        }}
      >
        <div
          className="pointer-events-none absolute inset-0 -z-10 opacity-[0.12]"
          style={{
            backgroundImage:
              "linear-gradient(rgba(255,255,255,.35) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.35) 1px, transparent 1px)",
            backgroundSize: "36px 36px",
          }}
          aria-hidden
        />
        <div
          className="pointer-events-none absolute -right-20 -top-24 -z-10 h-72 w-72 rounded-full border border-white/20"
          aria-hidden
        >
          <div className="absolute inset-10 rounded-full border border-white/15" />
          <div className="absolute inset-24 rounded-full border border-white/15" />
        </div>

        <div className="relative max-w-[48rem]">
          <p className="eyebrow inline-flex items-center gap-2 text-white/72">
            <Library className="h-3.5 w-3.5" aria-hidden />
            Archive Lens · primary sources
          </p>
          <h1 className="mt-3 max-w-[42rem] font-serif text-[38px] font-semibold leading-[0.98] tracking-tight text-white sm:text-[50px] lg:text-[58px]">
            Frederick, under the surface.
          </h1>
          <p className="mt-4 max-w-[39rem] text-[14px] leading-relaxed text-white/78 sm:text-[16px]">
            Fire-insurance maps. Measured building surveys. Newspaper pages. Documentary photographs. Inspect the records, then follow every object back to the Library of Congress.
          </p>

          <dl className="mt-6 flex flex-wrap gap-x-7 gap-y-3 border-t border-white/20 pt-4">
            <div>
              <dt className="text-[9px] font-bold uppercase tracking-[0.12em] text-white/55">Map editions</dt>
              <dd className="mt-0.5 font-serif text-[20px] font-semibold tabular-nums">
                {firstEdition} to {lastEdition}
              </dd>
            </div>
            <div>
              <dt className="text-[9px] font-bold uppercase tracking-[0.12em] text-white/55">Atlas sheets</dt>
              <dd className="mt-0.5 font-serif text-[20px] font-semibold tabular-nums">{totalSheets}</dd>
            </div>
            <div>
              <dt className="text-[9px] font-bold uppercase tracking-[0.12em] text-white/55">Reviewed records</dt>
              <dd className="mt-0.5 font-serif text-[20px] font-semibold tabular-nums">{LOC_ARCHIVE_RECORDS.length}</dd>
            </div>
          </dl>

          <p className="mt-5 inline-flex items-start gap-2 text-[10px] leading-relaxed text-white/60">
            <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
            Curated by Frederick Radius from Library of Congress records. Independent; no affiliation or endorsement is implied.
          </p>
        </div>
      </header>

      <nav
        aria-label="Archive Lens chapters"
        className="-mx-4 overflow-x-auto px-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        <ul className="flex min-w-max gap-2">
          {chapters.map(({ href, label, Icon }, index) => (
            <li key={href}>
              <a
                href={href}
                className="tap-44-y tactile tactile-interactive inline-flex items-center gap-2 rounded-full border px-3.5 py-2 text-[12px] font-semibold"
                style={{
                  borderColor: "var(--app-border)",
                  background: "var(--app-bg-elevated)",
                  color: "var(--app-ink)",
                }}
              >
                <span className="font-serif text-[11px] tabular-nums" style={{ color: "var(--app-brand-press)" }}>
                  {String(index + 1).padStart(2, "0")}
                </span>
                <Icon className="h-3.5 w-3.5" aria-hidden />
                {label}
              </a>
            </li>
          ))}
        </ul>
      </nav>

      <ArchiveLens maps={maps} buildings={buildings} papers={papers} photos={photos} />
    </PageWide>
  );
}
