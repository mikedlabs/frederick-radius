"use client";

/**
 * PlaceIndex — the field-guide index as a native list.
 *
 * The card system for list-answer pages (/open-now is the exemplar;
 * /live-music, /brunch, /deals adopt it next). Judged design composite
 * (2026-07-10 panel): the "Field Index" chassis — ONE elevated paper
 * plate per section, hairline-divided 64px cells, sticky mono section
 * headers, whole-cell tap — carrying the "Almanac Plate" voice: serif
 * names as the interface, and a mono DATA LINE on every cell (closing
 * time, rating, moat mark) instead of chips. One plate per section
 * replaces a stack of per-card shadows; that single move is most of the
 * "real app" feel.
 *
 * Tap opens the global PlaceSheet (the map's no-navigation detail
 * layer), hydrating the slim row via /api/places/by-slugs; a failed
 * hydration falls through to the place page, so a tap is never dead.
 */
import { useState } from "react";
import Image from "next/image";
import { Star } from "lucide-react";
import CategoryIcon from "@/components/place/CategoryIcon";
import { usePlaceSheet } from "@/components/place/PlaceSheetProvider";
import type { PlaceCardData } from "@/lib/loaders/places";
import { haptic } from "@/lib/haptics";
import { proxyPhotoAtWidth } from "@/lib/format/img";
import { usePlacePhoto } from "@/components/place/usePlacePhoto";
import {
  daypartPhotoSrc,
  isPhotoFailureSignal,
} from "@/components/today/DaypartNeeds";
import { track } from "@/lib/track";

export type IndexRow = {
  slug: string;
  name: string;
  /** "Category · what it's known for" — one truncating support line. */
  meta: string;
  photo: string | null;
  /** Category slug for the glyph fallback + accent tint. */
  category: string;
  accent: string;
  /** null = say nothing (the unverified section carries its caveat once). */
  status: { kind: "open" | "soon"; label: string } | null;
  /** Minutes-of-day the doors close (2879 = open past midnight/24h), for
   *  the closing-soonest sort. Null when status is unknown. */
  closesMin: number | null;
  /** Shown only when the source count clears the honesty gate (>=20). */
  rating: number | null;
  /** The one moat mark this cell earned: "happy hour" | "deal" | "field notes". */
  mark: string | null;
  /** Preformatted distance ("6 min walk" / "1.2 mi") — only when honest. */
  distance: string | null;
};

export type IndexSection = {
  key: string;
  label: string;
  rows: IndexRow[];
};

type SortKey = "ranked" | "closing" | "az";

const SORTS: { key: SortKey; label: string }[] = [
  { key: "ranked", label: "Ranked" },
  { key: "closing", label: "Closing soonest" },
  { key: "az", label: "A to Z" },
];

const INITIAL_ROWS = 8;

function sortRows(rows: IndexRow[], sort: SortKey): IndexRow[] {
  if (sort === "ranked") return rows;
  const copy = [...rows];
  if (sort === "az") copy.sort((a, b) => a.name.localeCompare(b.name));
  else copy.sort((a, b) => (a.closesMin ?? 9999) - (b.closesMin ?? 9999));
  return copy;
}

export default function PlaceIndex({
  sections,
  showSort = true,
  prioritizeFirstPhoto = false,
  lazyPhotos = false,
}: {
  sections: IndexSection[];
  showSort?: boolean;
  prioritizeFirstPhoto?: boolean;
  /** Hydrate row photos on scroll instead of expecting them inline. Set by
   *  surfaces that deliberately withhold photo URLs from the RSC payload:
   *  each Google photo token is ~700B of incompressible base64, and the 800
   *  on /open-now were 88% of the compressed document while ~30 ever
   *  painted. Hydration batches through /api/places/by-slugs, so the
   *  photo-suppression verdicts keep applying. */
  lazyPhotos?: boolean;
}) {
  const [sort, setSort] = useState<SortKey>("ranked");
  const populated = sections.filter((s) => s.rows.length > 0);
  if (populated.length === 0) return null;
  const priorityPhotoSlug = prioritizeFirstPhoto
    ? populated.flatMap((section) => section.rows).find((row) => row.photo)?.slug
    : undefined;
  // Closing-soonest only makes sense when some cell knows its closing time.
  const canSortClosing = populated.some((s) => s.rows.some((r) => r.closesMin != null));

  return (
    <div className="space-y-5">
      {showSort && (
        <div
          className="flex items-center justify-end gap-4 text-[13px]"
          role="group"
          aria-label="Sort places"
        >
          {SORTS.filter((s) => s.key !== "closing" || canSortClosing).map((s) => (
            <button
              key={s.key}
              type="button"
              aria-pressed={sort === s.key}
              onClick={() => {
                haptic("light");
                setSort(s.key);
              }}
              className="tap-44"
              style={{
                color: sort === s.key ? "var(--app-ink)" : "var(--app-ink-3)",
                fontWeight: sort === s.key ? 700 : 500,
                textDecoration: sort === s.key ? "underline" : "none",
                textUnderlineOffset: 3,
              }}
            >
              {s.label}
            </button>
          ))}
        </div>
      )}

      {populated.map((section) => (
        <IndexSectionBlock
          key={section.key}
          section={section}
          sort={sort}
          priorityPhotoSlug={priorityPhotoSlug}
          lazyPhotos={lazyPhotos}
        />
      ))}
    </div>
  );
}

