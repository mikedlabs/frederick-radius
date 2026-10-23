import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { parse } from "yaml";
import { MERCHANT_HOURS_SOURCES } from "@/lib/merchant-hours";
import { buildSourceRegistryArtifact } from "@/../scripts/build-source-registry";
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
  refresh_cadence?: string;
  publication_applicability?: string;
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

  it("maps every merchant binding to one source owner, including both Common Market groceries", () => {
    const registry = buildSourceRegistryArtifact(readFileSync(resolve("data/sources.yaml"), "utf8"));
    const commonUrl = "https://www.commonmarket.coop/";
    const bindings = MERCHANT_HOURS_SOURCES.filter((source) => source.url === commonUrl);
    expect(bindings.map((source) => source.slug)).toEqual(["common-market-frederick", "common-market"]);
    expect(bindings.map((source) => source.ledger_id)).toEqual(["common_market_hours", "common_market_hours"]);
    for (const source of MERCHANT_HOURS_SOURCES) {
      const owners = registry.filter((row) => row.evidenceAliases.includes(source.url));
      expect(owners.map((row) => row.id)).toEqual([source.ledger_id]);
      expect(owners[0]?.url).toBe(source.url);
    }
  });

  it("still rejects a second ledger owner for the shared Common Market URL", () => {
    const row = (id: string) => `  - id: ${id}\n    name: Official store hours\n    status: active\n    collection: workflow\n    refresh_cadence: daily\n    evidence_aliases: [https://www.commonmarket.coop/]\n`;
    expect(() => buildSourceRegistryArtifact(`sources:\n${row("common_market_hours")}${row("other_owner")}`))
      .toThrow("https://www.commonmarket.coop/: evidence alias belongs to both common_market_hours and other_owner.");
  });

  it("gives each qualified hours identity one daily native owner without claiming a collection success", () => {
    const registry = buildSourceRegistryArtifact(readFileSync(resolve("data/sources.yaml"), "utf8"));
    const ids = ["museum_civil_war_medicine_hours", "tasting_room_hours", "hootch_banter_hours"];
    for (const id of ids) {
      const binding = MERCHANT_HOURS_SOURCES.find(source => source.ledger_id === id)!;
      expect(binding).toBeDefined();
      const owners = registry.filter(row => row.id === id);
      expect(owners).toHaveLength(1);
      expect(owners[0]).toMatchObject({ url: binding.url, collection: "workflow", status: "active", refreshCadence: "daily", snapshotCadence: "daily", manifestLastSuccess: null, schemaFile: "src/lib/merchant-hours.ts", transformFile: "scripts/lib/qualified-merchant-hours.ts", evidenceAliases: [id, binding.url].sort(), publicationApplicability: "required" });
      expect("max_response_bytes" in binding).toBe(false);
    }
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

  it("fails closed when non-publication applicability is broadened", () => {
    const rows = manifestRows();
    const addressIndex = rows.findIndex(
      (row) => row.id === "fc_address_points_complete",
    );
    expect(addressIndex).toBeGreaterThanOrEqual(0);

    rows[addressIndex] = {
      ...rows[addressIndex],
      refresh_cadence: "daily",
      publication_applicability: "not_applicable",
    };
    rows[0] = {
      ...rows[0],
      publication_applicability: "sometimes",
    };

    expect(auditSourceRows(rows)).toEqual(
      expect.arrayContaining([
        "fc_address_points_complete: publication_applicability=not_applicable requires active/runtime/on_demand with rows_required=false and no snapshot or change cadence",
        `${rows[0]?.id}: unsupported publication_applicability=sometimes`,
      ]),
    );
  });

  it("contracts every mounted local-information adapter as active runtime data", () => {
    expect(REQUIRED_ACTIVE).toMatchObject({
      google_news_rss: "runtime",
      city_official_news: "runtime",
      county_official_news: "runtime",
      city_official_releases: "runtime",
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
    "city_official_news",
    "county_official_news",
    "city_official_releases",
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
