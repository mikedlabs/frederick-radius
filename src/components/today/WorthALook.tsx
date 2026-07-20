import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { CATEGORY_BY_SLUG } from "@/data/categories";
import { getWorthALookToday, easternDayKey } from "@/lib/worth-a-look";
import CategoryIcon from "@/components/place/CategoryIcon";
import SectionHeading from "@/components/ui/SectionHeading";

/**
 * WorthALook — the daily discovery pick list on /today.
 *
 * Real Frederick places chosen for the day; the lineup rotates daily so a
 * returning visitor sees something new. Demoted from a third horizontal swipe
 * rail to a calm vertical list (Jul 2026 lower-page rework): three swipe rails
 * in a row read as a carousel wall, so this one reads down the page as a field
 * guide instead, and the two remaining rails (DaypartNeeds, CuratedPicks) are
 * separated by content.
 *
 * Photo Policy (Phase 1): no imported place photos. Each row is typographic (a
 * category mark + name + type), so the list reads as a curated set of picks, not
 * a strip of scraped storefront shots. See docs/PHOTO_POLICY.md.
 */
export default async function WorthALook() {
  const picks = await getWorthALookToday(easternDayKey());
  if (picks.length === 0) return null;

  return (
    <section className="mt-6" aria-label="Worth a look today">
      <SectionHeading title="Worth a look today" />
      <ul className="mt-3 divide-y" style={{ borderColor: "var(--app-border)" }}>
        {picks.map((p) => {
          const cat = CATEGORY_BY_SLUG[p.category];
          const catColor = cat?.color ?? "var(--app-brand)";
          return (
            <li key={p.slug}>
              <Link
                href={`/places/${p.slug}`}
                className="tap-44 group flex items-center gap-3 py-2.5"
                aria-label={`${p.name}, ${cat?.name ?? p.category}`}
              >
                {/* Category mark — the typographic stand-in for a photo. */}
                <span
                  aria-hidden
                  className="grid h-10 w-10 shrink-0 place-items-center rounded-[var(--app-radius-sm)]"
                  style={{
                    background: `linear-gradient(145deg, color-mix(in srgb, ${catColor} 22%, var(--app-bg-elevated)), color-mix(in srgb, ${catColor} 7%, var(--app-bg-elevated)))`,
                    color: catColor,
                    boxShadow: "var(--app-edge)",
                  }}
                >
                  <CategoryIcon slug={p.category} strokeWidth={1.75} className="h-5 w-5 opacity-90" style={{ color: catColor }} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-serif text-[15px] font-semibold leading-tight tracking-tight" style={{ color: "var(--app-ink)" }}>
                    {p.name}
                  </span>
                  <span className="mt-0.5 block truncate text-[11px] font-medium uppercase tracking-[0.08em]" style={{ color: "var(--app-ink-3)" }}>
                    {cat?.name ?? p.category}
                  </span>
                </span>
                <ChevronRight
                  aria-hidden
                  className="h-4 w-4 shrink-0 opacity-45 transition-transform group-hover:translate-x-0.5"
                  strokeWidth={2.25}
                  style={{ color: "var(--app-ink-3)" }}
                />
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
