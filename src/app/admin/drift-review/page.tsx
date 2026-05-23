import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRight, Check, X, RotateCcw } from "lucide-react";
import {
  getDrift,
  getDecisions,
  getDriftStats,
  decisionKey,
  type DriftField,
} from "@/lib/drift-review";
import { decideDrift } from "./actions";

export const metadata: Metadata = {
  title: "Drift review · Admin",
  robots: { index: false, follow: false },
};
export const dynamic = "force-dynamic";

const FIELD_LABEL: Record<DriftField, string> = {
  business_status: "Business status",
  name: "Name",
  phone: "Phone",
  website: "Website",
  hours: "Hours",
  rating: "Rating",
  address: "Address",
};

export default async function DriftReviewPage() {
  if (process.env.NODE_ENV !== "development") notFound();

  const drift = getDrift();
  const decisions = getDecisions();
  const stats = getDriftStats();

  const handle = async (formData: FormData) => {
    "use server";
    const slug = String(formData.get("slug") ?? "");
    const field = String(formData.get("field") ?? "") as DriftField;
    const action = String(formData.get("action") ?? "");
    if (!slug || !field) return;
    if (action === "accepted" || action === "rejected" || action === "clear") {
      await decideDrift(slug, field, action);
    }
  };

  return (
    <div className="mx-auto max-w-screen-md px-4 py-8" style={{ background: "var(--app-bg)" }}>
      <div className="flex items-center justify-between">
        <Link href="/admin" className="text-xs" style={{ color: "var(--app-cool)" }}>
          ← Admin
        </Link>
        <p className="text-[11px] font-medium uppercase tracking-[0.08em]" style={{ color: "var(--app-ink-3)" }}>
          {stats.accepted} accepted · {stats.rejected} rejected · {stats.undecided} pending
        </p>
      </div>

      <header className="mt-3 space-y-1">
        <p className="text-[11px] font-medium uppercase tracking-[0.1em]" style={{ color: "var(--app-ink-3)" }}>
          Vetting · {stats.drift_rows} rows · {stats.total_changes} changes
        </p>
        <h1 className="font-serif text-[24px] font-semibold tracking-tight" style={{ color: "var(--app-ink)" }}>
          Drift review
        </h1>
        <p className="text-[12px]" style={{ color: "var(--app-ink-3)" }}>
          {stats.last_sweep_at
            ? `Sweep ran ${new Date(stats.last_sweep_at).toLocaleString()}.`
            : "No sweep on disk yet."}
          {" "}Accept what&apos;s true now, reject what&apos;s noise. Decisions persist to <code>data/drift-decisions.json</code>; the canonical files are not touched.
        </p>
      </header>

      {drift.rows.length === 0 ? (
        <div
          className="mt-6 rounded-[var(--app-radius-lg)] border p-6 text-center"
          style={{ borderColor: "var(--app-border)" }}
        >
          <p className="font-serif text-[20px] font-semibold" style={{ color: "var(--app-ink)" }}>
            Nothing has drifted.
          </p>
          <p className="mx-auto mt-1 max-w-sm text-[13px]" style={{ color: "var(--app-ink-3)" }}>
            Run <code>npm run vet</code> to pull a fresh sweep, or this page
            shows up empty because the last sweep matched everything.
          </p>
        </div>
      ) : (
        <ul className="mt-6 space-y-3">
          {drift.rows.map((row) => (
            <li
              key={row.slug}
              className="tactile overflow-hidden rounded-[var(--app-radius-lg)] bg-[var(--app-bg-elevated)]"
            >
              <div className="border-b px-4 py-3" style={{ borderColor: "var(--app-border)" }}>
                <Link
                  href={`/places/${row.slug}`}
                  className="font-serif text-[16px] font-semibold tracking-tight"
                  style={{ color: "var(--app-ink)" }}
                >
                  {row.slug}
                </Link>
                <p className="mt-0.5 text-[11px]" style={{ color: "var(--app-ink-3)" }}>
                  {row.changes.length} change{row.changes.length === 1 ? "" : "s"} · detected{" "}
                  {new Date(row.detected_at).toLocaleString()}
                </p>
              </div>
              <ul className="divide-y" style={{ borderColor: "var(--app-border)" }}>
                {row.changes.map((ch) => {
                  const key = decisionKey(row.slug, ch.field);
                  const decision = decisions[key];
                  return (
                    <li
                      key={ch.field}
                      className="px-4 py-3"
                      style={{
                        background:
                          decision === "accepted"
                            ? "color-mix(in srgb, var(--app-positive) 8%, transparent)"
                            : decision === "rejected"
                              ? "color-mix(in srgb, var(--app-danger) 8%, transparent)"
                              : undefined,
                      }}
                    >
                      <div className="flex flex-wrap items-baseline justify-between gap-2">
                        <p className="text-[11px] font-bold uppercase tracking-[0.1em]" style={{ color: "var(--app-ink-3)" }}>
                          {FIELD_LABEL[ch.field]}
                        </p>
                        {decision && (
                          <span
                            className="rounded-full px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-[0.1em] text-white"
                            style={{
                              background:
                                decision === "accepted" ? "var(--app-positive)" : "var(--app-danger)",
                            }}
                          >
                            {decision}
                          </span>
                        )}
                      </div>
                      <div className="mt-1 flex flex-wrap items-center gap-2 text-[13px]">
                        <span
                          className="rounded-[var(--app-radius-sm)] px-2 py-1 line-through"
                          style={{
                            background: "color-mix(in srgb, var(--app-danger) 8%, transparent)",
                            color: "var(--app-ink-2)",
                          }}
                        >
                          {ch.before ?? "–"}
                        </span>
                        <ArrowRight className="h-3.5 w-3.5 shrink-0" strokeWidth={2.25} aria-hidden style={{ color: "var(--app-ink-3)" }} />
                        <span
                          className="rounded-[var(--app-radius-sm)] px-2 py-1 font-semibold"
                          style={{
                            background: "color-mix(in srgb, var(--app-positive) 10%, transparent)",
                            color: "var(--app-ink)",
                          }}
                        >
                          {ch.after ?? "–"}
                        </span>
                      </div>
                      <form action={handle} className="mt-2 flex gap-2 text-[12px] font-semibold">
                        <input type="hidden" name="slug" value={row.slug} />
                        <input type="hidden" name="field" value={ch.field} />
                        <button
                          type="submit"
                          name="action"
                          value="accepted"
                          className="inline-flex items-center gap-1 rounded-full px-3 py-1 tactile tactile-interactive"
                          style={{ background: "var(--app-positive)", color: "white" }}
                        >
                          <Check className="h-3 w-3" strokeWidth={2.25} aria-hidden /> Accept
                        </button>
                        <button
                          type="submit"
                          name="action"
                          value="rejected"
                          className="inline-flex items-center gap-1 rounded-full px-3 py-1 tactile tactile-interactive"
                          style={{ background: "var(--app-danger)", color: "white" }}
                        >
                          <X className="h-3 w-3" strokeWidth={2.25} aria-hidden /> Reject
                        </button>
                        {decision && (
                          <button
                            type="submit"
                            name="action"
                            value="clear"
                            className="inline-flex items-center gap-1 rounded-full px-3 py-1"
                            style={{ color: "var(--app-ink-3)" }}
                          >
                            <RotateCcw className="h-3 w-3" strokeWidth={2.25} aria-hidden /> Clear
                          </button>
                        )}
                      </form>
                    </li>
                  );
                })}
              </ul>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
