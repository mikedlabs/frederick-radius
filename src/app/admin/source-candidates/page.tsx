import type { Metadata } from "next";
import type { ReactNode } from "react";
import { ExternalLink, Inbox } from "lucide-react";
import {
  buildSourceCandidateIntegrationHandoff,
  loadSourceCandidateReviewRows,
  type SourceCandidateDecision,
  type SourceCandidateKind,
  type SourceCandidateReviewRow,
} from "@/lib/source-candidates";
import {
  AdminShell,
  EmptyState,
  Section,
  StatStrip,
  Tag,
} from "@/components/admin/kit";
import { reviewSourceCandidate } from "./actions";
import IntegrationHandoff from "./IntegrationHandoff";

export const metadata: Metadata = {
  title: "Source candidates · Admin",
  robots: { index: false, follow: false },
};
export const dynamic = "force-dynamic";

const KIND_LABELS: Record<SourceCandidateKind, string> = {
  "event-source": "Events",
  "food-truck-source": "Food trucks",
  "business-source": "Businesses",
  "civic-source": "Civic",
  "general-source": "General",
};

const NON_INTEGRATABLE_STATUSES = new Set([
  "error",
  "failed",
  "removed",
  "missing",
  "unavailable",
]);

function detailLines(row: SourceCandidateReviewRow): string[] {
  const lines: string[] = [];
  const changed = Array.isArray(row.details.changedFields)
    ? row.details.changedFields.filter((value): value is string => typeof value === "string")
    : [];
  const warnings = Array.isArray(row.details.parsingWarnings)
    ? row.details.parsingWarnings.filter((value): value is string => typeof value === "string")
    : [];
  if (changed.length) lines.push(`Changed: ${changed.join(", ")}`);
  if (warnings.length) lines.push(`Warnings: ${warnings.join(", ")}`);
  if (typeof row.details.httpStatus === "number") {
    lines.push(`Source returned HTTP ${row.details.httpStatus}`);
  }
  if (typeof row.details.errorCode === "string") {
    lines.push(`Collector result: ${row.details.errorCode}`);
  }
  const error = row.details.error && typeof row.details.error === "object"
    && !Array.isArray(row.details.error)
    ? row.details.error as Record<string, unknown>
    : null;
  if (typeof error?.code === "string") {
    lines.push(`Collector result: ${error.code}`);
  }
  if (typeof error?.httpStatus === "number") {
    lines.push(`Source returned HTTP ${error.httpStatus}`);
  }
  if (
    typeof row.details.previousHash === "string"
    && typeof row.details.currentHash === "string"
  ) {
    lines.push(
      `Fingerprint changed: ${row.details.previousHash.slice(0, 10)} to ${row.details.currentHash.slice(0, 10)}`,
    );
  }
  if (typeof row.details.contentHash === "string") {
    lines.push(`Content fingerprint: ${row.details.contentHash.slice(0, 12)}`);
  }
  return lines.slice(0, 3);
}

function ReviewButton({
  decisionKey,
  decision,
  children,
  active,
}: {
  decisionKey: string;
  decision: SourceCandidateDecision | "clear";
  children: ReactNode;
  active?: boolean;
}) {
  const action = reviewSourceCandidate.bind(null, decisionKey, decision);
  return (
    <form action={action}>
      <button
        type="submit"
        className="tap-44 rounded-full border px-3 py-1.5 text-xs font-medium transition hover:bg-[var(--app-bg-sunken)]"
        style={{
          borderColor: active ? "var(--app-brand)" : "var(--app-border)",
          background: active ? "var(--app-brand-tint)" : "var(--app-bg-elevated)",
          color: active ? "var(--app-brand)" : "var(--app-ink-2)",
        }}
      >
        {children}
      </button>
    </form>
  );
}

