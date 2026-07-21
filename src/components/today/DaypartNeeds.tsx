import Link from "next/link";
import { ChevronRight } from "lucide-react";
import SectionHeading from "@/components/ui/SectionHeading";
import CategoryGraphic from "@/components/ui/CategoryGraphic";
import type { DaypartRow } from "@/lib/loaders/daypartPicks";

/**
 * "Right now, around here" — the daypart-appropriate PLACE needs on /today
 * (owner, 2026-07-20). Morning surfaces coffee + bakeries, midday lunch,
 * evening dinner + breweries + bars, each filled with the top OPEN-NOW places
 * of that category. Presentational: the page passes rows from
 * buildDaypartRows (a need with nothing open is already dropped there, and the
 * whole section hides when nothing across the daypart is open).
 *
 * Only places we can vouch are OPEN NOW appear (posted-hours check via the
 * same isOpenNow the /open-now surface uses), so this never sends someone to a
 * locked door.
 */
export default function DaypartNeeds({ rows }: { rows: DaypartRow[] }) {
  if (rows.length === 0) return null;

  return (
    <section aria-label="Right now, around here" className="mt-6">
      {/* Primary section register. The old serif-19 + mono "Open now" tag
          competed with the title and duplicated the per-card "Open" dot; the
          title carries the section and each card says "Open" honestly. */}
      <SectionHeading title="Right now, around here" />

      <div className="mt-3 space-y-3">
        {rows.map((row) => (
          <div key={row.category + row.label}>
            <div className="flex items-baseline justify-between gap-3 px-0.5">
              <h3 className="text-[13px] font-semibold" style={{ color: "var(--app-ink-2)" }}>{row.label}</h3>
              <Link href={row.href} className="tap-44-y inline-flex items-center gap-0.5 text-[11.5px] font-semibold" style={{ color: "var(--app-brand-press)" }}>
                See all
                <ChevronRight className="h-3.5 w-3.5" strokeWidth={2.25} aria-hidden />
              </Link>
            </div>
            {/* Poster tiles, not plain rows: each open place gets a
                category-tinted, seed-varied CategoryGraphic (the same poster
                system PlaceCard/PhotoMosaic use for no-photo places), with the
                name in the serif over a legibility scrim. Visual + alive at a
                glance, and still every card is a real OPEN-NOW place, not decor. */}
            <ul className="mt-2 flex gap-2.5 overflow-x-auto pb-1 [scrollbar-width:none]">
              {row.picks.map((p) => (
                <li key={p.slug} className="shrink-0">
                  <Link
                    href={`/places/${p.slug}`}
                    prefetch={false}
                    aria-label={`${p.name}, open now`}
                    className="relative flex h-[6.75rem] w-[10.5rem] flex-col justify-end overflow-hidden rounded-[var(--app-radius-md)] transition active:scale-[0.985]"
                    style={{ boxShadow: "var(--app-edge), var(--app-hi)" }}
                  >
                    <CategoryGraphic category={row.category} seed={p.slug} />
                    {/* Bottom scrim so the serif name stays legible over any
                        category hue (family/amber runs light). */}
                    <span
                      aria-hidden
                      className="pointer-events-none absolute inset-x-0 bottom-0 h-2/3"
                      style={{
                        background:
                          "linear-gradient(to top, color-mix(in srgb, var(--app-ink) 84%, transparent), color-mix(in srgb, var(--app-ink) 36%, transparent) 46%, transparent)",
                      }}
                    />
                    <span className="relative z-10 min-w-0 px-2.5 pb-2">
                      <span className="block truncate font-serif text-[14.5px] font-semibold leading-tight" style={{ color: "var(--app-on-brand)" }}>
                        {p.name}
                      </span>
                      <span className="mt-0.5 flex items-center gap-1.5 font-mono text-[10px] tabular-nums" style={{ color: "color-mix(in srgb, var(--app-on-brand) 86%, transparent)" }}>
                        <span aria-hidden className="h-1.5 w-1.5 rounded-full" style={{ background: "var(--app-positive)" }} />
                        Open
                        {p.rating ? <span>· {p.rating.toFixed(1)}★</span> : null}
                      </span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </section>
  );
}
