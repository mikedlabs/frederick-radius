import Image from "next/image";
import Link from "next/link";
import { ArrowRight, ArrowUpRight } from "lucide-react";
import {
  findNearbyLocArchiveRecords,
  formatLocAttribution,
  getLocArchiveImageUrl,
} from "@/data/loc-archive";
import { formatDistance } from "@/lib/geo";
import PlaceSectionLabel from "@/components/place/PlaceSectionLabel";

const normalize = (value: string) => value.toLowerCase().replace(/[^a-z0-9]/g, "");

/**
 * Primary-source context for a place detail page.
 *
 * A conservative 120 m cutoff and the precision check matter: a city-center
 * coordinate is useful for discovery, but it is not evidence that a historic
 * building belongs beside a particular storefront. This surface self-hides
 * rather than overclaiming.
 *
 * PLAIN TOOL: an unboxed section on the page ground. The 13px uppercase
 * label and the distance head it, and the record is one row: the survey
 * photo at 6px corners beside a 17px sans title and 14px muted text. The
 * place page draws the rule above the section, so it brings no frame,
 * fill or shadow of its own.
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
      {/* The eyebrow keeps the section label style; the section's heading
          is the title under it. */}
      <header>
        <div className="flex items-baseline justify-between gap-3">
          <PlaceSectionLabel as="p">
            Primary source nearby
          </PlaceSectionLabel>
          <span className="shrink-0 text-[14px] tabular-nums" style={{ color: "var(--app-ink-2)" }}>
            {distance} away
          </span>
        </div>
        <h2
          id="nearby-archive-title"
          className="mt-1.5 text-[1.25rem] font-bold leading-tight tracking-[-0.01em]"
          style={{ color: "var(--app-ink)" }}
        >
          This block, documented
        </h2>
      </header>

      <article className="flex items-start gap-3">
        <div
          className="relative h-[104px] w-[88px] shrink-0 overflow-hidden rounded-[var(--app-radius-md)] sm:h-[132px] sm:w-[120px]"
          style={{ background: "var(--app-bg-sunken)" }}
        >
          <Image
            src={imageUrl}
            alt={record.image.alt}
            fill
            sizes="(max-width: 640px) 88px, 120px"
            className="object-cover"
          />
        </div>
        <div className="flex min-w-0 flex-1 flex-col">
          <h3 className="text-[17px] font-semibold leading-[1.3] tracking-tight" style={{ color: "var(--app-ink)" }}>
            {record.title}
          </h3>
          <p className="mt-0.5 text-[14px] leading-snug" style={{ color: "var(--app-ink-2)" }}>
            Historic American Buildings Survey
          </p>
          <p className="mt-1 line-clamp-3 text-[14px] leading-snug" style={{ color: "var(--app-ink-2)" }}>
            {record.summary}
          </p>
          <div className="flex flex-wrap items-center gap-x-5 text-[14px] font-semibold">
            <Link
              prefetch={false}
              href="/archive#building-records"
              className="tap-44-y inline-flex min-h-11 items-center gap-1 underline-offset-2 hover:underline"
              style={{ color: "var(--app-cool-text)" }}
            >
              See it in Archive Lens <ArrowRight className="h-3.5 w-3.5" strokeWidth={2.25} aria-hidden />
            </Link>
            <a
              href={record.itemUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="tap-44-y inline-flex min-h-11 items-center gap-1 underline-offset-2 hover:underline"
              style={{ color: "var(--app-ink-2)" }}
            >
              LOC record <ArrowUpRight className="h-3.5 w-3.5" strokeWidth={2.25} aria-hidden />
            </a>
          </div>
        </div>
      </article>
      <p className="text-[12px] leading-snug" style={{ color: "var(--app-ink-3)" }}>
        {formatLocAttribution(record)} · Nearby means within 400 ft; it does not imply this is the same building.
      </p>
    </section>
  );
}
