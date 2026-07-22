import Link from "next/link";
import { ChevronRight } from "lucide-react";
import SectionHeading from "@/components/ui/SectionHeading";
import { poolsStatus } from "@/lib/pools";
import { loadOutdoorSafetyHold } from "@/lib/outdoor-safety-live";

/**
 * PoolsToday — a seasonal "pools open now" card for the Today page.
 *
 * Resident-utility, summer-only: renders nothing out of season (the honest
 * empty state), and in season shows the City of Frederick outdoor pools with
 * an accurate open/closed line computed from the verified seasonal hours
 * (lib/pools.ts). Server component: `now` is the page's server clock, so the
 * status is right on first paint with no Date.now() in render.
 */
export default async function PoolsToday({ now }: { now: Date }) {
  const { inSeason, anyOpen, pools } = poolsStatus(now);
  if (!inSeason) return null;

  // Posted hours do not make an outdoor pool safe during dangerous weather or
  // unhealthy measured air. Suppress this module instead of showing a
  // contradictory green "Open" claim under the safety readout.
  const hold = await loadOutdoorSafetyHold(undefined, { now });
  if (hold) return null;

  // Open pools first, then the rest — the answer ("what can I swim at now")
  // leads.
  const openPools = pools.filter((pool) => pool.openNow);

  return (
    <section className="mt-6 space-y-2.5" aria-label="Pools">
      <SectionHeading size="sm" title="Pools" accent="var(--app-cool)" />

      {anyOpen ? (
      <ul className="divide-y border-y" style={{ borderColor: "var(--app-border)" }}>
        {openPools.map((p) => (
          <li key={p.slug}>
            <Link
              href={`/places/${p.slug}`}
              className="tap-44 flex items-center gap-3 py-2.5"
            >
              <span
                aria-hidden
                className="h-2.5 w-2.5 shrink-0 rounded-full"
                style={{ background: p.openNow ? "var(--app-positive)" : "var(--app-ink-3)" }}
              />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[14px] font-semibold" style={{ color: "var(--app-ink)" }}>
                  {p.name}
                </span>
                <span className="block text-[12px]" style={{ color: p.openNow ? "var(--app-positive)" : "var(--app-ink-3)" }}>
                  {p.line}
                </span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
      ) : (
        <Link
          href="/nearby?c=pools"
          className="tap-44 flex items-center justify-between border-y py-2.5 text-[13px] font-semibold"
          style={{ borderColor: "var(--app-border)", color: "var(--app-ink-2)" }}
        >
          Closed right now · see seasonal hours
          <ChevronRight className="h-4 w-4" strokeWidth={2.25} aria-hidden />
        </Link>
      )}

      {anyOpen ? (
        <Link href="/nearby?c=pools" className="tap-44 inline-flex items-center gap-1 text-[13px] font-semibold" style={{ color: "var(--app-brand-press)" }}>
          All pools <ChevronRight className="h-4 w-4" strokeWidth={2.25} aria-hidden />
        </Link>
      ) : null}
    </section>
  );
}
