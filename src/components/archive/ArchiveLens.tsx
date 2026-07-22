"use client";

import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  ExternalLink,
  FileText,
  Focus,
  Layers3,
  Map,
  MapPinned,
  Maximize2,
  ScanSearch,
  ShieldCheck,
} from "lucide-react";
import { CITY_AERIAL_IMAGERY_LICENSE_CONFIRMED } from "@/lib/feature-access";

export type ArchiveCoordinates = {
  lat: number;
  lng: number;
  precision: "item" | "address" | "city-center";
};

export type ArchiveViewRecord = {
  id: string;
  kind: string;
  title: string;
  summary: string;
  dateLabel: string;
  year?: number;
  itemUrl: string;
  sourceUrl: string;
  image: {
    url: string;
    width?: number;
    height?: number;
    alt: string;
  };
  attribution: string;
  creditLine: string;
  rights: {
    status: string;
    advisory: string;
  };
  reviewedAt: string;
  address?: string;
  coordinates?: ArchiveCoordinates;
  editionYear?: number;
  sheetCount?: number;
  manifestUrl?: string;
  surveyNumber?: string;
  documentationStats?: Array<{ label: string; value: number }>;
  publication?: string;
  issueDate?: string;
  pageNumber?: number;
  ocrUrl?: string;
  featureTitle?: string;
  excerpt?: string;
  ocrReview?: "human-checked" | "metadata-only";
  photographer?: string;
  createdDate?: string;
};

type ArchiveLensProps = {
  maps: ArchiveViewRecord[];
  buildings: ArchiveViewRecord[];
  papers: ArchiveViewRecord[];
  photos: ArchiveViewRecord[];
};

