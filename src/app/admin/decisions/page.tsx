import type { Metadata } from "next";
import { sql } from "drizzle-orm";
import {
  AdminShell,
  HairlineList,
  HairlineRow,
  Notice,
  SectionLabel,
  StatStrip,
  StatusPill,
} from "@/components/admin/kit";
import { getDb } from "@/lib/db/client";
import { decision_daily_aggregates } from "@/lib/db/schema";
import {
  decisionLabel,
  decisionRate,
  summarizeDecisionRows,
  type DecisionAggregateRow,
} from "./model";

export const metadata: Metadata = {
  title: "Decision funnel",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

const WINDOW_DAYS = 14;

export default async function DecisionFunnelAdmin() {
  const db = getDb();
  let rows: DecisionAggregateRow[] = [];
  let unavailable: "database" | "migration" | null = db ? null : "database";

  if (db) {
    try {
      rows = await db
        .select({
          day: decision_daily_aggregates.day,
          surface: decision_daily_aggregates.surface,
          stage: decision_daily_aggregates.stage,
          entityKind: decision_daily_aggregates.entity_kind,
          position: decision_daily_aggregates.position,
          action: decision_daily_aggregates.action,
          count: decision_daily_aggregates.count,
        })
        .from(decision_daily_aggregates)
        .where(
          sql`${decision_daily_aggregates.day} >=
            (now() at time zone 'America/New_York')::date - ${WINDOW_DAYS - 1}`,
        );
    } catch {
      unavailable = "migration";
    }
  }

  const summary = summarizeDecisionRows(rows);
  const helpfulRate = decisionRate(summary.helpful, summary.feedback);

  return (
    <AdminShell
      eyebrow="Product signal"
      title="Decision funnel"
      aside={`${WINDOW_DAYS} Eastern days`}
      intro={
        <>
          Did a recommendation become a useful next move? These are anonymous
          daily counts. Radius does not store a person, query, answer, route,
          entity, location, or IP in this rollup.
        </>
      }
    >
      {unavailable && (
        <div className="mt-6">
          <Notice tone="warning">
            {unavailable === "database"
              ? "The database is not configured in this deployment."
              : "The decision rollup is not available yet. Apply drizzle/0043_decision_daily_aggregates.sql, then reload."}
          </Notice>
        </div>
      )}

      <section className="mt-6">
        <SectionLabel>Impressions → opens → actions → feedback</SectionLabel>
        <StatStrip
          items={[
            { value: summary.impressions.toLocaleString(), label: "impressions" },
            { value: summary.opens.toLocaleString(), label: "opens" },
            { value: summary.actions.toLocaleString(), label: "actions" },
            { value: summary.feedback.toLocaleString(), label: "feedback" },
          ]}
        />
        <p className="mt-2 text-[11.5px]" style={{ color: "var(--app-ink-3)" }}>
          {decisionRate(summary.opens, summary.impressions)} opened after an
          impression · {decisionRate(summary.actions, summary.opens)} took an
          action after an open
        </p>
      </section>

      <section className="mt-7">
        <SectionLabel aside={<StatusPill tone="positive">{helpfulRate} helpful</StatusPill>}>
          Answer feedback
        </SectionLabel>
        <StatStrip
          items={[
            { value: summary.helpful.toLocaleString(), label: "helpful", tone: "positive" },
            { value: summary.notRelevant.toLocaleString(), label: "not relevant", tone: "warning" },
            { value: summary.wrong.toLocaleString(), label: "wrong", tone: "danger" },
          ]}
        />
      </section>

      <section className="mt-7">
        <SectionLabel>By surface</SectionLabel>
        {summary.surfaces.length > 0 ? (
          <HairlineList>
            {summary.surfaces.map((surface, index) => (
              <HairlineRow
                key={surface.surface}
                index={index}
                title={decisionLabel(surface.surface)}
                subtitle={`${surface.opens.toLocaleString()} opens · ${surface.actions.toLocaleString()} actions · ${surface.feedback.toLocaleString()} feedback`}
                meta={surface.impressions.toLocaleString()}
              />
            ))}
          </HairlineList>
        ) : (
          <Notice tone="muted">No decision activity has been counted in this window.</Notice>
        )}
      </section>

      {summary.actionBreakdown.length > 0 && (
        <section className="mt-7">
          <SectionLabel>Actions taken</SectionLabel>
          <HairlineList>
            {summary.actionBreakdown.map((action, index) => (
              <HairlineRow
                key={action.action}
                index={index}
                title={decisionLabel(action.action)}
                meta={action.count.toLocaleString()}
              />
            ))}
          </HairlineList>
        </section>
      )}

      <p className="mt-7 text-[11px] leading-relaxed" style={{ color: "var(--app-ink-3)" }}>
        Opt-out is honored before any aggregate or member write. The database
        contract accepts only fixed surfaces, stages, entity kinds, positions,
        and actions.
      </p>
    </AdminShell>
  );
}
