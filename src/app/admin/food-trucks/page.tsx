import type { Metadata } from "next";
import { desc } from "drizzle-orm";
import { Check, X, Truck } from "lucide-react";
import { getDb } from "@/lib/db/client";
import { food_truck_claims } from "@/lib/db/schema";
import { FOOD_TRUCK_BY_SLUG } from "@/data/food-trucks";
import {
  AdminShell,
  StatStrip,
  SectionLabel,
  HairlineList,
  AdminButton,
  Tag,
  StatusPill,
  EmptyState,
  AllClear,
  Notice,
  type Tone,
} from "@/components/admin/kit";
import { reviewFoodTruckClaim } from "./actions";

export const metadata: Metadata = {
  title: "Food-truck claims · Admin",
  robots: { index: false, follow: false },
};
export const dynamic = "force-dynamic";

type Row = typeof food_truck_claims.$inferSelect;

async function loadRows(): Promise<{ ok: true; rows: Row[] } | { ok: false; reason: string }> {
  const db = getDb();
  if (!db) return { ok: false, reason: "DATABASE_URL is not configured for this environment." };
  try {
    const rows = await db
      .select()
      .from(food_truck_claims)
      .orderBy(desc(food_truck_claims.created_at))
      .limit(100);
    return { ok: true, rows };
  } catch (err) {
    return {
      ok: false,
      reason:
        "Could not read food_truck_claims. Apply migration 0026_food_truck_beacons.sql by hand. " +
        (err instanceof Error ? err.message : ""),
    };
  }
}

function truckName(slug: string): string {
  return FOOD_TRUCK_BY_SLUG.get(slug)?.name ?? slug;
}

function statusTone(status: string): Tone {
  if (status === "approved") return "positive";
  if (status === "rejected") return "danger";
  return "neutral";
}

/** Whole days an item has been waiting. Nothing waits a negative day. */
function daysWaiting(created: Date | string | null): number {
  if (!created) return 0;
  return Math.max(0, Math.floor((Date.now() - new Date(created).getTime()) / 86_400_000));
}

/** Shared urgency scale, matching /admin/claims + /admin/reports. */
function waitTone(days: number): Tone {
  return days >= 7 ? "danger" : days >= 3 ? "warning" : "neutral";
}

export default async function FoodTruckClaimsPage() {
  const result = await loadRows();

  return (
    <AdminShell
      eyebrow="Moderation queue"
      title="Food-truck claims"
      intro={
        result.ok
          ? "Approve a claim to mint the operator's beacon link, then hand that link to them. Reject to dismiss."
          : undefined
      }
    >
      {!result.ok ? (
        <div className="mt-5">
          <Notice tone="warning">{result.reason}</Notice>
        </div>
      ) : (
        <Queue rows={result.rows} />
      )}
    </AdminShell>
  );
}

