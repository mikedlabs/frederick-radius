"use client";

/**
 * PlaceIndex — the field-guide index as a native list.
 *
 * The card system for list-answer pages (/open-now is the exemplar;
 * /live-music, /brunch, /deals adopt it next): sticky section headers and a
 * whole-cell tap, with each cell drawn as the same picture row PlaceCard
 * uses on every browse list (October 2026 row audit). A 48px tile leads, the
 * loaded photo or the category mark on the place's own color; then the name,
 * one support line, and a data line with closing time, rating and at most
 * one mark. Rows are flat and separated by a 1px rule, so the list scans as
 * names and pictures rather than a plate of boxes.
 *
 * With `pinMap`, one section leads with the numbered pin map Ask uses
 * (ResultsPinMap): its first screenful of rows become pins 1 to n, and each
 * of those rows prints the same number before its tile.
 *
 * Tap opens the global PlaceSheet (the map's no-navigation detail
 * layer), hydrating the slim row via /api/places/by-slugs; a failed
 * hydration falls through to the place page, so a tap is never dead.
 */
import { useState } from "react";
import Link from "next/link";
import { ArrowRight, Star } from "lucide-react";
import { usePlaceSheet } from "@/components/place/PlaceSheetProvider";
import { RATING_STAR_COLOR, usePlaceHue } from "@/components/place/PlaceCard";
import RadiusPhoto from "@/components/ui/RadiusPhoto";
import type { PlaceCardData } from "@/lib/loaders/places";
import { haptic } from "@/lib/haptics";
import { usePlacePhoto } from "@/components/place/usePlacePhoto";
import { track } from "@/lib/track";
import ResultsPinMap, {
  PinNumber,
  PinNumberGutter,
  mappedPinNumbers,
} from "@/components/map/ResultsPinMap";

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
  /** The Google review count behind `rating`, printed as "(1,728)" when the
   *  surface supplies it. */
  ratingCount?: number | null;
  /** The one moat mark this cell earned: "happy hour" | "deal" | "field notes". */
  mark: string | null;
  /** Preformatted distance ("6 min walk" / "1.2 mi") — only when honest. */
  distance: string | null;
  /** The place's catalog point. Only rows of a pinned section need it, so
   *  pages may leave it off everywhere else to keep the payload small. */
  lng?: number;
  lat?: number;
};

export type IndexSection = {
  key: string;
  label: string;
  rows: IndexRow[];
};

/**
 * The numbered pin map over one section. Its first screenful of rows, in the
 * current sort order, become pins 1 to n and print the same numbers.
 */
export type IndexPinMap = {
  sectionKey: string;
  /** What the pins are, for the map's accessible name. */
  name?: string;
  /** A quiet text link under the map into the full map surface. */
  fullMap?: { href: string; label: string };
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
  pinMap,
}: {
  sections: IndexSection[];
  showSort?: boolean;
  prioritizeFirstPhoto?: boolean;
  /** Lead one section with the numbered pin map Ask uses. One per page. */
  pinMap?: IndexPinMap;
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

  // The pinned rows are the section's first screenful in the current sort,
  // so the numbers recompute when the sort changes and never point at a row
  // hidden behind "Show more".
  const pinnedSection = pinMap
    ? populated.find((section) => section.key === pinMap.sectionKey)
    : undefined;
  const pinnedRows = pinnedSection
    ? sortRows(pinnedSection.rows, sort).slice(0, INITIAL_ROWS)
    : [];
  const pinNumbers = mappedPinNumbers(pinnedRows);
  // The map draws exactly when rows are numbered; the full-map link stays
  // even when it does not, because it is the page's one door to the map.
  const mapBlock = pinnedSection && (pinNumbers.size > 0 || pinMap?.fullMap) ? (
    <div data-index-pin-map={pinnedSection.key}>
      <ResultsPinMap rows={pinnedRows} name={pinMap?.name} />
      {pinMap?.fullMap && (
        <Link
          href={pinMap.fullMap.href}
          className="text-meta-lg mt-1 inline-flex min-h-11 items-center gap-1 font-semibold hover:underline"
          style={{ color: "var(--app-brand-press)" }}
        >
          {pinMap.fullMap.label}
          <ArrowRight aria-hidden className="h-3.5 w-3.5" />
        </Link>
      )}
    </div>
  ) : null;
  // A map over the first section leads the whole index, sort row included.
  const mapLeads = pinnedSection !== undefined && pinnedSection === populated[0];

  return (
    <div className="space-y-5">
      {mapLeads && mapBlock}
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

      {populated.map((section) => {
        const pinned = section === pinnedSection;
        const block = (
          <IndexSectionBlock
            key={section.key}
            section={section}
            sort={sort}
            priorityPhotoSlug={priorityPhotoSlug}
            lazyPhotos={lazyPhotos}
            pinNumbers={pinned ? pinNumbers : undefined}
          />
        );
        return pinned && !mapLeads ? (
          <div key={section.key} className="space-y-5">
            {mapBlock}
            {block}
          </div>
        ) : (
          block
        );
      })}
    </div>
  );
}

