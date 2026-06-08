import Link from "next/link";
import { ChevronRight } from "lucide-react";
import type { TownStat } from "@/lib/guided/town-stats";

/**
 * The town picker — a grid of town cards that reads as "choose a starting
 * point", not a dropdown. Counts are real (gated places, honest this-week
 * events); a quiet town says "No events this week" rather than faking one.
 * Server component — pure links, no client JS.
 */
export default function TownPicker({ stats }: { stats: TownStat[] }) {
  return (
    <ul className="grid gap-3 sm:grid-cols-2">
      {stats.map((t) => (
        <li key={t.slug}>
          <Link
            href={`/m/${t.slug}`}
            className="tactile tactile-interactive group relative block overflow-hidden rounded-[var(--app-radius-lg)] border bg-[var(--app-bg-elevated)] p-4 transition"
            style={{
              borderColor: "var(--app-border)",
              boxShadow: "var(--app-elev-1), var(--app-edge), var(--app-hi)",
            }}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h3 className="font-serif text-[19px] leading-tight" style={{ color: "var(--app-ink)" }}>
                  {t.name}
                </h3>
                <p className="mt-1 text-[13px] leading-snug text-pretty" style={{ color: "var(--app-ink-2)" }}>
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

            <div className="mt-3 flex items-center gap-x-2 gap-y-1 text-[12px]" style={{ color: "var(--app-ink-3)" }}>
              <span>{t.placeCount} {t.placeCount === 1 ? "place" : "places"}</span>
              <span aria-hidden>·</span>
              <span>{t.eventCount > 0 ? `${t.eventCount} ${t.eventCount === 1 ? "event" : "events"} this week` : "No events this week"}</span>
            </div>

            {t.bestFor.length > 0 && (
              <div className="mt-2.5 flex flex-wrap gap-1.5">
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
