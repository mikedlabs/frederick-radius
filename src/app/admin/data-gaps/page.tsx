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
 * /admin/data-gaps — what the app is asked for and can't answer.
 *
 * The honest, evidence-based answer to "what data is missing," written by real
 * users: every search that returned nothing and every Ask that landed with no
 * grounded source is banked in search_misses, and this ranks the repeats. A
 * query that keeps showing up here is the next thing to add to the catalog.
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

  return (
    <AdminShell
      eyebrow="Data program"
      title="Data gaps"
      intro="What people searched or asked for and the app couldn't answer, ranked by how often. Each repeat is a candidate for the next thing to add."
      aside={`Last ${days || WINDOW_DAYS} days`}
    >
      <div className="mt-5">
        <StatStrip
          items={[
            { value: total, label: "Unmet queries" },
            { value: distinct, label: "Distinct intents" },
            { value: searchGaps.length, label: "From search" },
            { value: askGaps.length, label: "From Ask", tone: "brand" },
          ]}
        />
      </div>

      <Section
        title="Most-wanted, unanswered"
        description="Grouped by intent so spelling and punctuation fold together. The count is how many times it came up; treat the top of this list as your backlog."
      >
        {gaps.length === 0 ? (
          <EmptyState icon={Search}>
            Nothing logged in this window. Misses bank here as they happen once the
            table is live; a clean board means either a quiet window or a healthy
            catalog.
          </EmptyState>
        ) : (
          <Table>
            <THead>
              <Th>Query</Th>
              <Th>Source</Th>
              <Th align="right">Times</Th>
              <Th align="right">Last</Th>
            </THead>
            <TBody>
              {gaps.map((g, i) => (
                <Tr key={`${g.kind}:${g.query}:${i}`}>
                  <Td semibold>{g.query}</Td>
                  <Td>
                    <Tag tone={g.kind === "ask" ? "brand" : "cool"}>{g.kind}</Tag>
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
