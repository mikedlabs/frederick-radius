import type { Metadata } from "next";
import Link from "next/link";
import { Check, X, RotateCcw } from "lucide-react";
import {
  getDrift,
  getDecisions,
  getDriftStats,
  decisionKey,
  type DriftField,
} from "@/lib/drift-review";
import {
  AdminShell,
  Section,
  HairlineList,
  DiffPair,
  StatusPill,
  AdminButton,
  AllClear,
} from "@/components/admin/kit";
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
  const drift = getDrift();
  const decisions = await getDecisions();
  const stats = getDriftStats(drift, decisions);

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
    <AdminShell
      eyebrow={`Vetting · ${stats.drift_rows} rows · ${stats.total_changes} changes`}
      title="Drift review"
      aside={`${stats.accepted} accepted · ${stats.rejected} rejected · ${stats.undecided} pending`}
      intro={
        <>
          {stats.last_sweep_at
            ? `Sweep ran ${new Date(stats.last_sweep_at).toLocaleString()}.`
            : "No sweep on disk yet."}{" "}
          Accept what&apos;s true now, reject what&apos;s noise. Decisions persist to{" "}
          <code>data/drift-decisions.json</code>; the canonical files are not touched.
        </>
      }
    >
      {drift.rows.length === 0 ? (
        <div className="mt-6">
          <AllClear>Nothing has drifted.</AllClear>
          <p className="mt-2 text-[12.5px] leading-relaxed" style={{ color: "var(--app-ink-3)" }}>
            Run <code>npm run vet</code> to pull a fresh sweep, or this page shows up empty
            because the last sweep matched everything.
          </p>
        </div>
      ) : (
        <div className="mt-6 space-y-8">
          {drift.rows.map((row) => (
            <Section
              key={row.slug}
              className=""
              title={
                <Link href={`/places/${row.slug}`} style={{ color: "var(--app-ink)" }}>
                  {row.slug}
                </Link>
              }
              description={`${row.changes.length} change${
                row.changes.length === 1 ? "" : "s"
              } · detected ${new Date(row.detected_at).toLocaleString()}`}
            >
              <div className="mt-3">
                <HairlineList>
                  {row.changes.map((ch, i) => {
                    const key = decisionKey(row.slug, ch.field);
                    const decision = decisions[key];
                    const bg =
                      decision === "accepted"
                        ? "color-mix(in srgb, var(--app-positive) 8%, var(--app-bg-elevated))"
                        : decision === "rejected"
                          ? "color-mix(in srgb, var(--app-danger) 8%, var(--app-bg-elevated))"
                          : "var(--app-bg-elevated)";
                    return (
                      <li
                        key={ch.field}
                        style={i > 0 ? { borderTop: "1px solid var(--app-border)" } : undefined}
                      >
                        <div className="px-3 py-3" style={{ background: bg }}>
                          <div className="flex flex-wrap items-baseline justify-between gap-2">
                            <span
                              className="font-mono text-[11px] font-semibold uppercase tracking-[0.1em]"
                              style={{ color: "var(--app-ink-3)" }}
                            >
                              {FIELD_LABEL[ch.field]}
                            </span>
                            {decision && (
                              <StatusPill tone={decision === "accepted" ? "positive" : "danger"}>
                                {decision.toUpperCase()}
                              </StatusPill>
                            )}
                          </div>
                          <div className="mt-1.5">
                            <DiffPair before={ch.before ?? "–"} after={ch.after ?? "–"} />
                          </div>
                          <form action={handle} className="mt-2.5 flex flex-wrap gap-2">
                            <input type="hidden" name="slug" value={row.slug} />
                            <input type="hidden" name="field" value={ch.field} />
                            <AdminButton variant="positive" type="submit" name="action" value="accepted" icon={Check}>
                              Accept
                            </AdminButton>
                            <AdminButton variant="danger" type="submit" name="action" value="rejected" icon={X}>
                              Reject
                            </AdminButton>
                            {decision && (
                              <AdminButton variant="ghost" type="submit" name="action" value="clear" icon={RotateCcw}>
                                Clear
                              </AdminButton>
                            )}
                          </form>
                        </div>
                      </li>
                    );
                  })}
                </HairlineList>
              </div>
            </Section>
          ))}
        </div>
      )}
    </AdminShell>
  );
}
