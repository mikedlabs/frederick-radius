import Image from "next/image";
import Link from "next/link";
import { ArrowRight, Library } from "lucide-react";
import {
  LOC_ARCHIVE_RECORDS,
  formatLocAttribution,
  getLocArchiveImageUrl,
  getRotatingLocArchiveRecord,
} from "@/data/loc-archive";

/**
 * A single, quiet archive beat for the collapsed depth of /today.
 *
 * This deliberately does not bring back a wall of generic history facts. One
 * reviewed primary source rotates with the day and hands the curious reader to
 * Archive Lens; the daily utility above it stays untouched.
 */
export default function ArchiveTodayMoment({ date }: { date: Date }) {
  const record = getRotatingLocArchiveRecord(date, LOC_ARCHIVE_RECORDS);
  const imageUrl = getLocArchiveImageUrl(record, 720);

  return (
    <article
      className="relative overflow-hidden rounded-[var(--app-radius-lg)] border"
      style={{
        borderColor: "var(--app-border)",
        background: "var(--app-bg-elevated)",
        boxShadow: "var(--app-elev-1), var(--app-edge), var(--app-hi)",
      }}
    >
      <div className="grid min-h-[154px] grid-cols-[112px_1fr] sm:grid-cols-[168px_1fr]">
        <div className="relative overflow-hidden" style={{ background: "var(--app-bg-sunken)" }}>
          <Image
            src={imageUrl}
            alt={record.image.alt}
            fill
            sizes="(max-width: 640px) 112px, 168px"
            className="object-cover transition-transform duration-500 motion-safe:hover:scale-[1.02]"
          />
          <div
            aria-hidden
            className="absolute inset-0"
            style={{ background: "linear-gradient(90deg, transparent 65%, rgba(34, 30, 24, 0.14))" }}
          />
        </div>

        <div className="flex min-w-0 flex-col p-3.5 sm:p-4">
          <p className="eyebrow inline-flex items-center gap-1.5" style={{ color: "var(--app-brand-press)" }}>
            <Library className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
            From the archive
          </p>
          <p className="mt-1 font-mono text-[10px] tabular-nums" style={{ color: "var(--app-ink-3)" }}>
            {record.dateLabel}
          </p>
          <h3
            className="mt-1 line-clamp-2 font-serif text-[17px] font-semibold leading-[1.12] tracking-tight sm:text-[19px]"
            style={{ color: "var(--app-ink)" }}
          >
            {record.title}
          </h3>
          <p className="mt-1 line-clamp-2 text-[11.5px] leading-snug" style={{ color: "var(--app-ink-2)" }}>
            {record.summary}
          </p>
          <Link
            href="/archive"
            className="tap-44-y mt-auto inline-flex items-center gap-1 self-start pt-2 text-[12px] font-semibold"
            style={{ color: "var(--app-cool)" }}
          >
            Open Archive Lens
            <ArrowRight className="h-3.5 w-3.5" strokeWidth={2.25} aria-hidden />
          </Link>
        </div>
      </div>
      <p
        className="border-t px-3.5 py-2 text-[9.5px] leading-snug"
        style={{ borderColor: "var(--app-border)", color: "var(--app-ink-3)" }}
      >
        {formatLocAttribution(record)}
      </p>
    </article>
  );
}
