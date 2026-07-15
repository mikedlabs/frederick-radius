import Image from "next/image";
import Link from "next/link";
import { ArrowRight, Map, Newspaper, Ruler } from "lucide-react";
import { SANBORN_EDITIONS, getLocArchiveImageUrl } from "@/data/loc-archive";

/** A visual handoff from the editorial history page into primary sources. */
export default function ArchiveDoorway() {
  const plate = SANBORN_EDITIONS.find((record) => record.editionYear === 1911) ?? SANBORN_EDITIONS[0];
  const imageUrl = getLocArchiveImageUrl(plate, 960);

  return (
    <section
      aria-labelledby="archive-doorway-title"
      className="relative overflow-hidden rounded-[var(--app-radius-lg)] border"
      style={{ borderColor: "var(--app-border)", background: "var(--app-bg-elevated)", boxShadow: "var(--app-elev-2), var(--app-hi)" }}
    >
      <div className="grid sm:grid-cols-[0.92fr_1.08fr]">
        <div className="relative min-h-[230px] overflow-hidden sm:min-h-[300px]" style={{ background: "var(--app-bg-sunken)" }}>
          <Image
            src={imageUrl}
            alt={plate.image.alt}
            fill
            sizes="(max-width: 640px) 100vw, 45vw"
            className="object-cover object-top"
          />
          <div aria-hidden className="absolute inset-0 bg-gradient-to-t from-black/25 via-transparent to-transparent" />
          <p className="absolute bottom-2 left-2 rounded-full bg-black/65 px-2.5 py-1 font-mono text-[9px] text-white/90 backdrop-blur-sm">
            Frederick · {plate.editionYear} Sanborn atlas
          </p>
        </div>

        <div className="flex flex-col p-5 sm:p-6">
          <p className="eyebrow" style={{ color: "var(--app-brand-press)" }}>Archive Lens</p>
          <h2 id="archive-doorway-title" className="mt-2 font-serif text-[27px] font-semibold leading-[1.02] tracking-tight sm:text-[31px]" style={{ color: "var(--app-ink)" }}>
            Don&rsquo;t just read Frederick&rsquo;s history. Inspect it.
          </h2>
          <p className="mt-3 text-[13px] leading-relaxed" style={{ color: "var(--app-ink-2)" }}>
            Move through six fire-insurance atlases, open measured building surveys, read old Frederick newspaper pages, and follow documentary photographs back to their original records.
          </p>

          <ul className="mt-4 grid gap-2 text-[11.5px] font-semibold sm:grid-cols-3 sm:gap-1.5" style={{ color: "var(--app-ink-2)" }}>
            <li className="inline-flex items-center gap-1.5"><Map className="h-3.5 w-3.5" style={{ color: "var(--app-brand)" }} aria-hidden />1887–1922 maps</li>
            <li className="inline-flex items-center gap-1.5"><Ruler className="h-3.5 w-3.5" style={{ color: "var(--app-accent-press)" }} aria-hidden />HABS records</li>
            <li className="inline-flex items-center gap-1.5"><Newspaper className="h-3.5 w-3.5" style={{ color: "var(--app-cool)" }} aria-hidden />Frederick papers</li>
          </ul>

          <Link
            href="/archive"
            className="tactile-interactive mt-5 inline-flex min-h-11 items-center justify-center gap-2 self-start rounded-full px-4 text-[13px] font-bold"
            style={{ background: "var(--app-ink)", color: "var(--app-bg-elevated-solid)" }}
          >
            Enter Archive Lens
            <ArrowRight className="h-4 w-4" strokeWidth={2.25} aria-hidden />
          </Link>
          <p className="mt-auto pt-4 text-[9.5px] leading-relaxed" style={{ color: "var(--app-ink-3)" }}>
            Curated from Library of Congress records. Every object keeps its source, credit line, rights note, and review date.
          </p>
        </div>
      </div>
    </section>
  );
}
