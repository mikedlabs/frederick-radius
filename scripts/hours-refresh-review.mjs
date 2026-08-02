#!/usr/bin/env node
/**
 * Build the human review manifest for a rolling hours refresh.
 *
 * The data-steward PR can change thousands of generated lines. This report
 * reduces that diff to the decisions a reviewer must actually inspect:
 * public listings added or removed, newly closed provider statuses, reopenings,
 * and the verified-hours coverage gain. It never approves or changes a status.
 */
import { execFileSync } from "node:child_process";
import { appendFileSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const CLOSED_STATUSES = new Set([
  "CLOSED_TEMPORARILY",
  "CLOSED_PERMANENTLY",
]);

function dataKeys(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return [];
  return Object.keys(value).filter((key) => !key.startsWith("_"));
}

function statusOf(artifact, slug) {
  const value = artifact?.[slug]?.business_status;
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function reviewedStatusEvidence(statusOverrides, slug, providerStatus, asOf) {
  const override = statusOverrides?.[slug];
  if (!override || typeof override !== "object" || Array.isArray(override)) {
    return undefined;
  }
  const expectedClosure =
    providerStatus === "CLOSED_PERMANENTLY"
      ? "closed_permanently"
      : providerStatus === "CLOSED_TEMPORARILY"
        ? "closed_temporarily"
        : undefined;
  if (
    !expectedClosure ||
    (override.status !== expectedClosure && override.status !== "operational") ||
    !/^\d{4}-\d{2}-\d{2}$/.test(override.effective_at ?? "") ||
    !/^\d{4}-\d{2}-\d{2}$/.test(override.review_after ?? "") ||
    override.effective_at > asOf ||
    override.review_after < asOf ||
    typeof override.note !== "string" ||
    !override.note.trim()
  ) {
    return undefined;
  }
  try {
    return new URL(override.source).protocol === "https:"
      ? override
      : undefined;
  } catch {
    return undefined;
  }
}

function checkedAt(artifact, slug) {
  const value = artifact?.[slug]?.refreshed_at;
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function placeIndex(places) {
  return new Map(
    (Array.isArray(places) ? places : []).flatMap((place) => {
      const slug = typeof place?.slug === "string" ? place.slug.trim() : "";
      return slug ? [[slug, place]] : [];
    }),
  );
}

function publishedHoursCount(places) {
  return (Array.isArray(places) ? places : []).filter(
    (place) =>
      place?.hours_verified === true &&
      place.hours &&
      typeof place.hours === "object" &&
      !Array.isArray(place.hours) &&
      Object.keys(place.hours).length > 0,
  ).length;
}

function artifactNumber(artifact, key) {
  const value = artifact?._meta?.[key];
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function signed(value) {
  return value > 0 ? `+${value}` : String(value);
}

function text(value, fallback = "—") {
  const normalized = String(value ?? "")
    .replace(/\|/g, "\\|")
    .replace(/\s+/g, " ")
    .trim();
  return normalized || fallback;
}

function placeLabel(place, slug) {
  return text(place?.name, slug);
}

function markdownTable(headers, rows, emptyMessage) {
  if (rows.length === 0) return `${emptyMessage}\n`;
  return [
    `| ${headers.join(" | ")} |`,
    `| ${headers.map(() => "---").join(" | ")} |`,
    ...rows.map((row) => `| ${row.map((cell) => text(cell)).join(" | ")} |`),
    "",
  ].join("\n");
}

/**
 * @param {{
 *   beforeArtifact: Record<string, any>;
 *   afterArtifact: Record<string, any>;
 *   beforePlaces: Array<Record<string, any>>;
 *   afterPlaces: Array<Record<string, any>>;
 *   statusOverrides?: Record<string, any>;
 * }} input
 */
export function analyzeHoursRefreshChange({
  beforeArtifact,
  afterArtifact,
  beforePlaces,
  afterPlaces,
  statusOverrides = {},
}) {
  const before = placeIndex(beforePlaces);
  const after = placeIndex(afterPlaces);
  const beforeSlugs = new Set(before.keys());
  const afterSlugs = new Set(after.keys());

  const publicAdditions = [...afterSlugs]
    .filter((slug) => !beforeSlugs.has(slug))
    .sort();
  const publicRemovals = [...beforeSlugs]
    .filter((slug) => !afterSlugs.has(slug))
    .sort();

  const artifactSlugs = new Set([
    ...dataKeys(beforeArtifact),
    ...dataKeys(afterArtifact),
  ]);
  const statusTransitions = [...artifactSlugs]
    .flatMap((slug) => {
      const from = statusOf(beforeArtifact, slug);
      const to = statusOf(afterArtifact, slug);
      if (from === to) return [];
      return [
        {
          slug,
          from,
          to,
          checked_at: checkedAt(afterArtifact, slug),
          public_before: beforeSlugs.has(slug),
          public_after: afterSlugs.has(slug),
        },
      ];
    })
    .sort((a, b) => a.slug.localeCompare(b.slug));

  const newlyClosed = statusTransitions.filter((entry) =>
    CLOSED_STATUSES.has(entry.to),
  );
  const reopenings = statusTransitions.filter(
    (entry) => CLOSED_STATUSES.has(entry.from) && entry.to === "OPERATIONAL",
  );
  const asOf =
    typeof afterArtifact?._meta?.generated_at === "string"
      ? afterArtifact._meta.generated_at.slice(0, 10)
      : new Date().toISOString().slice(0, 10);
  const reviewedStatuses = new Map(
    newlyClosed.flatMap((entry) => {
      const evidence = reviewedStatusEvidence(
        statusOverrides,
        entry.slug,
        entry.to,
        asOf,
      );
      return evidence ? [[entry.slug, evidence]] : [];
    }),
  );
  const unreviewedPublicRemovals = publicRemovals.filter(
    (slug) => !reviewedStatuses.has(slug),
  );
  const unreviewedNewlyClosed = newlyClosed.filter(
    (entry) =>
      (entry.public_before || entry.public_after) &&
      !reviewedStatuses.has(entry.slug),
  );
  const reviewReasons = [];
  if (publicAdditions.length > 0) {
    reviewReasons.push(`${publicAdditions.length} public listing addition(s)`);
  }
  if (unreviewedPublicRemovals.length > 0) {
    reviewReasons.push(
      `${unreviewedPublicRemovals.length} unreviewed public listing removal(s)`,
    );
  }
  if (unreviewedNewlyClosed.length > 0) {
    reviewReasons.push(
      `${unreviewedNewlyClosed.length} unreviewed closed-status transition(s)`,
    );
  }

  return {
    generated_at:
      typeof afterArtifact?._meta?.generated_at === "string"
        ? afterArtifact._meta.generated_at
        : undefined,
    before_public_places: before.size,
    after_public_places: after.size,
    before_published_hours: publishedHoursCount(beforePlaces),
    after_published_hours: publishedHoursCount(afterPlaces),
    before_snapshot_rows: dataKeys(beforeArtifact).length,
    after_snapshot_rows: dataKeys(afterArtifact).length,
    before_snapshot_fresh_schedules: artifactNumber(
      beforeArtifact,
      "fresh_schedule_rows",
    ),
    after_snapshot_fresh_schedules: artifactNumber(
      afterArtifact,
      "fresh_schedule_rows",
    ),
    unmatched_rows: artifactNumber(afterArtifact, "unmatched_rows"),
    publicAdditions,
    publicRemovals,
    unreviewedPublicRemovals,
    statusTransitions,
    newlyClosed,
    unreviewedNewlyClosed,
    reviewedStatuses,
    reopenings,
    review_required: reviewReasons.length > 0,
    reviewReasons,
    before,
    after,
  };
}

export function renderHoursRefreshReview(analysis) {
  const generated = analysis.generated_at
    ? new Date(analysis.generated_at).toISOString()
    : "unknown";
  const reviewLine = analysis.review_required
    ? `**Manual review required:** ${analysis.reviewReasons.join("; ")}.`
    : "**No unreviewed public catalog or public closure transition requires manual review.**";

  const removedRows = analysis.publicRemovals.map((slug) => {
    const place = analysis.before.get(slug);
    const transition = analysis.statusTransitions.find(
      (entry) => entry.slug === slug,
    );
    const evidence = analysis.reviewedStatuses.get(slug);
    return [
      `\`${slug}\``,
      placeLabel(place, slug),
      place?.category,
      place?.municipality,
      transition?.to ?? "No new provider closure",
      transition?.checked_at,
      evidence ? `[Recorded](${evidence.source})` : "Review required",
    ];
  });
  const addedRows = analysis.publicAdditions.map((slug) => {
    const place = analysis.after.get(slug);
    const transition = analysis.statusTransitions.find(
      (entry) => entry.slug === slug,
    );
    return [
      `\`${slug}\``,
      placeLabel(place, slug),
      place?.category,
      place?.municipality,
      transition?.to,
    ];
  });
  const closedRows = analysis.newlyClosed.map((entry) => {
    const place = analysis.before.get(entry.slug) ?? analysis.after.get(entry.slug);
    const evidence = analysis.reviewedStatuses.get(entry.slug);
    return [
      `\`${entry.slug}\``,
      placeLabel(place, entry.slug),
      entry.public_before ? "yes" : "no",
      entry.from,
      entry.to,
      entry.checked_at,
      evidence
        ? `[Recorded](${evidence.source})`
        : entry.public_before || entry.public_after
          ? "Review required"
          : "Not public",
    ];
  });
  const reopeningRows = analysis.reopenings.map((entry) => {
    const place = analysis.before.get(entry.slug) ?? analysis.after.get(entry.slug);
    return [
      `\`${entry.slug}\``,
      placeLabel(place, entry.slug),
      entry.public_after ? "yes" : "no",
      entry.from,
      entry.to,
      entry.checked_at,
    ];
  });

  return [
    "# Hours refresh review",
    "",
    `Generated from the committed baseline and the refreshed artifacts at ${generated}.`,
    "This report is a review aid. It does not approve, reject, or change a place status.",
    "",
    reviewLine,
    "",
    "## Coverage delta",
    "",
    "| Metric | Before | After | Change |",
    "| --- | ---: | ---: | ---: |",
    `| Public places | ${analysis.before_public_places} | ${analysis.after_public_places} | ${signed(analysis.after_public_places - analysis.before_public_places)} |`,
    `| Public places with publishable verified hours | ${analysis.before_published_hours} | ${analysis.after_published_hours} | ${signed(analysis.after_published_hours - analysis.before_published_hours)} |`,
    `| Hours snapshot rows | ${analysis.before_snapshot_rows} | ${analysis.after_snapshot_rows} | ${signed(analysis.after_snapshot_rows - analysis.before_snapshot_rows)} |`,
    `| Fresh schedule rows in snapshot | ${analysis.before_snapshot_fresh_schedules} | ${analysis.after_snapshot_fresh_schedules} | ${signed(analysis.after_snapshot_fresh_schedules - analysis.before_snapshot_fresh_schedules)} |`,
    `| Unmatched database rows ignored | — | ${analysis.unmatched_rows} | — |`,
    "",
    "## Public catalog changes",
    "",
    "### Removed from public discovery",
    "",
    markdownTable(
      [
        "Slug",
        "Place",
        "Category",
        "Town",
        "New status",
        "Checked at",
        "Status evidence",
      ],
      removedRows,
      "No public listings were removed.",
    ),
    "An unreviewed removal must be checked before merge. Confirm a closure against the business or another current official source; inspect any removal without a new closed status as a loader or catalog regression.",
    "",
    "### Added to public discovery",
    "",
    markdownTable(
      ["Slug", "Place", "Category", "Town", "Provider status"],
      addedRows,
      "No public listings were added.",
    ),
    "## Provider status transitions",
    "",
    "### Newly closed",
    "",
    markdownTable(
      [
        "Slug",
        "Place",
        "Public before",
        "From",
        "To",
        "Checked at",
        "Review evidence",
      ],
      closedRows,
      "No new closed statuses were observed.",
    ),
    "### Reopened",
    "",
    markdownTable(
      ["Slug", "Place", "Public after", "From", "To", "Checked at"],
      reopeningRows,
      "No reopenings were observed.",
    ),
    "## Reviewer checklist",
    "",
    "- Verify every unreviewed public removal and addition before merging the data PR.",
    "- For a newly closed place, prefer the business's own current notice or another official source over a directory echo.",
    "- Confirm that the coverage gain comes from current schedules and that unmatched rows did not erase a canonical identity.",
    "- Do not edit generated client data by hand. Correct the source or reviewed override, rebuild, and regenerate this report.",
    "",
  ].join("\n");
}

function jsonAtHead(root, relativePath) {
  const source = execFileSync("git", ["show", `HEAD:${relativePath}`], {
    cwd: root,
    encoding: "utf8",
    maxBuffer: 32 * 1024 * 1024,
  });
  return JSON.parse(source);
}

function jsonAtWorktree(root, relativePath) {
  return JSON.parse(readFileSync(path.join(root, relativePath), "utf8"));
}

export function main() {
  const root = process.cwd();
  const artifactPath = "src/data/places-hours-refresh.json";
  const clientPath = "src/data/places-client.json";
  const outputPath = path.join(root, "docs", "hours-refresh-review.md");
  const analysis = analyzeHoursRefreshChange({
    beforeArtifact: jsonAtHead(root, artifactPath),
    afterArtifact: jsonAtWorktree(root, artifactPath),
    beforePlaces: jsonAtHead(root, clientPath),
    afterPlaces: jsonAtWorktree(root, clientPath),
    statusOverrides: jsonAtWorktree(
      root,
      "src/data/place-status-overrides.json",
    ),
  });
  writeFileSync(outputPath, renderHoursRefreshReview(analysis));

  const outputs = {
    review_required: analysis.review_required,
    public_additions: analysis.publicAdditions.length,
    public_removals: analysis.publicRemovals.length,
    newly_closed: analysis.newlyClosed.length,
    reopenings: analysis.reopenings.length,
  };
  if (process.env.GITHUB_OUTPUT) {
    appendFileSync(
      process.env.GITHUB_OUTPUT,
      `${Object.entries(outputs)
        .map(([key, value]) => `${key}=${value}`)
        .join("\n")}\n`,
    );
  }
  console.log(
    `Wrote ${outputPath}. Review required: ${analysis.review_required ? "yes" : "no"}; ` +
      `${analysis.publicRemovals.length} public removal(s), ` +
      `${analysis.publicAdditions.length} public addition(s), ` +
      `${analysis.newlyClosed.length} new closed status(es).`,
  );
}

const invokedPath = process.argv[1]
  ? pathToFileURL(path.resolve(process.argv[1])).href
  : "";
if (import.meta.url === invokedPath) {
  try {
    main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
