import type { Metadata } from "next";
import Link from "next/link";
import { clientPlaces } from "@/lib/loaders/places-client";
import { MUNICIPALITIES } from "@/data/municipalities";

/**
 * /admin/coverage — the state of the data itself.
 *
 * Owner ask (Jul 2026, "fix and improve everything"): the biggest misses
 * are foundation, not features. This instrument makes three of them
 * visible and trackable so they can't hide behind a polished front end:
 *
 *  1. Coverage equity — "city and county connected" is uneven; some towns
 *     are thin enough that a resident there opens a hollow app.
 *  2. Freshness integrity — a field guide's value is being right, but
 *     last_verified_at is a single batch stamp, not per-place verification,
 *     so the freshness signal users see is not actually a signal.
 *  3. Attribute substrate — the data that would make Ask and filters real
 *     (outdoor, dog-friendly, patio, accessible...) partly exists but is
 *     thin and unconsumed.
 *
 * Pure computation over the shipped client dataset — no DB, no network.
 */

export const metadata: Metadata = {
  title: "Coverage & freshness · Admin",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

const THIN_HOURS_PCT = 60;
const THIN_COUNT = 20;

// The attribute tags that would power Ask eligibility, filters, and "why
// this" — plus the ones a review specifically asked for that are missing.
const ATTR_PROBES: Array<{ label: string; match: (t: string) => boolean }> = [
  { label: "outdoor / patio", match: (t) => t.includes("outdoor") || t.includes("patio") },
  { label: "dog-friendly", match: (t) => t.includes("dog") },
  { label: "family / kids", match: (t) => t.includes("family") || t.includes("kid") },
  { label: "date-night", match: (t) => t.includes("date") },
  { label: "accessible / wheelchair", match: (t) => t.includes("access") || t.includes("wheelchair") },
  { label: "reservations", match: (t) => t.includes("reserv") },
  { label: "wifi", match: (t) => t.includes("wifi") },
  { label: "live-music", match: (t) => t.includes("live-music") || t.includes("music") },
];

export default function CoverageAdmin() {
  const places = clientPlaces();
  const total = places.length;

  // ── Coverage by municipality ──
  const nameBySlug = new Map(MUNICIPALITIES.map((m) => [m.slug, m.name]));
  const byTown = new Map<string, { n: number; hours: number }>();
  for (const p of places) {
    const key = p.municipality || "unknown";
    const row = byTown.get(key) ?? { n: 0, hours: 0 };
    row.n += 1;
    if (p.hours) row.hours += 1;
    byTown.set(key, row);
  }
  const coverage = [...byTown.entries()]
    .map(([slug, v]) => {
      const hoursPct = Math.round((100 * v.hours) / Math.max(1, v.n));
      const thin = v.n < THIN_COUNT || hoursPct < THIN_HOURS_PCT;
      return { slug, name: nameBySlug.get(slug) ?? slug, n: v.n, hoursPct, thin };
    })
    .sort((a, b) => Number(b.thin) - Number(a.thin) || a.hoursPct - b.hoursPct);
  const thinCount = coverage.filter((c) => c.thin).length;

  // ── Freshness integrity ──
  const verifyDays = new Map<string, number>();
  for (const p of places) {
    const day = (p.last_verified_at ?? "").slice(0, 10) || "none";
    verifyDays.set(day, (verifyDays.get(day) ?? 0) + 1);
  }
  const distinctDays = verifyDays.size;
  const topDay = [...verifyDays.entries()].sort((a, b) => b[1] - a[1])[0];
  const freshnessBroken = distinctDays <= 2; // one batch stamp = not real tracking

  // ── Attribute substrate ──
  const attrCounts = ATTR_PROBES.map((probe) => ({
    label: probe.label,
    n: places.filter((p) => (p.tags ?? []).some((t) => probe.match((t ?? "").toLowerCase()))).length,
  }));

  return (
    <div className="mx-auto max-w-screen-md px-4 py-8" style={{ background: "var(--app-bg)" }}>
      <Link href="/admin" className="text-xs" style={{ color: "var(--app-cool)" }}>← Admin</Link>

      <header className="mt-4 space-y-1">
        <p className="text-[11px] font-medium uppercase tracking-[0.1em]" style={{ color: "var(--app-ink-3)" }}>
          The state of the data
        </p>
        <h1 className="font-serif text-[26px] font-semibold tracking-tight" style={{ color: "var(--app-ink)" }}>
          Coverage &amp; freshness
        </h1>
        <p className="text-xs" style={{ color: "var(--app-ink-3)" }}>
          {total} places in the live dataset. The foundation problems a polished
          front end can hide.
        </p>
      </header>

      {/* ── Freshness integrity alert ── */}
      <section
        className="mt-6 rounded-[var(--app-radius-md)] border p-4"
        style={{
          borderColor: freshnessBroken ? "color-mix(in srgb, var(--app-danger) 45%, var(--app-border))" : "var(--app-border)",
          background: "var(--app-bg-elevated)",
        }}
      >
        <div className="flex items-center gap-2">
          <span aria-hidden className="inline-block h-2 w-2 rounded-full" style={{ background: freshnessBroken ? "var(--app-danger)" : "var(--app-positive)" }} />
          <h2 className="text-[13px] font-semibold uppercase tracking-[0.06em]" style={{ color: "var(--app-ink)" }}>
            Freshness integrity
          </h2>
        </div>
        {freshnessBroken ? (
          <p className="mt-2 text-[13px] leading-relaxed" style={{ color: "var(--app-ink-2)" }}>
            All {total} places share <strong>{distinctDays === 1 ? "one" : distinctDays} verification date{distinctDays === 1 ? "" : "s"}</strong>
            {topDay ? ` (${topDay[0]}, ${topDay[1]} places)` : ""}. <code>last_verified_at</code> is a
            batch stamp, not per-place verification, so the &ldquo;verified
            recently&rdquo; signal users see is uniform and therefore not a real
            trust signal. A field guide&rsquo;s value is being right; this needs a
            per-place verification loop (re-check oldest first, stamp
            individually) before public launch.
          </p>
        ) : (
          <p className="mt-2 text-[13px]" style={{ color: "var(--app-ink-2)" }}>
            {distinctDays} distinct verification dates. Per-place freshness is
            being tracked.
          </p>
        )}
      </section>

      {/* ── Coverage equity ── */}
      <section className="mt-7 space-y-2">
        <div className="flex items-baseline justify-between">
          <h2 className="text-xs font-medium uppercase tracking-[0.08em]" style={{ color: "var(--app-ink-3)" }}>
            Coverage by town
          </h2>
          <span className="font-mono text-[11px]" style={{ color: thinCount > 0 ? "var(--app-warning)" : "var(--app-positive)" }}>
            {thinCount} thin
          </span>
        </div>
        <p className="text-[12px]" style={{ color: "var(--app-ink-3)" }}>
          Thin = under {THIN_COUNT} places or under {THIN_HOURS_PCT}% with posted
          hours. These are where &ldquo;city and county connected&rdquo; rings
          hollow for a local.
        </p>
        <ul className="space-y-1">
          {coverage.map((c) => (
            <li
              key={c.slug}
              className="flex items-center justify-between rounded-[var(--app-radius-md)] border bg-[var(--app-bg-elevated)] px-3 py-2 text-[13px]"
              style={{ borderColor: c.thin ? "color-mix(in srgb, var(--app-warning) 40%, var(--app-border))" : "var(--app-border)" }}
            >
              <span className="font-medium" style={{ color: "var(--app-ink)" }}>{c.name}</span>
              <span className="font-mono text-[12px] tabular-nums" style={{ color: "var(--app-ink-2)" }}>
                {c.n} places · {c.hoursPct}% hours
                {c.thin && <span className="ml-2 font-sans font-semibold" style={{ color: "var(--app-warning)" }}>THIN</span>}
              </span>
            </li>
          ))}
        </ul>
      </section>

      {/* ── Attribute substrate ── */}
      <section className="mt-7 space-y-2">
        <h2 className="text-xs font-medium uppercase tracking-[0.08em]" style={{ color: "var(--app-ink-3)" }}>
          Attribute substrate
        </h2>
        <p className="text-[12px]" style={{ color: "var(--app-ink-3)" }}>
          The data that makes Ask (&ldquo;eat outside near downtown&rdquo;),
          filters, and &ldquo;why this&rdquo; real. It partly exists but is thin,
          and nothing consumes it yet. The Ask failure was a wiring gap, not
          only a data gap.
        </p>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {attrCounts.map((a) => (
            <div key={a.label} className="rounded-[var(--app-radius-md)] border bg-[var(--app-bg-elevated)] p-2.5 text-center" style={{ borderColor: "var(--app-border)" }}>
              <p className="font-serif text-xl font-semibold tabular-nums" style={{ color: a.n === 0 ? "var(--app-danger)" : a.n < 30 ? "var(--app-warning)" : "var(--app-ink)" }}>{a.n}</p>
              <p className="mt-0.5 text-[10px] leading-tight" style={{ color: "var(--app-ink-3)" }}>{a.label}</p>
            </div>
          ))}
        </div>
      </section>

      <p className="mt-8 text-[11px] leading-relaxed" style={{ color: "var(--app-ink-3)" }}>
        Computed live from places-client.json on each request. The fixes:
        (1) a per-place verification loop that stamps individually and re-checks
        oldest first; (2) an attribute-capture flow (the business claim / collect
        route pointed at these tags); (3) an Ask eligibility layer that consumes
        the tags. Foundation before features.
      </p>
    </div>
  );
}
