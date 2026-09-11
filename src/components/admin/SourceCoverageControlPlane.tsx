import {
  Disclosure,
  EmptyState,
  Section,
  StatusPill,
  Table,
  TBody,
  Td,
  Th,
  THead,
  Tr,
} from "@/components/admin/kit";
import {
  SOURCE_COVERAGE_STAGE_LABELS,
  type SourceCoverageReport,
  type SourceCoverageStage,
} from "@/lib/quality/source-coverage";

const STAGES: SourceCoverageStage[] = [
  "configured",
  "observed",
  "normalized",
  "published",
  "surface",
];

function sourceHost(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "Source";
  }
}

function cadenceLabel(
  refresh: string,
  snapshot: string | null,
  change: string | null,
): string {
  return [
    `Refresh ${refresh}`,
    snapshot ? `snapshot ${snapshot}` : null,
    change ? `change ${change}` : null,
  ]
    .filter(Boolean)
    .join(" · ");
}

export function SourceCoverageControlPlane({
  report,
}: {
  report: SourceCoverageReport;
}) {
  const gaps = report.rows.filter(
    (row) => row.status === "active" && row.firstGap !== null,
  );

  return (
    <Section
      title="Source coverage control plane"
      aside={
        <StatusPill tone={report.complete === report.active ? "positive" : "warning"}>
          {report.complete}/{report.active} end to end
        </StatusPill>
      }
      description="Each count needs its own recorded proof. Configuration does not imply a successful probe, an HTTP response does not imply normalized data, and a declared product use does not imply current publication."
    >
      <ol className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-5" aria-label="Source lifecycle evidence">
        {STAGES.map((stage, index) => (
          <li
            key={stage}
            className="rounded-[var(--app-radius-md)] border bg-[var(--app-bg-elevated)] p-3"
            style={{ borderColor: "var(--app-border)" }}
          >
            <span
              className="block font-mono text-[10px] uppercase tracking-[0.09em]"
              style={{ color: "var(--app-ink-3)" }}
            >
              {index + 1}. {SOURCE_COVERAGE_STAGE_LABELS[stage]}
            </span>
            <span
              className="mt-1 block font-serif text-[24px] font-semibold leading-none tabular-nums"
              style={{ color: "var(--app-ink)" }}
            >
              {report.stageCounts[stage]}
              <span
                className="ml-1 font-sans text-[11px] font-normal"
                style={{ color: "var(--app-ink-3)" }}
              >
                / {report.active}
              </span>
            </span>
          </li>
        ))}
      </ol>

      {gaps.length === 0 ? (
        <EmptyState tone="positive">
          Every active source has evidence for all five lifecycle steps.
        </EmptyState>
      ) : (
        <Disclosure
          summary={`Show ${gaps.length} active source${gaps.length === 1 ? "" : "s"} with an unproven step`}
        >
          <Table>
            <THead>
              <Th>Source</Th>
              <Th>First unproven step</Th>
              <Th align="right">Proof</Th>
              <Th>Declared product use</Th>
            </THead>
            <TBody>
              {gaps.map((row) => (
                <Tr key={row.id}>
                  <Td>
                    <span className="block font-semibold">{row.name}</span>
                    <span
                      className="mt-0.5 block font-mono text-[10.5px]"
                      style={{ color: "var(--app-ink-3)" }}
                    >
                      {row.id}
                    </span>
                  </Td>
                  <Td>
                    <StatusPill tone="warning">
                      {row.firstGap
                        ? SOURCE_COVERAGE_STAGE_LABELS[row.firstGap]
                        : "None"}
                    </StatusPill>
                    {row.firstGap ? (
                      <span
                        className="mt-1 block max-w-[22rem] text-[11px] leading-snug"
                        style={{ color: "var(--app-ink-3)" }}
                      >
                        {row.stages[row.firstGap].detail}
                      </span>
                    ) : null}
                  </Td>
                  <Td align="right" mono>
                    {row.provedStages}/5
                  </Td>
                  <Td tone="muted">
                    {row.surfaceDescriptions.length
                      ? row.surfaceDescriptions.join("; ")
                      : "Not declared"}
                  </Td>
                </Tr>
              ))}
            </TBody>
          </Table>
        </Disclosure>
      )}

      <Disclosure summary={`Show metadata for all ${report.cataloged} cataloged sources`}>
        <Table>
          <THead>
            <Th>Source</Th>
            <Th>Rights</Th>
            <Th>Cadence</Th>
            <Th>Code</Th>
          </THead>
          <TBody>
            {report.rows.map((row) => (
              <Tr key={row.id}>
                <Td>
                  <span className="block font-semibold">{row.name}</span>
                  {row.url ? (
                    <a
                      className="mt-0.5 block text-[11px] underline-offset-2 hover:underline"
                      href={row.url}
                      target="_blank"
                      rel="noreferrer"
                      style={{ color: "var(--app-cool)" }}
                    >
                      {sourceHost(row.url)}
                    </a>
                  ) : (
                    <span
                      className="mt-0.5 block text-[11px]"
                      style={{ color: "var(--app-ink-3)" }}
                    >
                      No source URL recorded
                    </span>
                  )}
                </Td>
                <Td tone="muted">{row.license ?? "Not recorded"}</Td>
                <Td tone="muted">
                  {cadenceLabel(
                    row.refreshCadence,
                    row.snapshotCadence,
                    row.changeCadence,
                  )}
                </Td>
                <Td mono tone="muted">
                  {row.transformFile ?? row.schemaFile ?? "Not recorded"}
                </Td>
              </Tr>
            ))}
          </TBody>
        </Table>
      </Disclosure>
    </Section>
  );
}
