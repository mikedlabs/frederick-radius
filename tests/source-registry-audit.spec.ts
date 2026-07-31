import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { parse } from "yaml";
import {
  auditSourceRows,
  REQUIRED_ACTIVE,
} from "@/../scripts/source-registry-audit";

type SourceRow = {
  id: string;
  status: string;
  collection?: "pipeline" | "runtime" | "workflow";
  transform_file?: string | null;
};

function manifestRows(): SourceRow[] {
  const text = readFileSync(resolve("data/sources.yaml"), "utf8");
  return (parse(text) as { sources: SourceRow[] }).sources;
}

describe("source registry audit", () => {
  it("accepts the checked-in manifest", () => {
    expect(auditSourceRows(manifestRows())).toEqual([]);
  });

  it("contracts every mounted local-information adapter as active runtime data", () => {
    expect(REQUIRED_ACTIVE).toMatchObject({
      google_news_rss: "runtime",
      reddit_frederick: "runtime",
      mta_marc_rt: "runtime",
      hood_athletics: "runtime",
      mount_athletics: "runtime",
      fcc_athletics: "runtime",
    });
  });

  it.each([
    "google_news_rss",
    "reddit_frederick",
    "mta_marc_rt",
    "hood_athletics",
    "mount_athletics",
    "fcc_athletics",
  ])("rejects %s when its ledger status drifts back to pending", (id) => {
    const rows = manifestRows().map((row) =>
      row.id === id
        ? {
            ...row,
            status: "pending_review",
            collection: undefined,
          }
        : row,
    );

    expect(auditSourceRows(rows)).toContain(
      `${id}: implemented source must be active/runtime, found pending_review/unowned`,
    );
  });
});
