import type { Metadata } from "next";
import Link from "next/link";
import { desc } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { community_reports } from "@/lib/db/schema";
import { REPORT_CATEGORY_BY_KEY } from "@/lib/reports/categories";
import { reviewReport } from "./actions";

export const metadata: Metadata = {
  title: "Community reports · Admin",
  robots: { index: false, follow: false },
};
export const dynamic = "force-dynamic";

type Row = typeof community_reports.$inferSelect;

async function loadRows(): Promise<
  { ok: true; rows: Row[] } | { ok: false; reason: string }
> {
  const db = getDb();
  if (!db) return { ok: false, reason: "DATABASE_URL is not configured for this environment." };
  try {
    const rows = await db
      .select()
      .from(community_reports)
      .orderBy(desc(community_reports.created_at))
      .limit(200);
    return { ok: true, rows };
  } catch (err) {
    return {
      ok: false,
      reason:
        "Could not read community_reports. Apply docs/vision/community-reports.migration.sql. " +
        (err instanceof Error ? err.message : ""),
    };
  }
}

const STATUS_COLOR: Record<string, string> = {
  pending: "var(--app-accent, #B07A1E)",
  approved: "var(--app-positive, #1E6B3A)",
  rejected: "var(--app-ink-3, #7A7975)",
};

export default async function ReportsReviewPage() {
  const result = await loadRows();
  const rows = result.ok ? result.rows : [];
  const pending = rows.filter((r) => r.status === "pending");

  return (
    <div className="mx-auto max-w-screen-md px-4 py-8" style={{ background: "var(--app-bg)" }}>
      <Link href="/admin" className="text-xs" style={{ color: "var(--app-cool)" }}>
        ← Admin
      </Link>
      <header className="mt-4 space-y-1">
        <p className="text-[11px] font-medium uppercase tracking-[0.1em]" style={{ color: "var(--app-ink-3)" }}>
          Moderation queue
        </p>
        <h1 className="font-serif text-2xl font-semibold" style={{ color: "var(--app-ink)" }}>
          Community reports
        </h1>
        <p className="text-sm" style={{ color: "var(--app-ink-2)" }}>
          {result.ok
            ? `${pending.length} pending · ${rows.length} total. Approve to put a report on the map; reject to hide it; delete to remove spam.`
            : result.reason}
        </p>
      </header>

      {result.ok && rows.length === 0 && (
        <p className="mt-8 text-sm" style={{ color: "var(--app-ink-3)" }}>
          No reports yet.
        </p>
      )}

      <ul className="mt-6 space-y-3">
        {rows.map((r) => {
          const cat = REPORT_CATEGORY_BY_KEY[r.category];
          const sub = cat?.subtypes.find((s) => s.key === r.subtype);
          return (
            <li
              key={r.id}
              className="rounded-[var(--app-radius-md)] border p-3"
              style={{ borderColor: "var(--app-border)", background: "var(--app-bg-elevated)" }}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px]">
                    <span className="font-semibold" style={{ color: "var(--app-ink)" }}>
                      {cat?.glyph} {cat?.label ?? r.category}
                      {sub ? ` · ${sub.label}` : ""}
                    </span>
                    <span
                      className="rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide"
                      style={{ color: "#fff", background: STATUS_COLOR[r.status] ?? "var(--app-ink-3)" }}
                    >
                      {r.status}
                    </span>
                  </div>
                  {r.note && (
                    <p className="mt-1 text-[13px]" style={{ color: "var(--app-ink-2)" }}>
                      {r.note}
                    </p>
                  )}
                  <p className="mt-1 font-mono text-[11px]" style={{ color: "var(--app-ink-3)" }}>
                    {r.lat.toFixed(5)}, {r.lng.toFixed(5)}
                    {r.municipality ? ` · ${r.municipality}` : ""}
                    {r.reported_by ? ` · by ${r.reported_by}` : ""}
                    {r.created_at ? ` · ${new Date(r.created_at).toLocaleString()}` : ""}
                  </p>
                </div>
                {r.photo_url && (
                  // eslint-disable-next-line @next/next/no-img-element -- admin thumbnail of a blob-hosted report photo
                  <img src={r.photo_url} alt="" className="h-16 w-16 shrink-0 rounded-md object-cover" />
                )}
              </div>
              <div className="mt-2.5 flex gap-2">
                {r.status !== "approved" && (
                  <form action={reviewReport}>
                    <input type="hidden" name="id" value={r.id} />
                    <input type="hidden" name="decision" value="approved" />
                    <button
                      type="submit"
                      className="rounded-[var(--app-radius-sm)] px-3 py-1.5 text-[12px] font-semibold text-white"
                      style={{ background: "var(--app-positive, #1E6B3A)" }}
                    >
                      Approve
                    </button>
                  </form>
                )}
                {r.status !== "rejected" && (
                  <form action={reviewReport}>
                    <input type="hidden" name="id" value={r.id} />
                    <input type="hidden" name="decision" value="rejected" />
                    <button
                      type="submit"
                      className="rounded-[var(--app-radius-sm)] border px-3 py-1.5 text-[12px] font-semibold"
                      style={{ borderColor: "var(--app-border)", color: "var(--app-ink-2)" }}
                    >
                      Reject
                    </button>
                  </form>
                )}
                <form action={reviewReport}>
                  <input type="hidden" name="id" value={r.id} />
                  <input type="hidden" name="decision" value="delete" />
                  <button
                    type="submit"
                    className="rounded-[var(--app-radius-sm)] px-3 py-1.5 text-[12px] font-semibold"
                    style={{ color: "var(--app-brand, #E14328)" }}
                  >
                    Delete
                  </button>
                </form>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
