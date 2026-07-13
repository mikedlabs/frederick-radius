import type { Metadata } from "next";
import { gte } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { usage_counters } from "@/lib/db/schema";
import {
  AdminShell,
  SectionLabel,
  HairlineList,
  StatusPill,
  Notice,
  ExternalLink,
} from "@/components/admin/kit";

export const metadata: Metadata = {
  title: "Usage costs",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

/**
 * /admin/costs — what is incurring cost, from the app's own meter.
 *
 * usage_counters is incremented beside every PAID upstream fetch
 * (lib/usage-meter.ts). This page turns those tallies into a per-upstream
 * readout (today / 7 days / 30 days) with an ESTIMATED dollar figure, plus a
 * cost-controls checklist showing which protections are actually configured.
 * The estimates are deliberately conservative labels, never a bill: the
 * provider consoles (linked) are the source of truth.
 *
 * Composed from the shared admin kit (@/components/admin/kit) so the whole
 * /admin surface reads as one calm field guide. The metered rows and cost
 * estimate figure stay local: they carry a threshold-colored money figure,
 * a mono stat line, and an untruncated note that no kit row slot covers.
 */

/** Unit-price ESTIMATES per 1,000 calls, in dollars. Update from the provider
 *  pricing pages when they change; the UI labels every figure an estimate. */
const UPSTREAMS: Array<{
  key: string;
  label: string;
  per1000: number;
  note: string;
}> = [
  { key: "google_photo", label: "Google place photos", per1000: 7, note: "Places Photo SKU. The blob mirror bills each photo once ever; these counts are real Google fetches." },
  { key: "anthropic_ask", label: "Ask (Claude answers)", per1000: 10, note: "Roughly a cent per answer; varies with tokens." },
  { key: "mapbox_isochrone", label: "Mapbox isochrone", per1000: 2, note: "After the free tier. Platform caching means real hits run lower than this count." },
  { key: "mapbox_static", label: "Mapbox static maps", per1000: 1, note: "After the 50k/month free tier; cached for 30 days per location." },
];

const BILLING_LINKS: Array<{ label: string; href: string }> = [
  { label: "Google Cloud billing", href: "https://console.cloud.google.com/billing" },
  { label: "Anthropic usage", href: "https://console.anthropic.com/settings/usage" },
  { label: "Mapbox statistics", href: "https://account.mapbox.com/statistics" },
  { label: "Vercel usage", href: "https://vercel.com/dashboard/usage" },
];

function dayKeyEastern(d: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(d);
}

/** The threshold-colored 30-day estimate figure (brand-press when it clears $1). */
function EstimateFigure({ est }: { est: number }) {
  return (
    <div className="shrink-0 text-right">
      <p
        className="font-mono text-[14px] font-semibold leading-none tabular-nums"
        style={{ color: est >= 1 ? "var(--app-brand-press)" : "var(--app-ink-2)" }}
      >
        ~${est.toFixed(2)}
      </p>
      <p className="mt-1 text-[10px] font-medium" style={{ color: "var(--app-ink-3)" }}>
        est / 30d
      </p>
    </div>
  );
}

export default async function CostsAdmin() {
  const db = getDb();
  let rows: Array<{ day: string; upstream: string; count: number }> = [];
  let dbError = false;
  // eslint-disable-next-line react-hooks/purity -- force-dynamic server page; the whole point is a fresh per-request window
  const nowMs = Date.now();
  if (db) {
    try {
      const since = new Date(nowMs - 30 * 86_400_000);
      rows = await db
        .select({ day: usage_counters.day, upstream: usage_counters.upstream, count: usage_counters.count })
        .from(usage_counters)
        .where(gte(usage_counters.day, dayKeyEastern(since)));
    } catch {
      dbError = true;
    }
  }

  const today = dayKeyEastern(new Date(nowMs));
  const sevenAgo = dayKeyEastern(new Date(nowMs - 7 * 86_400_000));
  const sum = (key: string, sinceDay: string | null) =>
    rows
      .filter((r) => r.upstream === key && (sinceDay === null || r.day >= sinceDay))
      .reduce((a, r) => a + r.count, 0);

  // Cost-control posture — read live from env so the checklist is honest.
  const controls: Array<{ label: string; ok: boolean; why: string }> = [
    { label: "Rate limiting (Vercel KV)", ok: Boolean(process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN), why: "Without KV, isRateLimited() silently passes everything through and every paid upstream is unmetered." },
    { label: "Photo blob mirror", ok: Boolean(process.env.BLOB_READ_WRITE_TOKEN), why: "Mirrors each Google photo once so repeat views never re-bill Google." },
    { label: "Google Places key", ok: Boolean(process.env.GOOGLE_PLACES_API_KEY), why: "Set a hard budget cap + alerts in the Google Cloud console." },
    { label: "Anthropic key", ok: Boolean(process.env.ANTHROPIC_API_KEY), why: "Set a usage limit on the key in the Anthropic console." },
  ];

  return (
    <AdminShell
      eyebrow="Operations"
      title="Usage costs"
      intro={
        <>
          The app&rsquo;s own tally of calls to the paid upstreams, priced with rough
          unit estimates. The provider consoles are the source of truth for real
          bills; this tells you where the money is going before the invoice does.
        </>
      }
    >
      {dbError && (
        <div className="mt-6">
          <Notice tone="warning">
            The usage_counters table isn&rsquo;t migrated yet. Run
            <code className="mx-1">drizzle/0017_usage_counters.sql</code> in the Supabase
            SQL editor, then reload. Counters start filling as soon as it exists.
          </Notice>
        </div>
      )}

      {/* Per-upstream meter — the answer (estimated spend) leads each row, counts support. */}
      <section className="mt-6">
        <SectionLabel>Metered calls</SectionLabel>
        <HairlineList>
          {UPSTREAMS.map((u, i) => {
            const d1 = sum(u.key, today);
            const d7 = sum(u.key, sevenAgo);
            const d30 = sum(u.key, null);
            const est30 = (d30 / 1000) * u.per1000;
            return (
              <li key={u.key} style={i > 0 ? { borderTop: "1px solid var(--app-border)" } : undefined}>
                <div className="flex items-start justify-between gap-3 bg-[var(--app-bg-elevated)] px-3 py-2.5">
                  <div className="min-w-0 flex-1">
                    <p className="text-[14px] font-medium leading-tight" style={{ color: "var(--app-ink)" }}>
                      {u.label}
                    </p>
                    <p className="mt-1 font-mono text-[11.5px] tabular-nums" style={{ color: "var(--app-ink-2)" }}>
                      today {d1.toLocaleString()} · 7d {d7.toLocaleString()} · 30d {d30.toLocaleString()}
                      <span style={{ color: "var(--app-ink-3)" }}> · ~${u.per1000}/1k</span>
                    </p>
                    <p className="mt-1 text-[11px] leading-snug" style={{ color: "var(--app-ink-3)" }}>
                      {u.note}
                    </p>
                  </div>
                  <EstimateFigure est={est30} />
                </div>
              </li>
            );
          })}
        </HairlineList>
      </section>

      {/* Cost-control posture */}
      <section className="mt-7">
        <SectionLabel>Cost controls</SectionLabel>
        <HairlineList>
          {controls.map((c, i) => (
            <li key={c.label} style={i > 0 ? { borderTop: "1px solid var(--app-border)" } : undefined}>
              <div className="flex items-start gap-3 bg-[var(--app-bg-elevated)] px-3 py-2.5">
                <div className="min-w-0 flex-1">
                  <p className="text-[14px] font-medium leading-tight" style={{ color: "var(--app-ink)" }}>
                    {c.label}
                  </p>
                  <p className="mt-1 text-[11px] leading-snug" style={{ color: "var(--app-ink-3)" }}>
                    {c.why}
                  </p>
                </div>
                <StatusPill tone={c.ok ? "positive" : "brand"}>{c.ok ? "Active" : "Missing"}</StatusPill>
              </div>
            </li>
          ))}
        </HairlineList>
      </section>

      {/* Source-of-truth links */}
      <section className="mt-7">
        <SectionLabel>Real bills live here</SectionLabel>
        <div className="flex flex-wrap gap-2">
          {BILLING_LINKS.map((l) => (
            <ExternalLink key={l.href} href={l.href}>
              {l.label}
            </ExternalLink>
          ))}
        </div>
      </section>

      <p className="mt-8 text-[11px] leading-relaxed" style={{ color: "var(--app-ink-3)" }}>
        Counts are an upper bound on billable calls: platform fetch caching means
        some metered requests never reach the network. Unit prices are estimates
        pinned in code (src/app/admin/costs/page.tsx); update them when provider
        pricing changes.
      </p>
    </AdminShell>
  );
}
