import Link from "next/link";
import { CATEGORY_BY_SLUG } from "@/data/categories";
import { getWorthALookToday, easternDayKey } from "@/lib/worth-a-look";
import CategoryIcon from "@/components/place/CategoryIcon";
import CollapsibleSection from "@/components/ui/CollapsibleSection";

/**
 * WorthALook — the daily discovery rail on /today.
 *
 * Six typographic tiles, edge-to-edge horizontal scroll, each a real
 * Frederick place chosen for the day; the lineup rotates daily so a
 * returning visitor sees something new.
 *
 * Photo Policy (Phase 1): this rail no longer renders imported place
 * photos. Each tile is a typographic card — a category mark + name +
 * type — so the rail reads as a curated set of picks, not a strip of
 * scraped storefront shots. (The old photo→hero view-transition morph
 * was dropped with the photos; navigation still works, just without the
 * image cross-fade.) See docs/PHOTO_POLICY.md.
 */
export default async function WorthALook() {
  const picks = await getWorthALookToday(easternDayKey());
  if (picks.length === 0) return null;

  return (
    // Open by default — the daily picks are a draw worth showing; the
    // collapse control stays so a reader can tuck it away.
    <CollapsibleSection
      title="Worth a look today"
      count={picks.length}
      countLabel="picks"
      storageKey="fr:worth-a-look-open:v1"
      defaultOpen
    >
      <div
        className="-mx-4 overflow-x-auto px-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        role="list"
      >
        <ol className="flex snap-x snap-mandatory gap-2.5" style={{ scrollPadding: "0 16px" }}>
          {picks.map((p) => {
            const cat = CATEGORY_BY_SLUG[p.category];
            const catColor = cat?.color ?? "var(--app-brand)";
            return (
              <li key={p.slug} role="listitem" className="snap-start">
                <Link
                  href={`/places/${p.slug}`}
                  className="tactile tactile-interactive group relative flex h-full w-[152px] flex-col gap-2 overflow-hidden rounded-[var(--app-radius-md)] border bg-[var(--app-bg-elevated)] p-3"
                  style={{ borderColor: "var(--app-border)", boxShadow: "var(--app-edge), var(--app-hi)" }}
                  aria-label={`${p.name} — ${cat?.name ?? p.category}`}
                >
                  {/* Category color band — thin top edge so the eye can
                      sort the rail by type without reading. */}
                  <div aria-hidden className="absolute inset-x-0 top-0 h-1" style={{ background: catColor }} />
                  {/* Category mark — the typographic stand-in for a photo. */}
                  <div
                    aria-hidden
                    className="mt-1 flex h-11 w-11 items-center justify-center rounded-[var(--app-radius-md)]"
                    style={{
                      background: `linear-gradient(145deg, color-mix(in srgb, ${catColor} 22%, var(--app-bg-elevated)), color-mix(in srgb, ${catColor} 7%, var(--app-bg-elevated)))`,
                      color: catColor,
                      boxShadow: "var(--app-edge), inset 0 1px 0 rgba(255,255,255,0.45)",
                    }}
                  >
                    <CategoryIcon slug={p.category} strokeWidth={1.75} className="h-5 w-5 opacity-90" style={{ color: catColor }} />
                  </div>
                  <div className="mt-auto">
                    <p className="font-serif text-[13px] font-semibold leading-tight" style={{ color: "var(--app-ink)", textWrap: "balance" } as React.CSSProperties}>
                      {p.name}
                    </p>
                    <p className="mt-0.5 truncate text-[11px] font-medium uppercase tracking-[0.08em]" style={{ color: "var(--app-ink-3)" }}>
                      {cat?.name ?? p.category}
                    </p>
                  </div>
                </Link>
              </li>
            );
          })}
        </ol>
      </div>
    </CollapsibleSection>
  );
}
