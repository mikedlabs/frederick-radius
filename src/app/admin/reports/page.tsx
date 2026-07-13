import type { Metadata } from "next";
import { desc } from "drizzle-orm";
import { Check, EyeOff, Trash2, Flag } from "lucide-react";
import { getDb } from "@/lib/db/client";
import { community_reports } from "@/lib/db/schema";
import { REPORT_CATEGORY_BY_KEY } from "@/lib/reports/categories";
import {
  AdminShell,
  SectionLabel,
  StatStrip,
  HairlineList,
  StatusPill,
  Tag,
  AdminButton,
  EmptyState,
  Notice,
  type Tone,
} from "@/components/admin/kit";
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

/** Raw status string → a kit tone (pending amber, approved green, rejected grey). */
function statusTone(status: string): Tone {
  if (status === "pending") return "warning";
  if (status === "approved") return "positive";
  if (status === "rejected") return "muted";
  return "neutral";
}

/**
 * ReportThumbnail — 64x64 preview of a blob-hosted report photo. Kept local
 * (not a kit primitive): a raw <img> is intentional for arbitrary external
 * blob URLs, and no-img-element stays disabled on that line by design.
 */
function ReportThumbnail({ src }: { src: string }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element -- admin thumbnail of a blob-hosted report photo
    <img
      src={src}
      alt=""
      className="h-16 w-16 shrink-0 rounded-[var(--app-radius-sm)] border object-cover"
      style={{ borderColor: "var(--app-border)" }}
    />
  );
}

export default async function ReportsReviewPage() {
  const result = await loadRows();
  const rows = result.ok ? result.rows : [];
  const pending = rows.filter((r) => r.status === "pending");
  const approved = rows.filter((r) => r.status === "approved").length;
  const rejected = rows.filter((r) => r.status === "rejected").length;

  return (
    <AdminShell
      title="Community reports"
      eyebrow="Moderation queue"
      back={{ href: "/admin", label: "Admin" }}
      intro={
        result.ok
          ? "Approve to put a report on the map; reject to hide it; delete to remove spam."
          : undefined
      }
    >
      {!result.ok ? (
        <div className="mt-5">
          <Notice tone="warning">{result.reason}</Notice>
        </div>
      ) : rows.length === 0 ? (
        <EmptyState icon={Flag}>No reports yet.</EmptyState>
      ) : (
        <>
          <div className="mt-5">
            <StatStrip
              items={[
                { value: pending.length, label: "pending", tone: pending.length > 0 ? "warning" : "neutral" },
                { value: approved, label: "approved", tone: "positive" },
                { value: rejected, label: "rejected", tone: "muted" },
                { value: rows.length, label: "total", tone: "neutral" },
              ]}
            />
          </div>

          <section className="mt-7">
            <SectionLabel>Newest first</SectionLabel>
            <HairlineList>
              {rows.map((r, i) => {
                const cat = REPORT_CATEGORY_BY_KEY[r.category];
                const sub = cat?.subtypes.find((s) => s.key === r.subtype);
                return (
                  <li key={r.id} style={i > 0 ? { borderTop: "1px solid var(--app-border)" } : undefined}>
                    <div className="bg-[var(--app-bg-elevated)] px-3 py-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                            <span className="text-[14px] font-medium" style={{ color: "var(--app-ink)" }}>
                              {cat?.glyph} {cat?.label ?? r.category}
                            </span>
                            {sub ? <Tag tone="neutral">{sub.label}</Tag> : null}
                            <StatusPill tone={statusTone(r.status)}>{r.status}</StatusPill>
                          </div>
                          {r.note ? (
                            <p className="mt-1.5 text-[13px] leading-relaxed" style={{ color: "var(--app-ink-2)" }}>
                              {r.note}
                            </p>
                          ) : null}
                          <p className="mt-1.5 font-mono text-[11px]" style={{ color: "var(--app-ink-3)" }}>
                            {r.lat.toFixed(5)}, {r.lng.toFixed(5)}
                            {r.municipality ? ` · ${r.municipality}` : ""}
                            {r.reported_by ? ` · by ${r.reported_by}` : ""}
                            {r.created_at ? ` · ${new Date(r.created_at).toLocaleString()}` : ""}
                          </p>
                        </div>
                        {r.photo_url ? <ReportThumbnail src={r.photo_url} /> : null}
                      </div>

                      <div className="mt-2.5 flex flex-wrap items-center gap-2">
                        {r.status !== "approved" && (
                          <form action={reviewReport}>
                            <input type="hidden" name="id" value={r.id} />
                            <input type="hidden" name="decision" value="approved" />
                            <AdminButton type="submit" variant="positive" icon={Check}>
                              Approve
                            </AdminButton>
                          </form>
                        )}
                        {r.status !== "rejected" && (
                          <form action={reviewReport}>
                            <input type="hidden" name="id" value={r.id} />
                            <input type="hidden" name="decision" value="rejected" />
                            <AdminButton type="submit" variant="ghost" icon={EyeOff}>
                              Reject
                            </AdminButton>
                          </form>
                        )}
                        <form action={reviewReport}>
                          <input type="hidden" name="id" value={r.id} />
                          <input type="hidden" name="decision" value="delete" />
                          <AdminButton type="submit" variant="ghost" icon={Trash2}>
                            Delete
                          </AdminButton>
                        </form>
                      </div>
                    </div>
                  </li>
                );
              })}
            </HairlineList>
          </section>
        </>
      )}
    </AdminShell>
  );
}
