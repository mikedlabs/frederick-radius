import type { LucideIcon } from "lucide-react";

export type GlanceTile = {
  /** Stable key, also written to `data-glance-tile` for tests. */
  id: string;
  icon: LucideIcon;
  /** Sentence case: "When", "Getting in", "Parking". */
  label: string;
  /** The answer, in title type. It wraps and is never truncated. */
  value: string;
  /** One supporting line: a closing time, a distance, a checked date. */
  support?: string | null;
};

/**
 * GlanceTiles answers a detail page's first questions in two or three tiles
 * under its title: when it is, how to get in, and, only when a source says
 * so, where to park. Each tile is at least 96px tall and holds an icon, a
 * sentence-case label, the value in title type, and one support line.
 *
 * Callers pass only tiles they can back with data, so two tiles is the
 * common case and an absent fact is an absent tile, never a placeholder.
 * With three tiles the first spans the row on phones, so a long date does
 * not squeeze into a third of a 320px screen.
 */
export default function GlanceTiles({
  tiles,
  ariaLabel = "At a glance",
  className = "",
}: {
  tiles: readonly GlanceTile[];
  ariaLabel?: string;
  className?: string;
}) {
  if (tiles.length === 0) return null;
  const three = tiles.length >= 3;
  return (
    <div role="group" aria-label={ariaLabel} data-glance-tiles={tiles.length} className={className}>
      <dl className={`grid grid-cols-2 gap-2 ${three ? "sm:grid-cols-3" : ""}`}>
        {tiles.map((tile, index) => {
          const Icon = tile.icon;
          return (
            <div
              key={tile.id}
              data-glance-tile={tile.id}
              className={`flex min-h-24 min-w-0 flex-col rounded-[var(--app-radius-md)] border p-3 ${
                three && index === 0 ? "col-span-2 sm:col-span-1" : ""
              }`}
              style={{ borderColor: "var(--app-border)" }}
            >
              <dt
                className="flex items-center gap-1.5 text-meta-lg"
                style={{ color: "var(--app-ink-3)" }}
              >
                <Icon
                  aria-hidden
                  className="h-4 w-4 shrink-0"
                  style={{ color: "var(--app-brand)" }}
                />
                {tile.label}
              </dt>
              <dd
                className="text-title mt-1.5 [overflow-wrap:anywhere]"
                style={{ color: "var(--app-ink)" }}
              >
                {tile.value}
              </dd>
              {tile.support ? (
                <dd
                  className="mt-auto pt-1.5 text-meta-lg"
                  style={{ color: "var(--app-ink-2)" }}
                >
                  {tile.support}
                </dd>
              ) : null}
            </div>
          );
        })}
      </dl>
    </div>
  );
}
