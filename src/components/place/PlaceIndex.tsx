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
          className="flex items-center justify-end gap-4 font-mono text-[12px]"
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
      {/* Sticky section header: mono label ···· count. The count lives at
          the leader's end — supporting detail, never the headline. */}
      <div
        className="sticky z-10 flex items-baseline gap-2.5 py-1.5"
        style={{ top: "var(--app-topbar-offset, 0px)", background: "var(--app-bg)" }}
      >
        <h2
          className="shrink-0 font-mono text-[10px] font-bold uppercase tracking-[0.1em]"
          style={{ color: "var(--app-ink-2)" }}
        >
          {section.label}
        </h2>
        <span
          aria-hidden
          className="mb-1 min-w-0 flex-1 self-end"
          style={{ borderBottom: "2px dotted color-mix(in srgb, var(--app-ink) 22%, transparent)" }}
        />
        <span
          className="shrink-0 font-mono text-[11px] tabular-nums"
          style={{ color: "var(--app-ink-3)" }}
        >
          {rows.length}
        </span>
      </div>

      {/* The plate: one elevated paper container; cells divide with
          hairlines instead of carrying their own chrome. */}
      <ul
        className="breathe-in overflow-hidden rounded-[var(--app-radius-md)]"
        style={{
          background: "var(--app-bg-elevated-solid)",
          border: "1px solid var(--app-border)",
          boxShadow: "var(--app-edge), var(--app-hi), var(--app-elev-1)",
        }}
      >
        {visible.map((row, i) => (
          <li
            key={row.slug}
            style={i > 0 ? { borderTop: "1px solid color-mix(in srgb, var(--app-ink) 7%, transparent)" } : undefined}
          >
            <PlaceCell
              row={row}
              eagerPhoto={row.slug === priorityPhotoSlug}
              lazyPhoto={lazyPhotos}
            />
          </li>
        ))}
        {hidden > 0 && (
          <li style={{ borderTop: "1px solid color-mix(in srgb, var(--app-ink) 7%, transparent)" }}>
            <button
              type="button"
              onClick={() => {
                haptic("light");
                setExpanded(true);
              }}
              className="flex min-h-[44px] w-full items-center justify-center gap-1.5 px-3.5 text-[13px] font-semibold transition-colors hover:bg-[var(--app-bg-sunken)] active:bg-[var(--app-bg-sunken)]"
              style={{ color: "var(--app-ink-2)" }}
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
    window.location.href = `/places/${row.slug}`;
  }

  const statusColor = row.status?.kind === "soon" ? "var(--app-warning)" : "var(--app-positive)";

  return (
    <button
      type="button"
      onClick={open}
      className="tactile-interactive flex w-full items-center gap-3 px-3.5 py-2.5 text-left"
      style={{ minHeight: 64 }}
      aria-label={`${row.name}. ${row.meta}${row.status ? `. ${row.status.label}` : ""}`}
    >
      {/* 44px anchor: photo with a pressed ring, else the category glyph
          on its tinted paper square. An anchor for recognition, not a hero. */}
      <CellVisual row={row} eagerPhoto={eagerPhoto} lazyPhoto={lazyPhoto} />

      <span className="min-w-0 flex-1">
        <span className="flex items-baseline gap-2">
          <span
            className="min-w-0 truncate font-serif text-[16px] font-semibold leading-tight tracking-tight"
            style={{ color: "var(--app-ink)" }}
          >
            {row.name}
          </span>
          {row.distance && (
            <span
              className="ml-auto shrink-0 font-mono text-[11.5px] tabular-nums"
              style={{ color: "var(--app-ink-3)" }}
            >
              {row.distance}
            </span>
          )}
        </span>
        <span className="mt-[1px] block truncate text-[12.5px] leading-snug" style={{ color: "var(--app-ink-3)" }}>
          {row.meta}
        </span>
        {(row.status || row.rating != null || row.mark) && (
          <span className="mt-[3px] flex items-center gap-2 overflow-hidden font-mono text-[11.5px] tabular-nums whitespace-nowrap">
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
                className="truncate text-[10px] font-bold uppercase tracking-[0.08em]"
                style={{ color: "var(--app-accent-press)" }}
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
          className="h-11 w-11 rounded-[9px] object-cover"
          style={{ boxShadow: "inset 0 0 0 1px color-mix(in srgb, var(--app-ink) 10%, transparent)" }}
          onLoad={(event) => {
            if (isPhotoFailureSignal(event.currentTarget)) setFailedSrc(src);
          }}
        />
      ) : (
        <span
          aria-hidden
          className="grid h-11 w-11 place-items-center rounded-[9px]"
          style={{
            background: `color-mix(in srgb, ${row.accent} 12%, var(--app-bg-elevated))`,
            color: `color-mix(in srgb, ${row.accent} 78%, var(--app-ink))`,
            boxShadow: "inset 0 0 0 1px color-mix(in srgb, var(--app-ink) 8%, transparent)",
          }}
        >
          <CategoryIcon slug={row.category} className="h-5 w-5" />
        </span>
      )}
    </div>
  );
}
