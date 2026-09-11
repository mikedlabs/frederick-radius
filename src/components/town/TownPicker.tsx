import Link from "next/link";
import { ChevronRight } from "lucide-react";
import type { TownStat } from "@/lib/guided/town-stats";
import { townEventWindowLabel } from "@/lib/guided/town-event-window";

/**
 * The town picker — a grid of town cards that reads as "choose a starting
 * point", not a dropdown. Counts are real (gated places plus source-backed
 * event listings in the next seven days) and state their period explicitly.
 * Server component — pure links, no client JS.
 */
export default function TownPicker({ stats }: { stats: TownStat[] }) {
  return (
    <ul className="grid grid-cols-2 gap-2.5">
      {stats.map((t) => (
        <li key={t.slug}>
          <Link
            href={`/m/${t.slug}`}
            className="tactile tactile-interactive group relative block h-full overflow-hidden rounded-[var(--app-radius-lg)] border bg-[var(--app-bg-elevated)] p-3.5 transition sm:p-4"
            style={{
              borderColor: "var(--app-border)",
              boxShadow: "var(--app-elev-1), var(--app-edge), var(--app-hi)",
            }}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h2 className="font-serif text-[18px] leading-tight sm:text-[19px]" style={{ color: "var(--app-ink)" }}>
                  {t.name}
                </h2>
                <p className="mt-1 line-clamp-2 text-[12px] leading-snug text-pretty sm:text-[13px]" style={{ color: "var(--app-ink-2)" }}>
                  {t.fact}
                </p>
              </div>
              <ChevronRight
                className="mt-0.5 h-4 w-4 shrink-0 transition-transform group-hover:translate-x-0.5"
                strokeWidth={2.25}
                style={{ color: "var(--app-ink-3)" }}
                aria-hidden
              />
            </div>

            <div className="mt-3 flex flex-col gap-0.5 text-[11px] sm:flex-row sm:items-center sm:gap-x-2 sm:text-[12px]" style={{ color: "var(--app-ink-3)" }}>
              <span>{t.placeCount} {t.placeCount === 1 ? "place" : "places"}</span>
              <span aria-hidden className="hidden sm:inline">·</span>
              <span>{townEventWindowLabel(t.eventCount)}</span>
            </div>

            {t.bestFor.length > 0 && (
              <div className="mt-2.5 hidden flex-wrap gap-1.5 sm:flex">
                {t.bestFor.map((tag) => (
                  <span
                    key={tag}
                    className="rounded-full px-2 py-0.5 text-[11px] font-medium"
                    style={{ background: "var(--app-ink-tint-6)", color: "var(--app-ink-2)" }}
                  >
                    {tag}
                  </span>
                ))}
              </div>
            )}
          </Link>
        </li>
      ))}
    </ul>
  );
}