function Queue({ rows }: { rows: Row[] }) {
  const pending = rows
    .filter((r) => r.status === "pending")
    .sort((a, b) => new Date(a.created_at ?? 0).getTime() - new Date(b.created_at ?? 0).getTime());
  const decided = rows.filter((r) => r.status !== "pending");
  const oldestDays = pending.length > 0 ? daysWaiting(pending[0].created_at) : 0;

  return (
    <>
      <div className="mt-5">
        <StatStrip
          items={[
            { value: pending.length, label: "pending", tone: pending.length > 0 ? "brand" : "neutral" },
            ...(pending.length > 0
              ? [{ value: oldestDays >= 1 ? `${oldestDays}d` : "today", label: "oldest waiting", tone: waitTone(oldestDays) }]
              : []),
            { value: decided.length, label: "decided" },
          ]}
        />
      </div>

      <section className="mt-6">
        {pending.length === 0 ? (
          <AllClear>No food-truck claims are waiting for review.</AllClear>
        ) : (
          <>
            <SectionLabel>Oldest first</SectionLabel>
            <ul className="space-y-3">
              {pending.map((r) => (
                <li key={r.id}>
                  <ClaimCard row={r} />
                </li>
              ))}
            </ul>
          </>
        )}
      </section>

      {decided.length > 0 ? (
        <section className="mt-8">
          <SectionLabel>Recently decided</SectionLabel>
          {decided.length === 0 ? (
            <EmptyState tone="muted">Nothing decided yet.</EmptyState>
          ) : (
            <HairlineList>
              {decided.slice(0, 25).map((r, i) => {
                // Approving mints the operator's beacon token; surface the drop
                // link so the owner can copy it and send it to the operator.
                const outUrl = r.status === "approved" && r.token ? `/food-trucks/out?token=${r.token}` : null;
                return (
                  <li
                    key={r.id}
                    className="bg-[var(--app-bg-elevated)] px-3 py-2.5"
                    style={i > 0 ? { borderTop: "1px solid var(--app-border)" } : undefined}
                  >
                    <div className="flex items-center gap-3">
                      <span className="min-w-0 flex-1 truncate text-[13px]" style={{ color: "var(--app-ink-2)" }}>
                        {truckName(r.truck_slug)} · {r.operator_name}
                      </span>
                      <StatusPill tone={statusTone(r.status)}>{r.status}</StatusPill>
                    </div>
                    {outUrl ? (
                      <a
                        href={outUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="tap-44 mt-1 block truncate font-mono text-[11px]"
                        style={{ color: "var(--app-cool)" }}
                        title="Operator beacon link for this claim: send it to the operator"
                      >
                        {outUrl}
                      </a>
                    ) : null}
                  </li>
                );
              })}
            </HairlineList>
          )}
        </section>
      ) : null}
    </>
  );
}

function ClaimCard({ row }: { row: Row }) {
  const days = daysWaiting(row.created_at);
  return (
    <article className="rounded-[var(--app-radius-lg)] border bg-[var(--app-bg-elevated)] p-4" style={{ borderColor: "var(--app-border)" }}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Tag tone="brand">
            <Truck className="mr-1 inline h-3 w-3" strokeWidth={2.25} aria-hidden />
            Truck claim
          </Tag>
          <StatusPill tone={waitTone(days)}>{days >= 1 ? `waiting ${days}d` : "arrived today"}</StatusPill>
        </div>
        <span className="font-mono text-[11px]" style={{ color: "var(--app-ink-3)" }}>
          {row.created_at ? new Date(row.created_at).toLocaleString() : ""}
        </span>
      </div>

      <h3 className="mt-2 font-serif text-[18px] font-semibold" style={{ color: "var(--app-ink)" }}>
        {truckName(row.truck_slug)}
      </h3>
      <p className="mt-0.5 text-[12px]" style={{ color: "var(--app-ink-3)" }}>
        binds to truck: <code>{row.truck_slug}</code>
      </p>

      <dl className="mt-3 grid grid-cols-[minmax(0,6rem)_1fr] gap-x-3 gap-y-1.5 text-[12.5px]">
        <dt className="font-mono text-[11px] uppercase tracking-[0.06em]" style={{ color: "var(--app-ink-3)" }}>Operator</dt>
        <dd style={{ color: "var(--app-ink)" }}>{row.operator_name}</dd>
        <dt className="font-mono text-[11px] uppercase tracking-[0.06em]" style={{ color: "var(--app-ink-3)" }}>Contact</dt>
        <dd className="break-words" style={{ color: "var(--app-ink)" }}>{row.contact}</dd>
      </dl>

      <form action={reviewFoodTruckClaim} className="mt-4 grid grid-cols-2 gap-2">
        <input type="hidden" name="id" value={row.id} />
        <AdminButton type="submit" name="decision" value="rejected" variant="danger" icon={X} className="w-full justify-center">
          Reject
        </AdminButton>
        <AdminButton type="submit" name="decision" value="approved" variant="positive" icon={Check} className="w-full justify-center">
          Approve
        </AdminButton>
      </form>
    </article>
  );
}