function humanize(value: string) {
  return value
    .replaceAll("-", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function aerialHref(record: ArchiveViewRecord) {
  const coordinates = record.coordinates;
  if (!coordinates) return "/from-above/time-machine";

  const params = new URLSearchParams({
    lng: coordinates.lng.toString(),
    lat: coordinates.lat.toString(),
    year: "1958",
    zoom: coordinates.precision === "city-center" ? "14.2" : "16.5",
  });
  return `/from-above/time-machine?${params.toString()}`;
}

function SectionIntro({
  id,
  number,
  eyebrow,
  title,
  description,
}: {
  id: string;
  number: string;
  eyebrow: string;
  title: string;
  description: string;
}) {
  return (
    <div className="grid gap-3 sm:grid-cols-[52px_1fr] sm:gap-5">
      <span
        className="font-serif text-[28px] font-semibold tabular-nums"
        style={{ color: "var(--app-brand)" }}
        aria-hidden
      >
        {number}
      </span>
      <div className="space-y-1.5">
        <p className="eyebrow" style={{ color: "var(--app-ink-3)" }}>
          {eyebrow}
        </p>
        <h2 id={id} className="font-serif text-[27px] font-semibold leading-tight tracking-tight sm:text-[32px]">
          {title}
        </h2>
        <p
          className="max-w-[44rem] text-[14px] leading-relaxed sm:text-[15px]"
          style={{ color: "var(--app-ink-2)" }}
        >
          {description}
        </p>
      </div>
    </div>
  );
}

function RecordImage({
  record,
  priority = false,
  className = "object-contain",
}: {
  record: ArchiveViewRecord;
  priority?: boolean;
  className?: string;
}) {
  return (
    <Image
      src={record.image.url}
      alt={record.image.alt}
      fill
      priority={priority}
      unoptimized
      sizes="(max-width: 768px) 100vw, 760px"
      className={className}
    />
  );
}

function SourceDetails({ record }: { record: ArchiveViewRecord }) {
  const distinctSource = record.sourceUrl !== record.itemUrl;

  return (
    <details
      className="group border-t pt-2"
      style={{ borderColor: "var(--app-border)" }}
    >
      <summary className="tap-44-y flex cursor-pointer list-none items-center justify-between gap-3 py-1 text-[12px] font-semibold [&::-webkit-details-marker]:hidden">
        <span className="inline-flex items-center gap-2">
          <ShieldCheck className="h-4 w-4" aria-hidden />
          Source &amp; rights
        </span>
        <span
          className="text-[11px] font-medium group-open:hidden"
          style={{ color: "var(--app-ink-3)" }}
        >
          {humanize(record.rights.status)}
        </span>
        <span className="hidden text-[11px] font-medium group-open:inline">Close</span>
      </summary>

      <div
        className="mt-2 space-y-3 rounded-[var(--app-radius-sm)] p-3 text-[12px] leading-relaxed"
        style={{ background: "var(--app-bg-sunken)", color: "var(--app-ink-2)" }}
      >
        <dl className="grid gap-2 sm:grid-cols-[7rem_1fr]">
          <dt className="font-semibold" style={{ color: "var(--app-ink)" }}>
            Credit
          </dt>
          <dd>{record.attribution || record.creditLine}</dd>
          <dt className="font-semibold" style={{ color: "var(--app-ink)" }}>
            Rights note
          </dt>
          <dd>{record.rights.advisory}</dd>
          <dt className="font-semibold" style={{ color: "var(--app-ink)" }}>
            Radius review
          </dt>
          <dd>{record.reviewedAt}</dd>
        </dl>

        <div className="flex flex-wrap gap-x-4 gap-y-2">
          <a
            href={record.itemUrl}
            target="_blank"
            rel="noreferrer"
            className="tap-44-y inline-flex items-center gap-1.5 font-semibold underline decoration-1 underline-offset-4"
            style={{ color: "var(--app-cool)" }}
          >
            LOC item record
            <ArrowUpRight className="h-3.5 w-3.5" aria-hidden />
          </a>
          {distinctSource ? (
            <a
              href={record.sourceUrl}
              target="_blank"
              rel="noreferrer"
              className="tap-44-y inline-flex items-center gap-1.5 font-semibold underline decoration-1 underline-offset-4"
              style={{ color: "var(--app-cool)" }}
            >
              Original media
              <ArrowUpRight className="h-3.5 w-3.5" aria-hidden />
            </a>
          ) : null}
        </div>
      </div>
    </details>
  );
}

function MapRoom({ maps }: { maps: ArchiveViewRecord[] }) {
  const [activeIndex, setActiveIndex] = useState(0);
  const [inspect, setInspect] = useState(false);
  const active = maps[Math.min(activeIndex, Math.max(maps.length - 1, 0))];

  if (!active) return null;

  const activeYear = active.editionYear ?? active.year ?? active.dateLabel;
  const isSanborn = active.kind === "sanborn";
  const sourceWidth = active.image.width ?? 1800;
  const sourceHeight = active.image.height ?? 1400;
  const inspectWidth = Math.max(1400, Math.min(sourceWidth, 2200));
  const inspectHeight = Math.round(inspectWidth * (sourceHeight / sourceWidth));

  return (
    <section id="map-room" className="scroll-mt-24 space-y-4" aria-labelledby="map-room-heading">
      <SectionIntro
        id="map-room-heading"
        number="01"
        eyebrow="The map room"
        title="Choose a Frederick map"
        description="Start with the county-wide 1858 landowner map, then move through six surviving Sanborn editions. Inspect the original scans as evidence of the place at the time they were drawn."
      />

      <div
        className="tactile tactile-e2 overflow-hidden rounded-[var(--app-radius-lg)] border"
        style={{ borderColor: "var(--app-border)", background: "var(--app-bg-elevated)" }}
      >
        <div className="grid border-b lg:grid-cols-[15rem_1fr]" style={{ borderColor: "var(--app-border)" }}>
          <div
            className="space-y-4 border-b p-4 lg:border-b-0 lg:border-r lg:p-5"
            style={{ borderColor: "var(--app-border)" }}
          >
            <div aria-live="polite">
              <p className="eyebrow" style={{ color: "var(--app-ink-3)" }}>
                {isSanborn ? "Frederick atlas" : "Frederick County map"}
              </p>
              <p
                className="mt-1 font-serif text-[40px] font-semibold leading-none tabular-nums"
                style={{ color: "var(--app-brand)" }}
              >
                {activeYear}
              </p>
              <p className="mt-2 text-[12px] leading-relaxed" style={{ color: "var(--app-ink-2)" }}>
                {active.sheetCount
                  ? `${active.sheetCount} map sheets in this edition.`
                  : "A county-wide landowner map with roads, districts, tables, and 25 town or city insets."}
              </p>
            </div>

            <div>
              <label htmlFor="archive-map-year" className="text-[11px] font-semibold">
                Map date
              </label>
              <input
                id="archive-map-year"
                type="range"
                min={0}
                max={Math.max(maps.length - 1, 0)}
                step={1}
                value={activeIndex}
                onChange={(event) => {
                  setActiveIndex(Number(event.target.value));
                  setInspect(false);
                }}
                aria-valuetext={`${activeYear} Frederick map`}
                className="h-11 w-full cursor-pointer accent-[var(--app-brand)]"
              />
              <div className="flex justify-between text-[10px] font-semibold tabular-nums" style={{ color: "var(--app-ink-3)" }}>
                <span>{maps[0]?.editionYear ?? maps[0]?.year}</span>
                <span>{maps.at(-1)?.editionYear ?? maps.at(-1)?.year}</span>
              </div>
            </div>

            <div className="flex flex-wrap gap-1.5" aria-label="Choose a map edition">
              {maps.map((record, index) => {
                const year = record.editionYear ?? record.year ?? record.dateLabel;
                const selected = index === activeIndex;
                return (
                  <button
                    key={record.id}
                    type="button"
                    onClick={() => {
                      setActiveIndex(index);
                      setInspect(false);
                    }}
                    aria-pressed={selected}
                    className="tap-44-y rounded-full border px-2.5 py-1.5 text-[11px] font-semibold tabular-nums"
                    style={
                      selected
                        ? { borderColor: "var(--app-ink)", background: "var(--app-ink)", color: "var(--app-on-brand)" }
                        : { borderColor: "var(--app-control-border)", background: "var(--app-bg-elevated-solid)", color: "var(--app-ink)" }
                    }
                  >
                    {year}
                  </button>
                );
              })}
            </div>

            <div
              className="rounded-[var(--app-radius-sm)] border p-3 text-[11px] leading-relaxed"
              style={{ borderColor: "var(--app-border)", background: "var(--app-cool-tint-6)", color: "var(--app-ink-2)" }}
            >
              <p className="inline-flex items-center gap-1.5 font-semibold" style={{ color: "var(--app-cool)" }}>
                <Layers3 className="h-3.5 w-3.5" aria-hidden />
                Original sheet scan
              </p>
              <p className="mt-1">
                Not georeferenced or aligned over today&rsquo;s streets. Use it as historical evidence, not present-day navigation.
              </p>
            </div>
          </div>

          <div className="min-w-0 p-3 sm:p-4">
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <p className="text-[12px] font-semibold">{active.title}</p>
              <button
                type="button"
                onClick={() => setInspect((current) => !current)}
                aria-pressed={inspect}
                className="tap-44-y inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[11px] font-semibold"
                style={{ borderColor: "var(--app-control-border)", background: inspect ? "var(--app-ink)" : "var(--app-bg-elevated-solid)", color: inspect ? "var(--app-on-brand)" : "var(--app-ink)" }}
              >
                {inspect ? <Focus className="h-3.5 w-3.5" aria-hidden /> : <Maximize2 className="h-3.5 w-3.5" aria-hidden />}
                {inspect ? "Fit sheet" : "Inspect detail"}
              </button>
            </div>

            <div
              className={
                inspect
                  ? "h-[62dvh] max-h-[46rem] min-h-[24rem] overflow-auto overscroll-contain rounded-[var(--app-radius-md)] border"
                  : "relative aspect-[4/3] overflow-hidden rounded-[var(--app-radius-md)] border"
              }
              style={{ borderColor: "var(--app-border)", background: "var(--app-bg-sunken, #d8cfbd)" }}
              tabIndex={inspect ? 0 : undefined}
              aria-label={inspect ? "High-resolution map detail. Scroll horizontally and vertically to inspect the sheet." : undefined}
            >
              {inspect ? (
                <div
                  className="relative"
                  style={{ width: `${inspectWidth}px`, height: `${inspectHeight}px` }}
                >
                  <RecordImage record={active} priority />
                </div>
              ) : (
                <RecordImage record={active} priority />
              )}
            </div>
            <p className="mt-2 text-[10px] leading-relaxed" style={{ color: "var(--app-ink-3)" }}>
              {inspect ? "Drag or scroll to examine the scan. " : ""}
              {active.creditLine}
            </p>
          </div>
        </div>

        <div className="space-y-3 p-4 sm:p-5">
          <p className="max-w-[58rem] text-[14px] leading-relaxed" style={{ color: "var(--app-ink-2)" }}>
            {active.summary}
          </p>
          <div className="flex flex-wrap gap-2">
            <a
              href={active.itemUrl}
              target="_blank"
              rel="noreferrer"
              className="tap-44-y inline-flex items-center gap-2 rounded-full px-3.5 py-2 text-[12px] font-semibold"
              style={{ background: "var(--app-brand)", color: "var(--app-on-brand)" }}
            >
                Open the full {isSanborn ? "atlas" : "map"} at LOC
              <ExternalLink className="h-3.5 w-3.5" aria-hidden />
            </a>
            {active.manifestUrl ? (
              <a
                href={active.manifestUrl}
                target="_blank"
                rel="noreferrer"
                className="tap-44-y inline-flex items-center gap-2 rounded-full border px-3.5 py-2 text-[12px] font-semibold"
                style={{ borderColor: "var(--app-control-border)", color: "var(--app-ink)" }}
              >
                IIIF manifest
                <ArrowUpRight className="h-3.5 w-3.5" aria-hidden />
              </a>
            ) : null}
          </div>
          <SourceDetails record={active} />
        </div>
      </div>
    </section>
  );
}

function BuildingRecords({ records }: { records: ArchiveViewRecord[] }) {
  const [activeIndex, setActiveIndex] = useState(0);
  const active = records[Math.min(activeIndex, Math.max(records.length - 1, 0))];

  if (!active) return null;

  return (
    <section id="building-records" className="scroll-mt-24 space-y-4" aria-labelledby="building-records-heading">
      <SectionIntro
        id="building-records-heading"
        number="02"
        eyebrow="Documented downtown"
        title="The buildings left a paper trail"
        description="Historic American Buildings Survey records preserve photographs, measured drawings, and written histories. Pick a stop; Radius keeps the original survey one tap away."
      />

      <div
        className="tactile tactile-e2 overflow-hidden rounded-[var(--app-radius-lg)] border"
        style={{ borderColor: "var(--app-border)", background: "var(--app-bg-elevated)" }}
      >
        <div className="border-b p-3 sm:p-4" style={{ borderColor: "var(--app-border)" }}>
          <div className="flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" aria-label="Choose a documented building">
            {records.map((record, index) => {
              const selected = index === activeIndex;
              return (
                <button
                  key={record.id}
                  type="button"
                  onClick={() => setActiveIndex(index)}
                  aria-pressed={selected}
                  className="min-h-11 min-w-[11rem] shrink-0 rounded-[var(--app-radius-md)] border px-3 py-2 text-left"
                  style={
                    selected
                      ? { borderColor: "var(--app-brand)", background: "var(--app-brand-tint-14)", color: "var(--app-ink)" }
                      : { borderColor: "var(--app-border)", background: "var(--app-bg-elevated-solid)", color: "var(--app-ink-2)" }
                  }
                >
                  <span className="block text-[10px] font-bold tabular-nums" style={{ color: selected ? "var(--app-brand-press)" : "var(--app-ink-3)" }}>
                    STOP {String(index + 1).padStart(2, "0")}
                  </span>
                  <span className="mt-0.5 block text-[12px] font-semibold leading-snug">
                    {record.address ?? record.title}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        <article className="grid lg:grid-cols-[minmax(0,1.15fr)_minmax(18rem,0.85fr)]" aria-live="polite">
          <div className="relative min-h-[20rem] border-b lg:min-h-[32rem] lg:border-b-0 lg:border-r" style={{ borderColor: "var(--app-border)", background: "var(--app-bg-sunken)" }}>
            <RecordImage record={active} className="object-cover" />
            <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/75 via-black/25 to-transparent p-4 pt-16 text-white">
              <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-white/75">Historic American Buildings Survey</p>
              <p className="mt-1 text-[11px] leading-relaxed text-white/85">{active.creditLine}</p>
            </div>
          </div>

          <div className="space-y-4 p-4 sm:p-5 lg:p-6">
            <div>
              <p className="eyebrow" style={{ color: "var(--app-brand-press)" }}>
                {active.surveyNumber ? `Survey ${active.surveyNumber}` : "HABS record"}
              </p>
              <h3 className="mt-1.5 font-serif text-[25px] font-semibold leading-tight tracking-tight">
                {active.title}
              </h3>
              {active.address ? (
                <p className="mt-1 inline-flex items-center gap-1.5 text-[12px]" style={{ color: "var(--app-ink-3)" }}>
                  <MapPinned className="h-3.5 w-3.5" aria-hidden />
                  {active.address}
                </p>
              ) : null}
            </div>

            <p className="text-[14px] leading-relaxed" style={{ color: "var(--app-ink-2)" }}>
              {active.summary}
            </p>

            {active.documentationStats?.length ? (
              <dl className="grid grid-cols-3 divide-x rounded-[var(--app-radius-md)] border py-3" style={{ borderColor: "var(--app-border)" }}>
                {active.documentationStats.map((stat) => (
                  <div key={stat.label} className="px-2 text-center">
                    <dd className="font-serif text-[22px] font-semibold tabular-nums">{stat.value}</dd>
                    <dt className="mt-0.5 text-[9px] font-bold uppercase tracking-[0.08em]" style={{ color: "var(--app-ink-3)" }}>
                      {stat.label}
                    </dt>
                  </div>
                ))}
              </dl>
            ) : null}

            {active.coordinates && CITY_AERIAL_IMAGERY_LICENSE_CONFIRMED ? (
              <Link
                href={aerialHref(active)}
                className="tactile tactile-interactive tap-44-y flex items-center justify-between gap-3 rounded-[var(--app-radius-md)] border p-3"
                style={{ borderColor: "var(--app-border)", background: "var(--app-cool-tint-6)", color: "var(--app-ink)" }}
              >
                <span className="flex items-center gap-2.5">
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full" style={{ background: "var(--app-cool-tint-14)", color: "var(--app-cool)" }}>
                    <Map className="h-4 w-4" aria-hidden />
                  </span>
                  <span>
                    <span className="block text-[12px] font-semibold">See this block from above</span>
                    <span className="mt-0.5 block text-[10px] leading-snug" style={{ color: "var(--app-ink-3)" }}>
                      Opens Radius at the archived coordinate · imagery begins in 1958
                    </span>
                  </span>
                </span>
                <ArrowRight className="h-4 w-4 shrink-0" aria-hidden />
              </Link>
            ) : null}

            <a
              href={active.itemUrl}
              target="_blank"
              rel="noreferrer"
              className="tap-44-y inline-flex items-center gap-2 rounded-full px-3.5 py-2 text-[12px] font-semibold"
              style={{ background: "var(--app-brand)", color: "var(--app-on-brand)" }}
            >
              Open the full survey
              <ExternalLink className="h-3.5 w-3.5" aria-hidden />
            </a>

            <SourceDetails record={active} />
          </div>
        </article>
      </div>
    </section>
  );
}

function PapersPanel({ records }: { records: ArchiveViewRecord[] }) {
  const [activeIndex, setActiveIndex] = useState(0);
  const active = records[Math.min(activeIndex, Math.max(records.length - 1, 0))];

  if (!active) return null;

  const excerptIsChecked = active.ocrReview === "human-checked" && active.excerpt;

  return (
    <section id="papers" className="scroll-mt-24 space-y-4" aria-labelledby="papers-heading">
      <SectionIntro
        id="papers-heading"
        number="03"
        eyebrow="Frederick in the papers"
        title="Read the day, not a generated summary"
        description="Each feature points back to the scanned issue. OCR helps locate a story, but the original page remains the record."
      />

      <div
        className="tactile tactile-e2 overflow-hidden rounded-[var(--app-radius-lg)] border"
        style={{ borderColor: "var(--app-border)", background: "var(--app-bg-elevated)" }}
      >
        <div className="grid lg:grid-cols-[14rem_1fr]">
          <div className="border-b p-3 lg:border-b-0 lg:border-r lg:p-4" style={{ borderColor: "var(--app-border)" }}>
            <p className="mb-2 px-1 text-[10px] font-bold uppercase tracking-[0.1em]" style={{ color: "var(--app-ink-3)" }}>
              Choose an issue
            </p>
            <div className="flex gap-2 overflow-x-auto lg:block lg:space-y-2" aria-label="Choose a newspaper feature">
              {records.map((record, index) => {
                const selected = index === activeIndex;
                return (
                  <button
                    key={record.id}
                    type="button"
                    onClick={() => setActiveIndex(index)}
                    aria-pressed={selected}
                    className="min-h-11 min-w-[12rem] shrink-0 rounded-[var(--app-radius-md)] border px-3 py-2 text-left lg:w-full lg:min-w-0"
                    style={
                      selected
                        ? { borderColor: "var(--app-ink)", background: "var(--app-ink)", color: "var(--app-on-brand)" }
                        : { borderColor: "var(--app-border)", background: "var(--app-bg-elevated-solid)", color: "var(--app-ink)" }
                    }
                  >
                    <span className="block text-[10px] font-semibold tabular-nums" style={{ color: selected ? "rgba(255,255,255,.72)" : "var(--app-ink-3)" }}>
                      {record.issueDate ?? record.dateLabel}
                    </span>
                    <span className="mt-0.5 block text-[11px] font-semibold leading-snug">
                      {record.featureTitle ?? record.title}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          <article className="relative overflow-hidden p-4 sm:p-6 lg:p-8" aria-live="polite">
            <div
              className="pointer-events-none absolute inset-0 opacity-[0.06]"
              style={{ backgroundImage: "repeating-linear-gradient(0deg, var(--app-ink) 0, var(--app-ink) 1px, transparent 1px, transparent 5px)" }}
              aria-hidden
            />
            <div className="relative mx-auto max-w-[42rem] space-y-4">
              <header className="border-y py-3 text-center" style={{ borderColor: "var(--app-ink)" }}>
                <p className="font-serif text-[19px] font-semibold uppercase tracking-[0.08em]">
                  {active.publication ?? "Frederick newspaper"}
                </p>
                <div className="mt-1 flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-[10px] font-semibold uppercase tracking-[0.08em]" style={{ color: "var(--app-ink-3)" }}>
                  <span>{active.issueDate ?? active.dateLabel}</span>
                  {active.pageNumber ? <span>Page {active.pageNumber}</span> : null}
                  <span>Library of Congress scan</span>
                </div>
              </header>

              <div>
                <p className="eyebrow" style={{ color: "var(--app-brand-press)" }}>From the archive</p>
                <h3 className="mt-2 max-w-[36rem] font-serif text-[28px] font-semibold leading-[1.08] tracking-tight sm:text-[34px]">
                  {active.featureTitle ?? active.title}
                </h3>
                <p className="mt-3 text-[14px] leading-relaxed" style={{ color: "var(--app-ink-2)" }}>
                  {active.summary}
                </p>
              </div>

              {excerptIsChecked ? (
                <blockquote className="border-l-2 pl-4 font-serif text-[17px] leading-relaxed" style={{ borderColor: "var(--app-brand)", color: "var(--app-ink)" }}>
                  &ldquo;{active.excerpt}&rdquo;
                </blockquote>
              ) : (
                <div className="flex gap-2.5 rounded-[var(--app-radius-sm)] border p-3 text-[11px] leading-relaxed" style={{ borderColor: "var(--app-border)", background: "var(--app-accent-tint-6)", color: "var(--app-ink-2)" }}>
                  <ScanSearch className="mt-0.5 h-4 w-4 shrink-0" style={{ color: "var(--app-accent-press)" }} aria-hidden />
                  <p>
                    The searchable text for this page has not been presented as a quotation. Historical OCR can misread names, columns, and worn type; check the scan before relying on exact wording.
                  </p>
                </div>
              )}

              <div className="flex flex-wrap gap-2">
                <a
                  href={active.itemUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="tap-44-y inline-flex items-center gap-2 rounded-full px-3.5 py-2 text-[12px] font-semibold"
                  style={{ background: "var(--app-brand)", color: "var(--app-on-brand)" }}
                >
                  Read the original page
                  <ExternalLink className="h-3.5 w-3.5" aria-hidden />
                </a>
                {active.ocrUrl ? (
                  <a
                    href={active.ocrUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="tap-44-y inline-flex items-center gap-2 rounded-full border px-3.5 py-2 text-[12px] font-semibold"
                    style={{ borderColor: "var(--app-control-border)", color: "var(--app-ink)" }}
                  >
                    Searchable text
                    <FileText className="h-3.5 w-3.5" aria-hidden />
                  </a>
                ) : null}
              </div>

              <SourceDetails record={active} />
            </div>
          </article>
        </div>
      </div>
    </section>
  );
}

function DocumentaryFrame({ records }: { records: ArchiveViewRecord[] }) {
  const [activeIndex, setActiveIndex] = useState(0);
  const active = records[Math.min(activeIndex, Math.max(records.length - 1, 0))];

  if (!active) return null;

  const previous = () => setActiveIndex((index) => (index === 0 ? records.length - 1 : index - 1));
  const next = () => setActiveIndex((index) => (index + 1) % records.length);

  return (
    <section id="documentary-photos" className="scroll-mt-24 space-y-4" aria-labelledby="documentary-heading">
      <SectionIntro
        id="documentary-heading"
        number="04"
        eyebrow="A photographer&rsquo;s frame"
        title="Frederick as it was seen"
        description="Documentary photographs add faces, work, weather, and street-level detail to the maps. This is a small, reviewed sequence, not an endless archive dump."
      />

      <article
        className="tactile tactile-e2 overflow-hidden rounded-[var(--app-radius-lg)] border"
        style={{ borderColor: "var(--app-border)", background: "var(--app-ink)", color: "var(--app-on-brand)" }}
        aria-live="polite"
      >
        <div className="grid lg:grid-cols-[minmax(0,1.3fr)_minmax(18rem,0.7fr)]">
          <div className="relative min-h-[22rem] bg-black sm:min-h-[30rem] lg:min-h-[36rem]">
            <RecordImage record={active} className="object-contain" />
          </div>
          <div className="flex flex-col justify-between gap-6 p-5 sm:p-6 lg:p-8">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-white/60">
                {active.createdDate ?? active.dateLabel}
              </p>
              <h3 className="mt-2 font-serif text-[27px] font-semibold leading-tight tracking-tight">
                {active.title}
              </h3>
              <p className="mt-3 text-[14px] leading-relaxed text-white/78">{active.summary}</p>
              <p className="mt-4 text-[11px] leading-relaxed text-white/60">
                {active.photographer ? `Photograph by ${active.photographer}. ` : ""}
                {active.creditLine}
              </p>
            </div>

            <div className="space-y-4">
              {records.length > 1 ? (
                <div className="flex items-center justify-between gap-3">
                  <button
                    type="button"
                    onClick={previous}
                    className="grid h-11 w-11 place-items-center rounded-full border border-white/30 text-white"
                    aria-label="Previous documentary photograph"
                  >
                    <ArrowLeft className="h-4 w-4" aria-hidden />
                  </button>
                  <span className="text-[11px] font-semibold tabular-nums text-white/60">
                    {activeIndex + 1} / {records.length}
                  </span>
                  <button
                    type="button"
                    onClick={next}
                    className="grid h-11 w-11 place-items-center rounded-full border border-white/30 text-white"
                    aria-label="Next documentary photograph"
                  >
                    <ArrowRight className="h-4 w-4" aria-hidden />
                  </button>
                </div>
              ) : null}

              <a
                href={active.itemUrl}
                target="_blank"
                rel="noreferrer"
                className="tap-44-y inline-flex items-center gap-2 rounded-full bg-white px-3.5 py-2 text-[12px] font-semibold text-black"
              >
                View photograph record
                <ExternalLink className="h-3.5 w-3.5" aria-hidden />
              </a>

              <details className="group border-t border-white/20 pt-2">
                <summary className="tap-44-y flex cursor-pointer list-none items-center justify-between py-1 text-[12px] font-semibold [&::-webkit-details-marker]:hidden">
                  <span className="inline-flex items-center gap-2">
                    <ShieldCheck className="h-4 w-4" aria-hidden />
                    Source &amp; rights
                  </span>
                  <span className="text-[11px] font-medium text-white/55 group-open:hidden">{humanize(active.rights.status)}</span>
                  <span className="hidden text-[11px] font-medium text-white/55 group-open:inline">Close</span>
                </summary>
                <div className="mt-2 space-y-2 rounded-[var(--app-radius-sm)] bg-white/8 p-3 text-[11px] leading-relaxed text-white/70">
                  <p>{active.attribution || active.creditLine}</p>
                  <p>{active.rights.advisory}</p>
                  <p>Radius review: {active.reviewedAt}</p>
                </div>
              </details>
            </div>
          </div>
        </div>
      </article>
    </section>
  );
}

export default function ArchiveLens({ maps, buildings, papers, photos }: ArchiveLensProps) {
  return (
    <div className="space-y-12 sm:space-y-16">
      <MapRoom maps={maps} />
      <BuildingRecords records={buildings} />
      <PapersPanel records={papers} />
      <DocumentaryFrame records={photos} />

      <section
        id="provenance"
        aria-labelledby="provenance-title"
        className="scroll-mt-24 grid gap-4 rounded-[var(--app-radius-lg)] border p-5 sm:grid-cols-[auto_1fr] sm:p-6"
        style={{ borderColor: "var(--app-border)", background: "var(--app-bg-elevated)" }}
      >
        <div
          className="grid h-11 w-11 place-items-center rounded-full"
          style={{ background: "var(--app-cool-tint-14)", color: "var(--app-cool)" }}
        >
          <ShieldCheck className="h-5 w-5" aria-hidden />
        </div>
        <div>
          <p className="eyebrow" style={{ color: "var(--app-ink-3)" }}>Who does what</p>
          <h2 id="provenance-title" className="mt-1 font-sans text-[24px] font-semibold tracking-tight">
            The Library of Congress holds the archive. Radius connects it to the present.
          </h2>
          <p className="mt-2 max-w-[48rem] text-[13px] leading-relaxed" style={{ color: "var(--app-ink-2)" }}>
            The Library of Congress preserves and describes these source records. Frederick Radius selects a small local set, adds navigation and present-day context, and links back to the evidence. Frederick Radius is independent and is not affiliated with or endorsed by the Library of Congress.
          </p>
          <div className="mt-3 flex flex-wrap gap-x-4 gap-y-2 text-[12px] font-semibold">
            <a
              href="https://www.loc.gov/free-to-use/"
              target="_blank"
              rel="noreferrer"
              className="tap-44-y inline-flex items-center gap-1.5 underline decoration-1 underline-offset-4"
              style={{ color: "var(--app-cool)" }}
            >
              LOC free-to-use guidance
              <ArrowUpRight className="h-3.5 w-3.5" aria-hidden />
            </a>
            <a
              href="https://www.loc.gov/apis/"
              target="_blank"
              rel="noreferrer"
              className="tap-44-y inline-flex items-center gap-1.5 underline decoration-1 underline-offset-4"
              style={{ color: "var(--app-cool)" }}
            >
              Library of Congress APIs
              <ArrowUpRight className="h-3.5 w-3.5" aria-hidden />
            </a>
          </div>
        </div>
      </section>
    </div>
  );
}
