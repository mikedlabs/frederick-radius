import type { Metadata } from "next";
import { clientPlaces } from "@/lib/loaders/places-client";
import { MUNICIPALITIES } from "@/data/municipalities";
import {
  AdminShell,
  Section,
  SectionLabel,
  StatStrip,
  StatCards,
  HairlineList,
  HairlineRow,
  StatusPill,
  StatusDot,
  Callout,
} from "@/components/admin/kit";

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
 * The visual language is the shared admin kit (@/components/admin/kit): the
 * freshness alert is a tone-flipping Callout, the town list a HairlineList,
 * the attribute grid StatCards, so the page reads as one calm field guide.
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
  const attrsThin = attrCounts.filter((a) => a.n < 30).length;

  const freshTone = freshnessBroken ? "danger" : "positive";

  return (
    <AdminShell
      eyebrow="The state of the data"
      title="Coverage & freshness"
      intro={`${total} places in the live dataset. The foundation problems a polished front end can hide.`}
    >
      {/* ── The vitals: one glance across the three foundation problems. ── */}
      <div className="mt-6">
        <SectionLabel>The vitals</SectionLabel>
        <StatStrip
          items={[
            { value: total, label: "places" },
            { value: thinCount, label: "thin towns", tone: thinCount > 0 ? "warning" : "positive" },
            { value: distinctDays, label: "verify dates", tone: freshTone },
            { value: attrsThin, label: "thin attrs", tone: attrsThin > 0 ? "warning" : "positive" },
          ]}
        />
      </div>

      {/* ── Freshness integrity — a tone-flipping alert (danger vs positive). ── */}
      <div className="mt-8">
        <Callout
          tone={freshTone}
          title={
            <span className="inline-flex items-center gap-2">
              <StatusDot tone={freshTone} />
              Freshness integrity
            </span>
          }
        >
          {freshnessBroken ? (
            <>
              All {total} places share{" "}
              <strong>
                {distinctDays === 1 ? "one" : distinctDays} verification date{distinctDays === 1 ? "" : "s"}
              </strong>
              {topDay ? ` (${topDay[0]}, ${topDay[1]} places)` : ""}. <code>last_verified_at</code> is a
              batch stamp, not per-place verification, so the &ldquo;verified recently&rdquo; signal users
              see is uniform and therefore not a real trust signal. A field guide&rsquo;s value is being
              right; this needs a per-place verification loop (re-check oldest first, stamp individually)
              before public launch.
            </>
          ) : (
            <>
              {distinctDays} distinct verification dates. Per-place freshness is being tracked.
            </>
          )}
        </Callout>
      </div>

      {/* ── Coverage equity ── */}
      <Section
        title="Coverage by town"
        aside={
          <StatusPill tone={thinCount > 0 ? "warning" : "positive"}>{thinCount} thin</StatusPill>
        }
        description={
          <>
            Thin = under {THIN_COUNT} places or under {THIN_HOURS_PCT}% with posted hours. These are
            where &ldquo;city and county connected&rdquo; rings hollow for a local.
          </>
        }
      >
        <div className="mt-3">
          <HairlineList>
            {coverage.map((c, i) => (
              <HairlineRow
                key={c.slug}
                index={i}
                dot={c.thin ? "warning" : "positive"}
                title={c.name}
                meta={
                  <span className="font-mono tabular-nums">
                    {c.n} places · {c.hoursPct}% hours
                  </span>
                }
                badge={c.thin ? <StatusPill tone="warning">Thin</StatusPill> : undefined}
              />
            ))}
          </HairlineList>
        </div>
      </Section>

      {/* ── Attribute substrate ── */}
      <Section
        title="Attribute substrate"
        description={
          <>
            The data that makes Ask (&ldquo;eat outside near downtown&rdquo;), filters, and &ldquo;why
            this&rdquo; real. It partly exists but is thin, and nothing consumes it yet. The Ask failure
            was a wiring gap, not only a data gap.
          </>
        }
      >
        <div className="mt-3">
          <StatCards
            cols={4}
            items={attrCounts.map((a) => ({
              value: a.n,
              label: a.label,
              tone: a.n === 0 ? "danger" : a.n < 30 ? "warning" : "neutral",
            }))}
          />
        </div>
      </Section>

      <p className="mt-8 text-[11px] leading-relaxed" style={{ color: "var(--app-ink-3)" }}>
        Computed live from places-client.json on each request. The fixes:
        (1) a per-place verification loop that stamps individually and re-checks
        oldest first; (2) an attribute-capture flow (the business claim / collect
        route pointed at these tags); (3) an Ask eligibility layer that consumes
        the tags. Foundation before features.
      </p>
    </AdminShell>
  );
}
