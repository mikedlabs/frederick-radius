import Image from "next/image";
import Link from "next/link";
import { ArrowRight, ArrowUpRight, FileText, MapPin } from "lucide-react";
import {
  findNearbyLocArchiveRecords,
  formatLocAttribution,
  getLocArchiveImageUrl,
} from "@/data/loc-archive";
import { formatDistance } from "@/lib/geo";

const normalize = (value: string) => value.toLowerCase().replace(/[^a-z0-9]/g, "");

/**
 * Primary-source context for a place detail page.
 *
 * A conservative 120 m cutoff and the precision check matter: a city-center
 * coordinate is useful for discovery, but it is not evidence that a historic
 * building belongs beside a particular storefront. This surface self-hides
 * rather than overclaiming.
 */
export default function NearbyArchiveContext({
  lat,
  lng,
  excludeName,
}: {
  lat: number;
  lng: number;
  excludeName?: string;
}) {
  const excluded = excludeName ? normalize(excludeName) : "";
  const match = findNearbyLocArchiveRecords({ lat, lng }, 0.12).find(({ record }) => {
    const precision = record.location?.coordinates?.precision;
    return (
      record.kind === "habs" &&
      precision !== "city-center" &&
      (!excluded || normalize(record.title) !== excluded)
    );
  });

  if (!match) return null;

  const { record, distanceKm } = match;
  const imageUrl = getLocArchiveImageUrl(record, 640);
  const distance = formatDistance(distanceKm * 1000);

  return (
    <section aria-labelledby="nearby-archive-title" className="space-y-3">
      <header className="flex items-end justify-between gap-3">
        <div>
          <p className="eyebrow" style={{ color: "var(--app-brand-press)" }}>
            Primary source nearby
          </p>
          <h2 id="nearby-archive-title" className="mt-1 font-serif text-[20px] font-semibold tracking-tight" style={{ color: "var(--app-ink)" }}>
            This block, documented
          </h2>
        </div>
        <span className="inline-flex shrink-0 items-center gap-1 font-mono text-[10px] tabular-nums" style={{ color: "var(--app-ink-3)" }}>
          <MapPin className="h-3 w-3" aria-hidden />
          {distance} away
        </span>
      </header>

      <article
        className="overflow-hidden rounded-[var(--app-radius-lg)] border"
        style={{ borderColor: "var(--app-border)", background: "var(--app-bg-elevated)", boxShadow: "var(--app-elev-1), var(--app-hi)" }}
      >
        <div className="grid grid-cols-[104px_1fr] sm:grid-cols-[152px_1fr]">
          <div className="relative min-h-[142px] overflow-hidden" style={{ background: "var(--app-bg-sunken)" }}>
            <Image
              src={imageUrl}
              alt={record.image.alt}
              fill
              sizes="(max-width: 640px) 104px, 152px"
              className="object-cover"
            />
          </div>
          <div className="flex min-w-0 flex-col p-3.5">
            <p className="inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.1em]" style={{ color: "var(--app-accent-press)" }}>
              <FileText className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
              Historic American Buildings Survey
            </p>
            <h3 className="mt-1.5 font-serif text-[16px] font-semibold leading-tight" style={{ color: "var(--app-ink)" }}>
              {record.title}
            </h3>
            <p className="mt-1 line-clamp-3 text-[11.5px] leading-snug" style={{ color: "var(--app-ink-2)" }}>
              {record.summary}
            </p>
            <div className="mt-auto flex flex-wrap items-center gap-x-3 gap-y-1 pt-2 text-[11px] font-semibold">
              <Link
                href="/archive#building-records"
                className="inline-flex items-center gap-1"
                style={{ color: "var(--app-cool)" }}
              >
                See it in Archive Lens <ArrowRight className="h-3 w-3" aria-hidden />
              </Link>
              <a
                href={record.itemUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1"
                style={{ color: "var(--app-ink-3)" }}
              >
                LOC record <ArrowUpRight className="h-3 w-3" aria-hidden />
              </a>
            </div>
          </div>
        </div>
        <p className="border-t px-3.5 py-2 text-[9.5px] leading-snug" style={{ borderColor: "var(--app-border)", color: "var(--app-ink-3)" }}>
          {formatLocAttribution(record)} · Nearby means within 400 ft; it does not imply this is the same building.
        </p>
      </article>
    </section>
  );
}
