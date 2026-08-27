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
  evidence_aliases?: string[];
  rows_required?: boolean;
  snapshot_cadence?: string;
  change_cadence?: string;
  transform_file?: string | null;
  policy_basis?: string;
  policy_reviewed_at?: string;
};

function manifestRows(): SourceRow[] {
  const text = readFileSync(resolve("data/sources.yaml"), "utf8");
  return (parse(text) as { sources: SourceRow[] }).sources;
}

describe("source registry audit", () => {
  it("accepts the checked-in manifest", () => {
    expect(auditSourceRows(manifestRows())).toEqual([]);
  });

  it("fails closed on unsupported snapshot and change cadences", () => {
    const rows = manifestRows();
    rows[0] = {
      ...rows[0],
      snapshot_cadence: "daily (best effort)",
      change_cadence: "on_demand",
    };

    expect(auditSourceRows(rows)).toEqual(
      expect.arrayContaining([
        `${rows[0]?.id}: unsupported snapshot_cadence=daily (best effort)`,
        `${rows[0]?.id}: unsupported change_cadence=on_demand`,
      ]),
    );
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

  it("keeps Visit Frederick dormant until written factual-reuse approval is documented", () => {
    const visitFrederick = manifestRows().find(
      (row) => row.id === "visit_frederick",
    );

    expect(visitFrederick).toMatchObject({ status: "pending_approval" });
    expect(visitFrederick?.collection).toBeUndefined();
    expect(visitFrederick?.evidence_aliases).toBeUndefined();
    expect(visitFrederick?.rows_required).toBeUndefined();
  });

  it.each(["google_places", "google_geocode", "google_routes"])(
    "keeps %s pending today but permits a fully documented future activation",
    (id) => {
      const pending = manifestRows().find((row) => row.id === id);
      expect(pending?.status).toBe("pending_review");

      const rows = manifestRows().map((row) =>
        row.id === id
          ? {
              ...row,
              status: "active",
              collection: "runtime" as const,
              transform_file: "src/lib/google-maps-policy.ts",
              policy_basis: "written_authorization",
              policy_reviewed_at: "2026-08-23",
            }
          : row,
      );

      expect(auditSourceRows(rows)).toEqual([]);
    },
  );

  it("rejects an active Google adapter without the recorded policy basis and review date", () => {
    const rows = manifestRows().map((row) =>
      row.id === "google_places"
        ? {
            ...row,
            status: "active",
            collection: "runtime" as const,
            transform_file: "src/lib/integrations/google-places.ts",
          }
        : row,
    );

    expect(auditSourceRows(rows)).toEqual(
      expect.arrayContaining([
        "google_places: active Google adapter requires policy_basis=written_authorization",
        "google_places: active Google adapter requires a valid policy_reviewed_at date",
      ]),
    );
  });

  it("rejects Visit Frederick evidence requirements while approval is pending", () => {
    const rows = manifestRows().map((row) =>
      row.id === "visit_frederick"
        ? { ...row, evidence_aliases: ["visit-frederick-snapshot"], rows_required: true }
        : row,
    );

    expect(auditSourceRows(rows)).toEqual(expect.arrayContaining([
      "visit_frederick: dormant approval-gated source must not require evidence aliases",
      "visit_frederick: dormant approval-gated source must not require evidence rows",
    ]));
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
