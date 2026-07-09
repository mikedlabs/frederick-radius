import type { Metadata } from "next";
import Link from "next/link";
import { gte } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { usage_counters } from "@/lib/db/schema";

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
    <div className="mx-auto max-w-screen-md px-4 py-8" style={{ background: "var(--app-bg)" }}>
      <Link href="/admin" className="text-xs" style={{ color: "var(--app-cool)" }}>
        ← Back to Admin
      </Link>

      <header className="mt-4 space-y-1">
        <p className="text-[11px] font-medium uppercase tracking-[0.1em]" style={{ color: "var(--app-ink-3)" }}>
          Operations
        </p>
        <h1 className="font-serif text-[28px] font-semibold tracking-tight" style={{ color: "var(--app-ink)" }}>
          Usage costs
        </h1>
        <p className="text-[13px] leading-relaxed" style={{ color: "var(--app-ink-2)" }}>
          The app&rsquo;s own tally of calls to the paid upstreams, priced with rough
          unit estimates. The provider consoles are the source of truth for real
          bills; this tells you where the money is going before the invoice does.
        </p>
      </header>

      {dbError && (
        <p className="mt-4 rounded-[var(--app-radius-md)] border px-3 py-2 text-[12.5px]" style={{ borderColor: "var(--app-warning)", color: "var(--app-warning)" }}>
          The usage_counters table isn&rsquo;t migrated yet. Run
          <code className="mx-1">drizzle/0017_usage_counters.sql</code> in the Supabase
          SQL editor, then reload. Counters start filling as soon as it exists.
        </p>
      )}

      {/* Per-upstream meter */}
      <section className="mt-6 space-y-2">
        <h2 className="text-xs font-medium uppercase tracking-[0.08em]" style={{ color: "var(--app-ink-3)" }}>
          Metered calls
        </h2>
        <ul className="space-y-2">
          {UPSTREAMS.map((u) => {
            const d1 = sum(u.key, today);
            const d7 = sum(u.key, sevenAgo);
            const d30 = sum(u.key, null);
            const est30 = (d30 / 1000) * u.per1000;
            return (
              <li key={u.key} className="rounded-[var(--app-radius-md)] border px-3 py-2.5" style={{ borderColor: "var(--app-border)", background: "var(--app-bg-elevated)" }}>
                <div className="flex items-baseline justify-between gap-3">
                  <p className="text-[14px] font-semibold" style={{ color: "var(--app-ink)" }}>{u.label}</p>
                  <p className="font-mono text-[13px] font-semibold tabular-nums" style={{ color: est30 >= 1 ? "var(--app-brand-press)" : "var(--app-ink-2)" }}>
                    ~${est30.toFixed(2)}<span className="text-[10px] font-medium" style={{ color: "var(--app-ink-3)" }}> est / 30d</span>
                  </p>
                </div>
                <p className="mt-1 font-mono text-[11.5px] tabular-nums" style={{ color: "var(--app-ink-2)" }}>
                  today {d1.toLocaleString()} · 7d {d7.toLocaleString()} · 30d {d30.toLocaleString()}
                  <span style={{ color: "var(--app-ink-3)" }}> · ~${u.per1000}/1k</span>
                </p>
                <p className="mt-1 text-[11px] leading-snug" style={{ color: "var(--app-ink-3)" }}>{u.note}</p>
              </li>
            );
          })}
        </ul>
      </section>

      {/* Cost-control posture */}
      <section className="mt-7 space-y-2">
        <h2 className="text-xs font-medium uppercase tracking-[0.08em]" style={{ color: "var(--app-ink-3)" }}>
          Cost controls
        </h2>
        <ul className="space-y-1.5">
          {controls.map((c) => (
            <li key={c.label} className="flex items-start justify-between gap-3 rounded-[var(--app-radius-md)] border px-3 py-2.5 text-sm" style={{ borderColor: "var(--app-border)", background: "var(--app-bg-elevated)" }}>
              <div className="min-w-0 flex-1">
                <p className="font-medium" style={{ color: "var(--app-ink)" }}>{c.label}</p>
                <p className="text-[11px]" style={{ color: "var(--app-ink-3)" }}>{c.why}</p>
              </div>
              <span className="shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider" style={{
                background: c.ok ? "color-mix(in srgb, var(--app-positive) 12%, transparent)" : "color-mix(in srgb, var(--app-brand) 12%, transparent)",
                color: c.ok ? "var(--app-positive)" : "var(--app-brand-press)",
              }}>
                {c.ok ? "Active" : "Missing"}
              </span>
            </li>
          ))}
        </ul>
      </section>

      {/* Source-of-truth links */}
      <section className="mt-7 space-y-2">
        <h2 className="text-xs font-medium uppercase tracking-[0.08em]" style={{ color: "var(--app-ink-3)" }}>
          Real bills live here
        </h2>
        <ul className="flex flex-wrap gap-2">
          {BILLING_LINKS.map((l) => (
            <li key={l.href}>
              <a href={l.href} target="_blank" rel="noopener noreferrer" className="inline-block rounded-full border px-3 py-1.5 text-[12.5px] font-semibold" style={{ borderColor: "var(--app-border)", background: "var(--app-bg-elevated)", color: "var(--app-cool)" }}>
                {l.label} ↗
              </a>
            </li>
          ))}
        </ul>
      </section>

      <p className="mt-8 text-[11px] leading-relaxed" style={{ color: "var(--app-ink-3)" }}>
        Counts are an upper bound on billable calls: platform fetch caching means
        some metered requests never reach the network. Unit prices are estimates
        pinned in code (src/app/admin/costs/page.tsx); update them when provider
        pricing changes.
      </p>
    </div>
  );
}
