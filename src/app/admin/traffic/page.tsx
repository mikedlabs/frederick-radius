import type { Metadata } from "next";
import Link from "next/link";
import { SearchX, MessageCircleQuestion } from "lucide-react";
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
 * cannot lead with is the one thing a solo operator should read first:
 * THE MISSES — every search and Ask question that returned nothing,
 * with the exact text someone typed. That list is the work queue, so
 * it sits above top pages here, not below.
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
  let misses: { kind: "search" | "ask"; row: BreakdownRow }[] = [];
  let pages: BreakdownRow[] | null = null;
  let actions: BreakdownRow[] | null = null;

  if (keys) {
    // External API, no pooled-connection hazard — parallel is fine here
    // (the sequential-await rule on the desk is about the Supavisor pool).
    const [t, w, m, searchMisses, askMisses, p, a] = await Promise.all([
      fetchAggregate(keys, "day"),
      fetchAggregate(keys, "7d"),
      fetchAggregate(keys, "30d"),
      fetchBreakdown(keys, "event:props:query", "30d", { filters: "event:name==search_empty", limit: 20 }),
      fetchBreakdown(keys, "event:props:query", "30d", { filters: "event:name==ask_empty", limit: 20 }),
      fetchBreakdown(keys, "event:page", "7d", { limit: 10 }),
      fetchBreakdown(keys, "event:name", "7d", { limit: 10 }),
    ]);
    today = t;
    week = w;
    month = m;
    pages = p;
    actions = a?.filter((r) => r.label !== "pageview") ?? null;
    misses = [
      ...(searchMisses ?? []).map((row) => ({ kind: "search" as const, row })),
      ...(askMisses ?? []).map((row) => ({ kind: "ask" as const, row })),
    ].sort((x, y) => y.row.events - x.row.events);
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
            The tracker is collecting, but this page reads the numbers through the Plausible Stats
            API, which needs two server-side env vars that are not set yet:{" "}
            <code>PLAUSIBLE_API_KEY</code> (Plausible → Settings → API keys) and{" "}
            <code>PLAUSIBLE_SITE_ID</code> (the site domain, <code>frederickradius.app</code>).
            Add them in Vercel and this page fills itself in. The Monday digest starts working
            from the same two keys.
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

          {/* ── The misses: the work queue this page exists for ── */}
          <section className="mt-7">
            <h2 className="font-mono text-[11px] uppercase tracking-[0.14em]" style={{ color: "var(--app-ink-3)" }}>
              The misses · 30d
            </h2>
            <p className="mt-1 text-[12.5px]" style={{ color: "var(--app-ink-2)" }}>
              What people typed and did not get. Each row is a data gap to close.
            </p>
            {misses.length === 0 ? (
              <p className="mt-3 text-[13px]" style={{ color: "var(--app-ink-3)" }}>
                No missed searches or unanswered questions recorded yet. Either nothing has missed,
                or the goals are new (events started firing on 2026-07-19).
              </p>
            ) : (
              <ul className="mt-3 overflow-hidden rounded-[var(--app-radius-md)] border" style={{ borderColor: "var(--app-border)" }}>
                {misses.slice(0, 20).map(({ kind, row }, i) => (
                  <li
                    key={`${kind}-${row.label}`}
                    className="flex min-h-11 items-center gap-3 bg-[var(--app-bg-elevated)] px-3 py-2"
                    style={i > 0 ? { borderTop: "1px solid var(--app-border)" } : undefined}
                  >
                    {kind === "search" ? (
                      <SearchX className="h-4 w-4 shrink-0" strokeWidth={2} aria-hidden style={{ color: "var(--app-warning-press)" }} />
                    ) : (
                      <MessageCircleQuestion className="h-4 w-4 shrink-0" strokeWidth={2} aria-hidden style={{ color: "var(--app-cool)" }} />
                    )}
                    <span className="min-w-0 flex-1 truncate font-mono text-[13px]" style={{ color: "var(--app-ink)" }}>
                      {row.label}
                    </span>
                    <span className="shrink-0 text-[11px]" style={{ color: "var(--app-ink-3)" }}>
                      {kind === "search" ? "search" : "ask"}
                    </span>
                    <span className="shrink-0 font-mono text-[12.5px] font-bold tabular-nums" style={{ color: "var(--app-ink-2)" }}>
                      ×{row.events}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* ── Reference: where people go, what they do ── */}
          <section className="mt-7 grid gap-6 sm:grid-cols-2">
            <BreakdownList title="Top pages · 7d" rows={pages} empty="No pageviews recorded yet." />
            <BreakdownList title="Top actions · 7d" rows={actions} empty="No custom events recorded yet." />
          </section>
        </>
      )}

      <p className="mt-8 text-[11px] leading-relaxed" style={{ color: "var(--app-ink-3)" }}>
        Numbers are Plausible aggregates; the tracker is cookieless and collects nothing personal.
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
