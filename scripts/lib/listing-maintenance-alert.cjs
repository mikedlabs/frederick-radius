"use strict";
// eslint-disable-next-line @typescript-eslint/no-require-imports -- GitHub Actions loads this bounded helper as CommonJS.
const { createHash } = require("node:crypto");

/** Only a complete reviewed-bundle report may close this monitor's own issue.
 * Existing unknown inventory is product debt, not a newly failed collection. */
function listingMaintenanceOutcome(report) {
  if (!report || report.schema_version !== 1 || report.read_model_state !== "committed" || !/^[a-f0-9]{40}$/.test(report.git_sha || "") || !Number.isFinite(Date.parse(report.as_of || "")) || !Array.isArray(report.rows) || !report.rows.length || report.rows.length > 20000 || !/^sha256:[a-f0-9]{64}$/.test(report.data_version || "") || report.scope?.inventory !== "promoted_public_client" || report.scope.decoded_photos !== "not_checked" || report.scope.served_deployment !== "not_checked" || report.scope.provider_requests !== 0 || report.summary?.listings !== report.rows.length) {
    throw new Error("Incomplete listing maintenance report.");
  }
  const states = new Set(["current", "stale", "needs_review", "unknown"]);
  const photoStates = new Set(["owned", "licensed_local", "licensed_remote", "provider_eligible", "missing"]);
  const photos = { owned: 0, licensed_local: 0, licensed_remote: 0, provider_eligible: 0, missing: 0 };
  const seen = new Set();
  const problems = [];
  const count = { current: 0, stale: 0, needs_review: 0, unknown: 0 };
  let expiredOfficial = 0; let heldOfficial = 0; let missingLocalPhoto = 0;
  for (const row of report.rows) {
    if (typeof row.slug !== "string" || !/^[a-z0-9][a-z0-9-]*$/.test(row.slug) || seen.has(row.slug) || !states.has(row.hours?.state)) throw new Error("Invalid listing maintenance row.");
    if (!photoStates.has(row.photo?.eligibility) || row.photo.availability !== "not_checked" || ![null, "local_asset_missing"].includes(row.photo.issue)) throw new Error("Incomplete photo eligibility evidence.");
    seen.add(row.slug); count[row.hours.state] += 1; photos[row.photo.eligibility] += 1;
    if ((row.hours.source_kind === "first_party" && ["stale", "needs_review"].includes(row.hours.state)) || row.photo.issue) problems.push([row.slug, row.hours.state, row.hours.reason ?? null, row.photo.issue]);
    if (row.hours.source_kind === "first_party" && row.hours.state === "stale") expiredOfficial += 1;
    if (row.hours.source_kind === "first_party" && row.hours.state === "needs_review") heldOfficial += 1;
    if (row.photo?.issue === "local_asset_missing") missingLocalPhoto += 1;
  }
  for (const [state, value] of Object.entries(count)) if (report.summary.hours?.[state] !== value) throw new Error("Listing maintenance totals do not reconcile.");
  for (const [state, value] of Object.entries(photos)) if (report.summary.photos?.[state] !== value) throw new Error("Photo eligibility totals do not reconcile.");
  const fingerprint = createHash("sha256").update(JSON.stringify({ count, photos, problems: problems.sort((a, b) => a[0].localeCompare(b[0])) })).digest("hex");
  const healthy = expiredOfficial === 0 && heldOfficial === 0 && missingLocalPhoto === 0;
  const detail = [
    `Reviewed main bundle: \`${report.git_sha}\`. Evaluated ${report.as_of}.`,
    "",
    `Listings reconciled: ${report.rows.length}. Current schedules: ${count.current}; stale inventory: ${count.stale}; review-required: ${count.needs_review}; unknown: ${count.unknown}.`,
    `Accepted official schedules expired: ${expiredOfficial}; official source holds or missing promotion: ${heldOfficial}; missing bundled image files: ${missingLocalPhoto}.`,
    "",
    "This is an offline inventory of reviewed main artifacts. It does not certify the served deployment, decoded remote images, physical devices or every live feed. Unknown coverage remains visible in the report and does not create a fresh emergency every day.",
    "Inspect the bounded listing-maintenance artifact and source-specific review queue. Preserve actual observation times, expiry, provider caps and approval requirements.",
  ].join("\n");
  return { healthy, detail, fingerprint, expiredOfficial, heldOfficial, missingLocalPhoto, counts: count };
}
module.exports = { listingMaintenanceOutcome };