function IndexSectionBlock({
  section,
  sort,
  priorityPhotoSlug,
  lazyPhotos = false,
  pinNumbers,
}: {
  section: IndexSection;
  sort: SortKey;
  priorityPhotoSlug?: string;
  lazyPhotos?: boolean;
  /** Slug to pin number when this section leads under the pin map. */
  pinNumbers?: ReadonlyMap<string, number>;
}) {
  const [expanded, setExpanded] = useState(false);
  const rows = sortRows(section.rows, sort);
  const visible = expanded ? rows : rows.slice(0, INITIAL_ROWS);
  const hidden = rows.length - visible.length;
  // Once any row is numbered, every row keeps the number column so the
  // tiles stay in one line.
  const numbered = pinNumbers !== undefined && pinNumbers.size > 0;

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

      {/* Flat picture rows on the canvas, each closed by a 1px rule. */}
      <ul className="breathe-in">
        {visible.map((row) => (
          <li key={row.slug} style={{ borderBottom: "1px solid var(--app-border)" }}>
            <PlaceCell
              row={row}
              eagerPhoto={row.slug === priorityPhotoSlug}
              lazyPhoto={lazyPhotos}
              pinNumber={numbered ? (pinNumbers.get(row.slug) ?? null) : undefined}
            />
          </li>
        ))}
        {hidden > 0 && (
          <li>
            <button
              type="button"
              onClick={() => {
                haptic("light");
                setExpanded(true);
              }}
              className="text-meta-lg flex min-h-[44px] w-full items-center justify-center gap-1.5 px-3.5 font-semibold transition-colors hover:bg-[var(--app-bg-sunken)] active:bg-[var(--app-bg-sunken)]"
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
  pinNumber,
}: {
  row: IndexRow;
  eagerPhoto?: boolean;
  lazyPhoto?: boolean;
  /** The row's pin number. Null keeps the empty number column; undefined
   *  means the list is not numbered. */
  pinNumber?: number | null;
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
  // Marks arrive lower case from the page ("happy hour"); a row prints them
  // as sentence-case words in neutral ink. They are supporting facts, so
  // they take neither Plum nor the Brick of a pin or an action.
  const mark = row.mark ? row.mark.charAt(0).toUpperCase() + row.mark.slice(1) : null;

  return (
    <button
      type="button"
      onClick={open}
      data-place-row
      className="flex w-full items-center gap-3 py-2.5 pl-0.5 pr-1 text-left transition-colors hover:bg-[var(--app-bg-sunken)] active:bg-[var(--app-bg-sunken)]"
      style={{ minHeight: 68 }}
      aria-label={`${row.name}. ${row.meta}${row.status ? `. ${row.status.label}` : ""}`}
    >
      {pinNumber === null ? (
        <PinNumberGutter />
      ) : pinNumber !== undefined ? (
        <PinNumber n={pinNumber} />
      ) : null}
      <CellVisual row={row} eagerPhoto={eagerPhoto} lazyPhoto={lazyPhoto} />

      <span className="min-w-0 flex-1">
        <span className="flex items-baseline gap-2">
          <span className="text-title-sm min-w-0 truncate" style={{ color: "var(--app-ink)" }}>
            {row.name}
          </span>
          {row.distance && (
            <span
              className="text-meta-lg ml-auto shrink-0 tabular-nums"
              style={{ color: "var(--app-ink-3)" }}
            >
              {row.distance}
            </span>
          )}
        </span>
        <span className="text-meta-lg block truncate" style={{ color: "var(--app-ink-2)" }}>
          {row.meta}
        </span>
        {(row.status || row.rating != null || mark) && (
          <span className="text-meta-lg mt-0.5 flex items-center gap-2.5 overflow-hidden whitespace-nowrap tabular-nums">
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
              <span
                data-place-rating
                className="inline-flex shrink-0 items-center gap-1"
                style={{ color: "var(--app-ink-2)" }}
              >
                <Star aria-hidden className="h-3 w-3" fill={RATING_STAR_COLOR} strokeWidth={0} />
                <span className="font-semibold">{row.rating.toFixed(1)}</span>
                {row.ratingCount != null && row.ratingCount > 0 && (
                  <span style={{ color: "var(--app-ink-3)" }}>
                    ({row.ratingCount.toLocaleString("en-US")})
                  </span>
                )}
                <span className="text-caption" style={{ color: "var(--app-ink-3)" }} translate="no">
                  Google Maps
                </span>
              </span>
            )}
            {mark && (
              <span
                data-row-mark
                className="truncate font-semibold"
                style={{ color: "var(--app-ink-2)" }}
              >
                {mark}
              </span>
            )}
          </span>
        )}
      </span>
    </button>
  );
}

/**
 * The 48px cell anchor, painted by RadiusPhoto: the loaded photo, or the
 * category mark on the place's own color. Under lazyPhoto the URL arrives on
 * scroll through the shared batched loader, and the mark carries both the
 * "not known yet" and the honest "there is none" states, so nothing flashes
 * and a suppressed record never regains its wrong photo (the loader answers
 * through the full server loader's suppression gates). RadiusPhoto asks the
 * proxy for its failure signal, so a rotted photo never paints the proxy's
 * plate as if it were the place's picture.
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
  const hue = usePlaceHue(row.slug);
  return (
    <div ref={anchorRef} className="h-12 w-12 shrink-0">
      <RadiusPhoto
        src={photoUrl}
        size={48}
        category={row.category}
        hue={hue}
        color={row.accent}
        loading={eagerPhoto ? "eager" : "lazy"}
        fetchPriority={eagerPhoto ? "high" : "auto"}
        className="rounded-[var(--app-radius-md)]"
      />
    </div>
  );
}