export default async function SourceCandidatesPage() {
  const inbox = await loadSourceCandidateReviewRows();
  if (!inbox.available) {
    return (
      <AdminShell
        eyebrow="Data program"
        title="Source candidates"
        intro="Tavily, Firecrawl, and Apify findings land here for review before any source can affect Radius."
      >
        <Section
          title="Inbox unavailable"
          description={inbox.reason}
        >
          <EmptyState icon={Inbox}>
            No review state is being inferred while the evidence store is unavailable.
          </EmptyState>
        </Section>
      </AdminShell>
    );
  }
  const rows = inbox.rows;
  const pending = rows.filter((row) => row.decision === null);
  const approved = rows.filter((row) => row.decision === "approved");
  const published = rows.filter((row) => row.decision === "published");
  const rejected = rows.filter((row) => row.decision === "rejected");

  return (
    <AdminShell
      eyebrow="Data program"
      title="Source candidates"
      intro="Tavily, Firecrawl, and Apify findings land here for review. Approving a candidate confirms that it is worth integrating; it does not publish the provider's claims into Radius."
    >
      <div className="mt-5">
        <StatStrip
          items={[
            { value: pending.length, label: "Waiting", tone: pending.length ? "brand" : "neutral" },
            { value: approved.length, label: "Approved", tone: "positive" },
            { value: published.length, label: "Integrated", tone: "cool" },
            { value: rejected.length, label: "Rejected", tone: "neutral" },
          ]}
        />
      </div>

      <Section
        title="Needs review"
        description="Open the original source, confirm what it can supply, and decide whether Radius should integrate it."
      >
        {pending.length === 0 ? (
          <EmptyState icon={Inbox}>No source candidates are waiting.</EmptyState>
        ) : (
          <CandidateList rows={pending} />
        )}
      </Section>

      {approved.length > 0 ? (
        <Section
          title="Approved for integration"
          description="These sources still need a deterministic adapter or an authorized owner feed before their facts can appear publicly."
        >
          <CandidateList rows={approved} />
        </Section>
      ) : null}

      {published.length > 0 || rejected.length > 0 ? (
        <Section
          title="Resolved"
          description="Integrated and rejected candidates remain visible so repeated discovery does not create a new mystery."
        >
          <CandidateList rows={[...published, ...rejected]} />
        </Section>
      ) : null}
    </AdminShell>
  );
}

function CandidateList({ rows }: { rows: SourceCandidateReviewRow[] }) {
  return (
    <ul className="mt-3 divide-y" style={{ borderColor: "var(--app-border)" }}>
      {rows.map((row) => {
        const evidence = detailLines(row);
        const canIntegrate = !NON_INTEGRATABLE_STATUSES.has(
          row.status.toLowerCase(),
        );
        const handoff = canIntegrate && row.decision === "approved"
          ? buildSourceCandidateIntegrationHandoff(row)
          : null;
        return (
          <li key={row.observationKey} className="py-4 first:pt-0">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-1.5">
                  <Tag tone={row.kind === "food-truck-source" ? "brand" : "cool"}>
                    {KIND_LABELS[row.kind]}
                  </Tag>
                  <Tag tone="neutral">{row.provider}</Tag>
                  <Tag tone={canIntegrate ? "cool" : "warning"}>{row.status}</Tag>
                  {row.expired ? <Tag tone="warning">Expired</Tag> : null}
                </div>
                <a
                  href={row.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="tap-44 mt-1.5 inline-flex max-w-full items-center gap-1.5 text-sm font-semibold"
                  style={{ color: "var(--app-ink)" }}
                >
                  <span className="truncate">{row.title}</span>
                  <ExternalLink className="h-3.5 w-3.5 shrink-0" aria-hidden />
                </a>
                <p className="mt-1 text-xs" style={{ color: "var(--app-ink-3)" }}>
                  {row.sourceDomain} · observed {row.observedAt.slice(0, 10)} · {Math.round(row.confidence * 100)}% discovery confidence
                  {row.observationCount > 1 ? ` · observed ${row.observationCount} times` : ""}
                </p>
                {row.reviewFor.length ? (
                  <p className="mt-1 text-xs" style={{ color: "var(--app-ink-2)" }}>
                    Review for {row.reviewFor.join(", ")}.
                  </p>
                ) : null}
                {evidence.length ? (
                  <ul className="mt-1 space-y-0.5 text-xs" style={{ color: "var(--app-ink-2)" }}>
                    {evidence.map((line) => <li key={line}>{line}</li>)}
                  </ul>
                ) : null}
                {!canIntegrate ? (
                  <p className="mt-1 text-xs font-medium" style={{ color: "var(--app-warning-press)" }}>
                    This is a source-health signal, not an integration candidate.
                  </p>
                ) : null}
                {handoff ? (
                  <IntegrationHandoff
                    title={handoff.title}
                    markdown={handoff.markdown}
                  />
                ) : null}
              </div>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              {canIntegrate && row.decision === null ? (
                <ReviewButton decisionKey={row.decisionKey} decision="approved">Approve for integration</ReviewButton>
              ) : null}
              {canIntegrate && row.decision === "approved" ? (
                <ReviewButton decisionKey={row.decisionKey} decision="published">Integration merged</ReviewButton>
              ) : null}
              {row.decision === null || row.decision === "approved" ? (
                <ReviewButton decisionKey={row.decisionKey} decision="rejected">
                  {canIntegrate ? "Reject" : "Dismiss signal"}
                </ReviewButton>
              ) : null}
              {row.decision ? (
                <ReviewButton decisionKey={row.decisionKey} decision="clear">Return to review</ReviewButton>
              ) : null}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
