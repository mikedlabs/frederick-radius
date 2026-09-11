import type { Metadata } from "next";
import Link from "next/link";
import {
  plausibleKeys,
  fetchAggregate,
  fetchBreakdown,
  type Aggregate,
  type BreakdownRow,
} from "@/lib/integrations/plausible-stats";

/**
 * /admin/traffic — Plausible, read into the desk's own language.
 *
 * The dashboard plausible.io already draws is one tap away; what it
 * The private data-gap log, not third-party custom properties, owns the exact
 * text behind missed searches and unanswered questions.
 *
 * Reads the Stats API server-side (no iframe: the CSP stays closed and
 * the page stays in the app's own type). Everything fails soft — no
 * keys renders the setup note, a down API says so quietly.
 */

export const metadata: Metadata = {
  title: "Traffic",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function TrafficPage() {
  const keys = plausibleKeys();

  let today: Aggregate | null = null;
  let week: Aggregate | null = null;
  let month: Aggregate | null = null;
  let pages: BreakdownRow[] | null = null;
  let actions: BreakdownRow[] | null = null;

  if (keys) {
    // External API, no pooled-connection hazard — parallel is fine here
    // (the sequential-await rule on the desk is about the Supavisor pool).
    const [t, w, m, p, a] = await Promise.all([
      fetchAggregate(keys, "day"),
      fetchAggregate(keys, "7d"),
      fetchAggregate(keys, "30d"),
      fetchBreakdown(keys, "event:page", "7d", { limit: 10 }),
      fetchBreakdown(keys, "event:name", "7d", { limit: 10 }),
    ]);
    today = t;
    week = w;
    month = m;
    pages = p;
    actions = a?.filter((r) => r.label !== "pageview") ?? null;
  }

  return (
    <main className="mx-auto max-w-screen-md px-4 py-8" style={{ background: "var(--app-bg)" }}>
      <Link href="/admin" className="tap-44 inline-flex items-center text-xs" style={{ color: "var(--app-cool)" }}>
        ← Operations desk
      </Link>

      <header className="mt-4 space-y-1">
        <p className="text-[11px] font-medium uppercase tracking-[0.1em]" style={{ color: "var(--app-ink-3)" }}>
          Plausible · frederickradius.app
        </p>
        <h1 className="font-serif text-[28px] font-semibold tracking-tight" style={{ color: "var(--app-ink)" }}>
          Traffic
        </h1>
      </header>

      {!keys ? (
        <section
          className="mt-6 rounded-[var(--app-radius-md)] border px-4 py-4 text-[13.5px] leading-relaxed"
          style={{ borderColor: "var(--app-border)", background: "var(--app-bg-elevated)", color: "var(--app-ink-2)" }}
        >
          <p>
            Your Starter plan collects pageviews and goals in Plausible. This embedded view uses
            the Stats API, which is a Business-plan feature. Use the Plausible dashboard for the
            live numbers. If you upgrade later, add <code>PLAUSIBLE_API_KEY</code> and{" "}
            <code>PLAUSIBLE_SITE_ID</code> in Vercel to fill this page and the Monday digest.
          </p>
        </section>
      ) : (
        <>
          {/* ── The glance strip: visitors today / 7d / 30d ── */}
          <section className="mt-6">
            {today === null && week === null && month === null ? (
              <p className="text-[13px]" style={{ color: "var(--app-ink-3)" }}>
                Plausible did not answer just now. The keys are set, so this is likely transient. Reload in a minute.
              </p>
            ) : (
              <div
                className="flex items-stretch justify-between rounded-[var(--app-radius-md)] border bg-[var(--app-bg-elevated)] py-3"
                style={{ borderColor: "var(--app-border)" }}
              >
                <Stat value={today?.visitors} label="visitors today" />
                <Div />
                <Stat value={week?.visitors} label="visitors · 7d" />
                <Div />
                <Stat value={month?.visitors} label="visitors · 30d" />
                <Div />
                <Stat value={week?.pageviews} label="views · 7d" />
              </div>
            )}
          </section>

          {/* ── Reference: where people go, what they do ── */}
          <section className="mt-7 grid gap-6 sm:grid-cols-2">
            <BreakdownList title="Top pages · 7d" rows={pages} empty="No pageviews recorded yet." />
            <BreakdownList title="Top actions · 7d" rows={actions} empty="No custom events recorded yet." />
          </section>
        </>
      )}

      <section className="mt-7 border-y py-3" style={{ borderColor: "var(--app-border-strong)" }}>
        <h2 className="text-[13px] font-semibold" style={{ color: "var(--app-ink)" }}>Search and Ask gaps</h2>
        <p className="mt-1 text-[12px] leading-relaxed" style={{ color: "var(--app-ink-2)" }}>
          Exact questions stay in Radius&rsquo;s own anonymous data-gap log instead of being sent to Plausible.
        </p>
        <Link href="/admin/data-gaps" className="tap-44-y mt-1 inline-flex items-center text-[12px] font-semibold" style={{ color: "var(--app-cool)" }}>
          Open data gaps →
        </Link>
      </section>

      <p className="mt-8 text-[11px] leading-relaxed" style={{ color: "var(--app-ink-3)" }}>
        Numbers are aggregate Plausible measurements from its cookieless tracker.
        The full dashboard lives at{" "}
        <a href="https://plausible.io/frederickradius.app" rel="noreferrer" target="_blank" className="underline">
          plausible.io
        </a>
        .
      </p>
    </main>
  );
}

function Div() {
  return <div aria-hidden className="w-px shrink-0 self-stretch" style={{ background: "var(--app-border)" }} />;
}

function Stat({ value, label }: { value: number | undefined; label: string }) {
  return (
    <div className="flex-1 px-1 text-center">
      <p className="font-serif text-2xl font-semibold tabular-nums leading-none" style={{ color: "var(--app-ink)" }}>
        {value == null ? "–" : value.toLocaleString()}
      </p>
      <p className="mt-1.5 text-[10px] leading-tight" style={{ color: "var(--app-ink-3)" }}>{label}</p>
    </div>
  );
}

function BreakdownList({ title, rows, empty }: { title: string; rows: BreakdownRow[] | null; empty: string }) {
  return (
    <div>
      <h2 className="font-mono text-[11px] uppercase tracking-[0.14em]" style={{ color: "var(--app-ink-3)" }}>
        {title}
      </h2>
      {!rows || rows.length === 0 ? (
        <p className="mt-2 text-[13px]" style={{ color: "var(--app-ink-3)" }}>{empty}</p>
      ) : (
        <ul className="mt-2">
          {rows.map((r) => (
            <li
              key={r.label}
              className="flex items-baseline justify-between gap-3 border-t py-1.5 first:border-t-0"
              style={{ borderColor: "var(--app-border)" }}
            >
              <span className="min-w-0 flex-1 truncate text-[13px]" style={{ color: "var(--app-ink)" }}>{r.label}</span>
              <span className="shrink-0 font-mono text-[12px] tabular-nums" style={{ color: "var(--app-ink-2)" }}>
                {r.visitors.toLocaleString()}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
