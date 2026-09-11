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

/** Whole days an item has been waiting. Nothing waits a negative day. */
function daysWaiting(created: Date | string | null): number {
  if (!created) return 0;
  return Math.max(0, Math.floor((Date.now() - new Date(created).getTime()) / 86_400_000));
}

/** Shared urgency scale for waiting work: calm under 3 days, warning at 3,
 *  danger at 7. Matches /admin/claims so the desk speaks one language. */
function waitTone(days: number): Tone {
  return days >= 7 ? "danger" : days >= 3 ? "warning" : "neutral";
}

/** One report row: the category lead, note, geo line, and the decision
 *  buttons. `showAge` adds the waiting-time pill for the pending section. */
function ReportRow({ r, first, showAge }: { r: Row; first: boolean; showAge?: boolean }) {
  const cat = REPORT_CATEGORY_BY_KEY[r.category];
  const sub = cat?.subtypes.find((s) => s.key === r.subtype);
  const days = daysWaiting(r.created_at);
  return (
    <li style={first ? undefined : { borderTop: "1px solid var(--app-border)" }}>
      <div className="bg-[var(--app-bg-elevated)] px-3 py-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <span className="text-[14px] font-medium" style={{ color: "var(--app-ink)" }}>
                {cat?.glyph} {cat?.label ?? r.category}
              </span>
              {sub ? <Tag tone="neutral">{sub.label}</Tag> : null}
              <StatusPill tone={statusTone(r.status)}>{r.status}</StatusPill>
              {showAge ? (
                <StatusPill tone={waitTone(days)}>
                  {days >= 1 ? `waiting ${days}d` : "arrived today"}
                </StatusPill>
              ) : null}
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
  // Triage order: the waiting reports first, oldest at the top (a stale
  // hazard report is the worst thing this page can hide), then the decided
  // log in the newest-first order the fetch already has.
  const pending = rows
    .filter((r) => r.status === "pending")
    .sort((a, b) => new Date(a.created_at ?? 0).getTime() - new Date(b.created_at ?? 0).getTime());
  const decided = rows.filter((r) => r.status !== "pending");
  const approved = rows.filter((r) => r.status === "approved").length;
  const rejected = rows.filter((r) => r.status === "rejected").length;
  const oldestDays = pending.length > 0 ? daysWaiting(pending[0].created_at) : 0;

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
                ...(pending.length > 0
                  ? [{
                      value: oldestDays >= 1 ? `${oldestDays}d` : "today",
                      label: "oldest waiting",
                      tone: waitTone(oldestDays),
                    }]
                  : []),
                { value: approved, label: "approved", tone: "positive" as Tone },
                { value: rejected, label: "rejected", tone: "muted" as Tone },
              ]}
            />
          </div>

          {pending.length > 0 && (
            <section className="mt-7">
              <SectionLabel>Waiting · oldest first</SectionLabel>
              <HairlineList>
                {pending.map((r, i) => (
                  <ReportRow key={r.id} r={r} first={i === 0} showAge />
                ))}
              </HairlineList>
            </section>
          )}

          {decided.length > 0 && (
            <section className="mt-7">
              <SectionLabel>Recently decided</SectionLabel>
              <HairlineList>
                {decided.map((r, i) => (
                  <ReportRow key={r.id} r={r} first={i === 0} />
                ))}
              </HairlineList>
            </section>
          )}
        </>
      )}
    </AdminShell>
  );
}
