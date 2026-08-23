import type { Metadata } from "next";
import { Search } from "lucide-react";
import { getDataGaps } from "@/lib/telemetry/searchGaps";
import {
  AdminShell,
  Section,
  StatStrip,
  Table,
  THead,
  Th,
  TBody,
  Tr,
  Td,
  Tag,
  EmptyState,
} from "@/components/admin/kit";

/**
 * /admin/data-gaps — historical misses, rechecked against the current build.
 *
 * The honest, evidence-based answer to "what data is missing," written by real
 * users: every search that returned nothing and every Ask that landed with no
 * grounded source is banked in search_misses, and this ranks the repeats. A
 * current candidate is shown for review, but never automatically promoted to
 * "fixed" merely because a result exists.
 *
 * Reads the DB server-side; empty and honest until misses accumulate (or if
 * the table isn't migrated). Stores only query text — no visitor identifier.
 */

export const metadata: Metadata = {
  title: "Data gaps · Admin",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

const WINDOW_DAYS = 30;

export default async function DataGapsPage() {
  const { gaps, total, distinct, days } = await getDataGaps({ days: WINDOW_DAYS, limit: 50 });
  const searchGaps = gaps.filter((g) => g.kind === "search");
  const askGaps = gaps.filter((g) => g.kind === "ask");
  const currentCandidates = gaps.filter((g) => g.status === "candidate-to-verify");
  const stillEmpty = gaps.filter((g) => g.status === "still-empty");

  return (
    <AdminShell
      eyebrow="Data program"
      title="Data gaps"
      intro="Queries that failed when they were logged, ranked by demand and checked against the current build. A result today is only a candidate to verify; Ask misses require a full retest."
      aside={`Last ${days || WINDOW_DAYS} days`}
    >
      <div className="mt-5">
        <StatStrip
          items={[
            { value: total, label: "Historical misses" },
            { value: distinct, label: "Recorded intents" },
            { value: stillEmpty.length, label: "Visible still empty", tone: "danger" },
            { value: currentCandidates.length, label: "Visible candidates", tone: "positive" },
          ]}
        />
      </div>

      <Section
        title="Historical misses, rechecked"
        description={`Grouped by intent so spelling and punctuation fold together. ${searchGaps.length} came from Search and ${askGaps.length} from Ask in the visible queue. “Candidate” means inspect the result; it does not mean the original need is proven solved.`}
      >
        {gaps.length === 0 ? (
          <EmptyState icon={Search}>
            No historical miss rows were available for this window. That can mean
            no misses were recorded, or that the telemetry table could not be read;
            it is not automatic proof that every query is healthy.
          </EmptyState>
        ) : (
          <Table>
            <THead>
              <Th>Query</Th>
              <Th>Source</Th>
              <Th>Status</Th>
              <Th align="right">Times</Th>
              <Th align="right">Last</Th>
            </THead>
            <TBody>
              {gaps.map((g, i) => (
                <Tr key={`${g.kind}:${g.query}:${i}`}>
                  <Td semibold>
                    <div>{g.query}</div>
                    {g.lead ? (
                      <div
                        className="mt-0.5 max-w-[24rem] text-[11px] font-normal"
                        style={{ color: "var(--app-ink-3)" }}
                      >
                        <a
                          href={g.lead.href}
                          target="_blank"
                          rel="noreferrer"
                          className="underline decoration-dotted underline-offset-2"
                        >
                          Review: {g.lead.title}
                        </a>
                        {g.candidateCount > 1
                          ? ` · ${g.candidateCount} current rows`
                          : ""}
                      </div>
                    ) : null}
                  </Td>
                  <Td>
                    <Tag tone={g.kind === "ask" ? "brand" : "cool"}>{g.kind}</Tag>
                  </Td>
                  <Td>
                    {g.status === "candidate-to-verify" ? (
                      <Tag tone="positive">Candidate</Tag>
                    ) : g.status === "still-empty" ? (
                      <Tag tone="danger">No candidate</Tag>
                    ) : g.status === "recheck-incomplete" ? (
                      <Tag tone="warning">Check incomplete</Tag>
                    ) : (
                      <Tag tone="warning">Retest Ask</Tag>
                    )}
                  </Td>
                  <Td align="right" nums semibold>
                    {g.count}
                  </Td>
                  <Td align="right" mono tone="muted">
                    {g.lastLabel}
                  </Td>
                </Tr>
              ))}
            </TBody>
          </Table>
        )}
      </Section>
    </AdminShell>
  );
}
