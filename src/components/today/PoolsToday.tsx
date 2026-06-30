import Link from "next/link";
import { Waves } from "lucide-react";
import { poolsStatus } from "@/lib/pools";

/**
 * PoolsToday — a seasonal "pools open now" card for the Today page.
 *
 * Resident-utility, summer-only: renders nothing out of season (the honest
 * empty state), and in season shows the City of Frederick outdoor pools with
 * an accurate open/closed line computed from the verified seasonal hours
 * (lib/pools.ts). Server component: `now` is the page's server clock, so the
 * status is right on first paint with no Date.now() in render.
 */
export default function PoolsToday({ now }: { now: Date }) {
  const { inSeason, anyOpen, pools } = poolsStatus(now);
  if (!inSeason) return null;

  // Open pools first, then the rest — the answer ("what can I swim at now")
  // leads.
  const ordered = [...pools].sort((a, b) => Number(b.openNow) - Number(a.openNow));

  return (
    <section className="mt-4 space-y-2.5" aria-labelledby="pools-today-heading">
      <div className="flex items-center gap-2">
        <span
          aria-hidden
          className="inline-flex h-6 w-6 items-center justify-center rounded-full"
          style={{ background: "color-mix(in srgb, var(--app-cool) 16%, var(--app-bg-elevated))", color: "var(--app-cool)" }}
        >
          <Waves className="h-3.5 w-3.5" strokeWidth={2.2} />
        </span>
        <h2
          id="pools-today-heading"
          className="font-serif text-[18px] font-semibold leading-none tracking-tight"
          style={{ color: "var(--app-ink)" }}
        >
          {anyOpen ? "Pools open now" : "Pools this season"}
        </h2>
      </div>

      <ul className="space-y-2">
        {ordered.map((p) => (
          <li key={p.slug}>
            <Link
              href={`/places/${p.slug}`}
              className="flex items-center gap-3 rounded-[var(--app-radius-md)] border p-3"
              style={{ borderColor: "var(--app-border)", background: "var(--app-bg-elevated)" }}
            >
              <span
                aria-hidden
                className="h-2.5 w-2.5 shrink-0 rounded-full"
                style={{ background: p.openNow ? "var(--app-positive, #1E6B3A)" : "var(--app-ink-3, #7A7975)" }}
              />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[14px] font-semibold" style={{ color: "var(--app-ink)" }}>
                  {p.name}
                </span>
                <span className="block text-[12px]" style={{ color: p.openNow ? "var(--app-positive, #1E6B3A)" : "var(--app-ink-3)" }}>
                  {p.line}
                </span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
      <p className="text-[11px]" style={{ color: "var(--app-ink-3)" }}>
        City of Frederick outdoor pools. Hours vary by season; call ahead on weather days.
      </p>
    </section>
  );
}