function IndexSectionBlock({
  section,
  sort,
  priorityPhotoSlug,
  lazyPhotos = false,
}: {
  section: IndexSection;
  sort: SortKey;
  priorityPhotoSlug?: string;
  lazyPhotos?: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const rows = sortRows(section.rows, sort);
  const visible = expanded ? rows : rows.slice(0, INITIAL_ROWS);
  const hidden = rows.length - visible.length;

  return (
    <section aria-label={section.label}>
      {/* Sticky section label with its count beside it. The count is
          supporting detail, never the headline. */}
      <div
        className="sticky z-10 flex items-baseline justify-between gap-3 py-2"
        style={{ top: "var(--app-topbar-offset, 0px)", background: "var(--app-bg)" }}
      >
        <h2
          className="min-w-0 text-[13px] font-semibold uppercase tracking-[0.08em]"
          style={{ color: "var(--app-ink-2)" }}
        >
          {section.label}
        </h2>
        <span
          className="shrink-0 text-[13px] tabular-nums"
          style={{ color: "var(--app-ink-3)" }}
        >
          {rows.length}
        </span>
      </div>

      {/* PLAIN TOOL: a ruled list on the page ground. One hairline above the
          first row and one after each row; no plate, fill or shadow. */}
      <ul className="border-t" style={{ borderColor: "var(--app-border)" }}>
        {visible.map((row) => (
          <li key={row.slug} className="border-b" style={{ borderColor: "var(--app-border)" }}>
            <PlaceCell
              row={row}
              eagerPhoto={row.slug === priorityPhotoSlug}
              lazyPhoto={lazyPhotos}
            />
          </li>
        ))}
        {hidden > 0 && (
          <li className="border-b" style={{ borderColor: "var(--app-border)" }}>
            <button
              type="button"
              onClick={() => {
                haptic("light");
                setExpanded(true);
              }}
              className="flex min-h-[44px] w-full items-center gap-1.5 text-[14px] font-semibold hover:underline"
              style={{ color: "var(--app-link)" }}
            >
              Show {hidden} more
            </button>
          </li>
        )}
      </ul>
    </section>
  );
}

function PlaceCell({
  row,
  eagerPhoto = false,
  lazyPhoto = false,
}: {
  row: IndexRow;
  eagerPhoto?: boolean;
  lazyPhoto?: boolean;
}) {
  const { openSheet } = usePlaceSheet();

  async function open() {
    haptic("light");
    try {
      const r = await fetch(`/api/places/by-slugs?slugs=${encodeURIComponent(row.slug)}`);
      const j = (await r.json()) as { places?: PlaceCardData[] };
      const p = j.places?.[0];
      if (p) {
        track("index_place_open", { category: row.category });
        openSheet(p);
        return;
      }
    } catch {
      /* fall through to navigation */
    }
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination
    window.location.href = `/places/${row.slug}`;
  }

  const statusColor = row.status?.kind === "soon" ? "var(--app-warning)" : "var(--app-positive)";

  return (
    <button
      type="button"
      onClick={open}
      className="flex w-full items-start gap-3 py-3 text-left"
      style={{ minHeight: 64 }}
      aria-label={`${row.name}. ${row.meta}${row.status ? `. ${row.status.label}` : ""}`}
    >
      {/* 44px media slot: the photo when one exists, else the bare category
          glyph beside the title's first line. An anchor for recognition,
          not a hero. */}
      <CellVisual row={row} eagerPhoto={eagerPhoto} lazyPhoto={lazyPhoto} />

      <span className="min-w-0 flex-1">
        <span className="flex items-baseline gap-2">
          <span
            className="min-w-0 truncate text-[17px] font-semibold leading-[1.3] tracking-tight"
            style={{ color: "var(--app-ink)" }}
          >
            {row.name}
          </span>
          {row.distance && (
            <span
              className="ml-auto shrink-0 text-[14px] tabular-nums"
              style={{ color: "var(--app-ink-2)" }}
            >
              {row.distance}
            </span>
          )}
        </span>
        <span className="mt-0.5 block truncate text-[14px] leading-snug" style={{ color: "var(--app-ink-2)" }}>
          {row.meta}
        </span>
        {(row.status || row.rating != null || row.mark) && (
          <span className="mt-1 flex items-center gap-2 overflow-hidden text-[13px] tabular-nums whitespace-nowrap">
            {row.status && (
              <span className="inline-flex shrink-0 items-center gap-1.5" style={{ color: "var(--app-ink-2)" }}>
                <span
                  aria-hidden
                  className="h-1.5 w-1.5 rounded-full"
                  style={{ background: statusColor }}
                />
                {row.status.label}
              </span>
            )}
            {row.rating != null && (
              <span className="inline-flex shrink-0 items-center gap-1" style={{ color: "var(--app-ink-2)" }}>
                <Star aria-hidden className="h-[11px] w-[11px]" style={{ color: "var(--app-accent)", fill: "var(--app-accent)" }} strokeWidth={0} />
                {row.rating.toFixed(1)}
              </span>
            )}
            {row.mark && (
              <span
                className="truncate text-[12px] font-semibold uppercase tracking-[0.06em]"
                style={{ color: "var(--app-accent-text)" }}
              >
                {row.mark}
              </span>
            )}
          </span>
        )}
      </span>
    </button>
  );
}

/**
 * The 44px cell anchor. With an inline URL it paints immediately, exactly as
 * before. Under lazyPhoto the URL arrives on scroll through the shared
 * batched loader, and the category glyph carries both the "not known yet"
 * and the honest "there is none" states, so nothing flashes and a suppressed
 * record never regains its wrong photo (the loader answers through the full
 * server loader's suppression gates).
 */
function CellVisual({
  row,
  eagerPhoto,
  lazyPhoto,
}: {
  row: IndexRow;
  eagerPhoto: boolean;
  lazyPhoto: boolean;
}) {
  const { photoUrl, anchorRef } = usePlacePhoto(row.slug, row.photo, lazyPhoto);
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  // fallback=signal: the proxy answers a dead photo with a 1x1 instead of
  // Google's grey "PHOTO NOT AVAILABLE" plate, and the onLoad check swaps to
  // the category glyph. Four components already did this; the canonical list
  // card was the missed adopter (craft audit, 2026-08-19), so a rotted photo
  // rendered a third party's error plate as if it were the place's picture.
  // "No photo > wrong photo" is this repo's own rule.
  const src = photoUrl ? daypartPhotoSrc(proxyPhotoAtWidth(photoUrl, 44)) : null;
  const showPhoto = Boolean(src && failedSrc !== src);
  return (
    <div ref={anchorRef} className="h-11 w-11 shrink-0">
      {src && showPhoto ? (
        <Image
          // The row paints a 44px square, so ask the proxy for 88px rather than
          // the 800px hero it defaults to. Non-proxy URLs pass through.
          src={src}
          alt=""
          unoptimized={src.startsWith("/api/place-photo")}
          width={88}
          height={88}
          sizes="44px"
          loading={eagerPhoto ? "eager" : "lazy"}
          fetchPriority={eagerPhoto ? "high" : "auto"}
          className="h-11 w-11 rounded-[var(--app-radius-md)] object-cover"
          onLoad={(event) => {
            if (isPhotoFailureSignal(event.currentTarget)) setFailedSrc(src);
          }}
        />
      ) : (
        // MEDIA IN ROWS: no tile, tint, border or corner. The glyph alone in
        // ink-3, aligned with the title's first line, inside the photo's slot.
        <span aria-hidden data-place-row-glyph className="block h-6 w-6">
          <CategoryIcon slug={row.category} className="h-6 w-6" strokeWidth={1.75} style={{ color: "var(--app-ink-3)" }} />
        </span>
      )}
    </div>
  );
}
