import Link from "next/link";
import { ChevronRight } from "lucide-react";
import SectionHeading from "@/components/ui/SectionHeading";
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
            <ul className="mt-1.5 flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none]">
              {row.picks.map((p) => (
                <li key={p.slug} className="shrink-0">
                  <Link
                    href={`/places/${p.slug}`}
                    prefetch={false}
                    className="flex min-h-11 w-[9.5rem] flex-col justify-center rounded-[var(--app-radius-md)] border px-3 py-2 transition hover:bg-[var(--app-bg-sunken)]"
                    style={{ borderColor: "var(--app-border)", background: "var(--app-bg-elevated)", boxShadow: "var(--app-edge), var(--app-hi)" }}
                  >
                    <span className="truncate text-[13px] font-semibold leading-tight" style={{ color: "var(--app-ink)" }}>{p.name}</span>
                    <span className="mt-0.5 flex items-center gap-1.5 font-mono text-[10px] tabular-nums" style={{ color: "var(--app-ink-3)" }}>
                      <span aria-hidden className="h-1.5 w-1.5 rounded-full" style={{ background: "var(--app-positive)" }} />
                      Open
                      {p.rating ? <span>· {p.rating.toFixed(1)}★</span> : null}
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
