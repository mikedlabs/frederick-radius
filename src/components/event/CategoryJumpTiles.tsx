import Link from "next/link";
import { CATEGORY_BY_SLUG } from "@/data/categories";
import type { EventWithMeta } from "@/lib/loaders/events";

/**
 * Visual entry-point grid above the chip rail — four tactile tiles
 * for the top categories by upcoming-event count. Each tile reads as
 * a category-tinted wash with a count, so the page meets the user
 * with options that look like things, not pills.
 *
 * Links open /category/<slug> rather than filtering /events itself —
 * the category surface is where the deeper browse lives, and the
 * existing chip rail already handles one-tap "Live music" filtering
 * inside this page. The tiles complement, they don't compete.
 */

// "Free" is a hot user intent but isn't a real category slug — we
// surface it here too, mapping to the existing FreeOnly chip behavior
// via a deeplink.
const HARDCODED: Array<{ key: string; label: string; color: string; href: string; match: (e: EventWithMeta) => boolean }> = [
  {
    key: "free",
    label: "Free",
    color: "#1E6B3A",
    href: "/events?free=1",
    match: (e) => e.is_free,
  },
];

export default function CategoryJumpTiles({ events }: { events: EventWithMeta[] }) {
  const counts = new Map<string, number>();
  for (const e of events) {
    if (!e.category) continue;
    counts.set(e.category, (counts.get(e.category) ?? 0) + 1);
  }

  const fromCats = [...counts.entries()]
    .map(([slug, n]) => {
      const c = CATEGORY_BY_SLUG[slug];
      return c
        ? {
            key: slug,
            label: c.name,
            color: c.color,
            href: `/category/${slug}`,
            count: n,
          }
        : null;
    })
    .filter((x): x is NonNullable<typeof x> => x !== null)
    .sort((a, b) => b.count - a.count);

  const freeCount = events.filter((e) => e.is_free).length;
  const tiles: Array<{
    key: string;
    label: string;
    color: string;
    href: string;
    count: number;
  }> = [];
  // Always prefer the categories with the most events first; cap to 3
  // to leave a slot for "Free" so the grid is always 4-up.
  for (const c of fromCats.slice(0, 3)) tiles.push(c);
  if (freeCount > 0 && !tiles.some((t) => t.key === "free")) {
    tiles.push({
      key: "free",
      label: "Free",
      color: HARDCODED[0].color,
      href: HARDCODED[0].href,
      count: freeCount,
    });
  }

  if (tiles.length === 0) return null;

  return (
    <section aria-label="Browse by type" className="grid grid-cols-2 gap-2 sm:grid-cols-4">
      {tiles.map((t) => (
        <Link
          key={t.key}
          href={t.href}
          className="tactile tactile-interactive relative overflow-hidden rounded-[var(--app-radius-md)] p-3"
          style={{
            background: `linear-gradient(150deg, color-mix(in srgb, ${t.color} 22%, var(--app-bg-elevated)), color-mix(in srgb, ${t.color} 8%, var(--app-bg-elevated)))`,
          }}
        >
          {/* Color bar on the left edge — the categorical through-line
              that the rest of the app uses on event + place cards. */}
          <span
            aria-hidden
            className="absolute inset-y-0 left-0 w-1"
            style={{ background: t.color }}
          />
          <div className="relative flex items-baseline justify-between gap-2">
            <span
              className="font-serif text-[15px] font-semibold leading-tight tracking-tight"
              style={{ color: "var(--app-ink)" }}
            >
              {t.label}
            </span>
            <span
              className="rounded-full px-1.5 py-0.5 text-[11px] font-semibold tabular-nums"
              style={{
                background: `color-mix(in srgb, ${t.color} 22%, transparent)`,
                color: t.color,
              }}
            >
              {t.count}
            </span>
          </div>
          <p
            className="relative mt-1 text-[10px] font-semibold uppercase tracking-[0.1em]"
            style={{ color: "var(--app-ink-3)" }}
          >
            {t.key === "free" ? "no cover" : "upcoming"}
          </p>
        </Link>
      ))}
    </section>
  );
}
