import type { Tone } from "@/components/admin/kit";
import {
  Disclosure,
  EmptyState,
  Section,
  StatCards,
  StatusPill,
  Table,
  TBody,
  Td,
  Th,
  THead,
  Tr,
} from "@/components/admin/kit";
import type { FeedSnapshotStorageTelemetry } from "@/lib/integrations/feed-snapshot";
import {
  sourceLedgerNeedsAction,
  type SourceLedgerRow,
  type SourceLedgerState,
} from "@/lib/quality/source-ledger";

const STATE_LABEL: Record<SourceLedgerState, string> = {
  failing: "Failed",
  running: "Running",
  unconfigured: "Not configured",
  invalid_evidence: "Invalid evidence",
  stale: "Stale",
  awaiting_publish: "Awaiting publish",
  required_empty: "Unexpectedly empty",
  unknown: "Unknown",
  healthy_empty: "Healthy, no rows",
  healthy: "Healthy",
  inactive: "Not active",
};

function stateTone(state: SourceLedgerState): Tone {
  if (state === "healthy" || state === "healthy_empty") return "positive";
  if (state === "inactive" || state === "unknown") return "muted";
  if (state === "running") return "cool";
  return "warning";
}

function formatAt(value: string | null): string {
  if (!value) return "Not recorded";
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) return "Invalid timestamp";
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(parsed);
}

function LedgerTable({ rows }: { rows: SourceLedgerRow[] }) {
  return (
    <Table>
      <THead>
        <Th>Source</Th>
        <Th>Status</Th>
        <Th>Attempt</Th>
        <Th>Success</Th>
        <Th>Published</Th>
        <Th align="right">Rows</Th>
      </THead>
      <TBody>
        {rows.map((row) => (
          <Tr key={row.id}>
            <Td>
              <span className="block font-semibold">{row.name}</span>
              <span
                className="mt-0.5 block max-w-[26rem] text-[11px] leading-snug"
                style={{ color: "var(--app-ink-3)" }}
              >
                {row.reason}
              </span>
            </Td>
            <Td>
              <StatusPill tone={stateTone(row.state)}>
                {STATE_LABEL[row.state]}
              </StatusPill>
            </Td>
            <Td tone="muted">{formatAt(row.lastAttemptAt)}</Td>
            <Td tone="muted">{formatAt(row.lastSuccessAt)}</Td>
            <Td tone="muted">{formatAt(row.lastPublishedAt)}</Td>
            <Td align="right" mono>
              {row.recordCount === null ? "Not recorded" : row.recordCount.toLocaleString()}
            </Td>
          </Tr>
        ))}
      </TBody>
    </Table>
  );
}

export function SourceHealthLedger({ rows }: { rows: SourceLedgerRow[] }) {
  const active = rows.filter((row) => row.state !== "inactive");
  const problems = active.filter(sourceLedgerNeedsAction);
  const healthy = active.filter((row) => !sourceLedgerNeedsAction(row));
  const inactive = rows.filter((row) => row.state === "inactive");

  return (
    <Section
      title="Source health ledger"
      aside={
        <StatusPill tone={problems.length === 0 ? "positive" : "warning"}>
          {problems.length === 0
            ? "All observed sources are healthy"
            : `${problems.length} need attention`}
        </StatusPill>
      }
      description="Configuration, collection, and publication applicability are tracked separately. Availability requires current publication evidence unless a bounded on-demand adapter explicitly has no publication step."
    >
      {problems.length === 0 ? (
        <EmptyState tone="positive">
          Every active source with recorded evidence is current.
        </EmptyState>
      ) : (
        <div className="mt-3">
          <LedgerTable rows={problems} />
        </div>
      )}

      {healthy.length > 0 && (
        <Disclosure summary={`Show ${healthy.length} healthy source${healthy.length === 1 ? "" : "s"}`}>
          <LedgerTable rows={healthy} />
        </Disclosure>
      )}

      {inactive.length > 0 && (
        <Disclosure summary={`Show ${inactive.length} sources that are not active`}>
          <LedgerTable rows={inactive} />
        </Disclosure>
      )}
    </Section>
  );
}

export function FeedSnapshotStorage({
  telemetry,
}: {
  telemetry: FeedSnapshotStorageTelemetry | null;
}) {
  const duplicateLabel = telemetry
    ? `${telemetry.duplicateCountCapped ? "At least " : ""}${telemetry.duplicateCandidates.toLocaleString()}`
    : "Not available";
  return (
    <Section
      title="Snapshot storage"
      aside={
        telemetry ? (
          <StatusPill
            tone={telemetry.duplicateCandidates > 0 ? "warning" : "positive"}
          >
            {telemetry.duplicateCandidates > 0
              ? "Compaction available"
              : "No completed-day duplicates"}
          </StatusPill>
        ) : (
          <StatusPill tone="warning">Telemetry unavailable</StatusPill>
        )
      }
      description="This telemetry uses bounded reads. It does not run a production deletion."
    >
      {!telemetry ? (
        <EmptyState>
          Snapshot storage telemetry is unavailable in this environment.
        </EmptyState>
      ) : (
        <>
          <div className="mt-3">
            <StatCards
              items={[
                {
                  value: `~${telemetry.approximateRows.toLocaleString()}`,
                  label: "Estimated rows",
                },
                {
                  value: `${(telemetry.totalBytes / 1_048_576).toFixed(1)} MB`,
                  label: "Table and indexes",
                },
                {
                  value: telemetry.rowsLast24Hours.toLocaleString(),
                  label: "Rows written in 24 hours",
                },
                {
                  value: duplicateLabel,
                  label: "Completed-day duplicates",
                  tone:
                    telemetry.duplicateCandidates > 0
                      ? "warning"
                      : "positive",
                },
              ]}
            />
          </div>
          <p
            className="mt-2 text-[11px] leading-relaxed"
            style={{ color: "var(--app-ink-3)" }}
          >
            The maintenance command defaults to a dry run. An applied batch
            removes no more than 2,000 rows and keeps at least one snapshot for
            each source on every UTC day.
          </p>
        </>
      )}
    </Section>
  );
}
