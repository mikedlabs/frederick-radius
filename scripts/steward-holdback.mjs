#!/usr/bin/env node
/**
 * Hold flagged place-status changes back INSIDE the nightly artifact, so a
 * decision that needs a human stops one slug instead of the whole county.
 *
 * The review gate is right to demand evidence before a public listing
 * disappears, appears, or flips to closed. What it got wrong was the blast
 * radius: review_required=true withheld auto-merge from the ENTIRE nightly
 * PR, so one flagged market stalled ~1,500 rows of fresh hours for days.
 * That is the exact mechanism behind the August blackout: the artifact's
 * oldest rows sit ~14 hours from the 7-day publishing cliff at steady state,
 * so a stalled night starts darkening towns almost immediately.
 *
 * This script runs after the fresh pull and the first client rebuild. It
 * re-runs the same analysis the review uses, and for every UNREVIEWED flag it
 * restores that slug's row in places-hours-refresh.json to the value already
 * on HEAD — yesterday's reviewed truth. The flagged change is not lost and
 * not decided: it simply waits, visibly, while everything else ships. The
 * caller then rebuilds the client artifacts from the spliced base, and the
 * re-run review comes back clean because the held changes are no longer in
 * the diff.
 *
 * Held slugs are written to a manifest the review renders at the top of
 * docs/hours-refresh-review.md, so the pending decisions stay in front of a
 * human every night without gating anyone else's dinner plans. Evidence in
 * src/data/place-status-overrides.json releases a hold the same night it
 * lands, through the same analysis that raised it.
 *
 * A held row keeps ITS OWN refreshed_at, so the freshness policy still ages
 * it honestly: holding a slug can never republish a stale schedule as
 * current. If evidence never arrives, the held row expires on day 7 exactly
 * as it would have before this script existed.
 */
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync, appendFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { analyzeHoursRefreshChange } from "./hours-refresh-review.mjs";

const ARTIFACT_PATH = "src/data/places-hours-refresh.json";
const CLIENT_PATH = "src/data/places-client.json";
const OVERRIDES_PATH = "src/data/place-status-overrides.json";

const DAY_MS = 86_400_000;
const MAX_LATEST_AGE_MS = 36 * 60 * 60 * 1000;
const HOURS_POLICY_MS = 7 * DAY_MS;

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

function dataRows(artifact) {
  return Object.entries(artifact).filter(([key]) => !key.startsWith("_"));
}

/**
 * The slugs whose changes must wait for evidence, each with the reason the
 * review would have raised. Reviewed flags pass through untouched: evidence
 * already cleared them, so holding them would only delay a decided change.
 */
export function holdbackSlugs(analysis) {
  const holds = new Map();
  for (const slug of analysis.unreviewedPublicAdditions ?? []) {
    holds.set(slug, "public listing addition awaiting evidence");
  }
  for (const slug of analysis.unreviewedPublicRemovals ?? []) {
    holds.set(slug, "public listing removal awaiting evidence");
  }
  for (const entry of analysis.unreviewedNewlyClosed ?? []) {
    if (!holds.has(entry.slug)) {
      holds.set(
        entry.slug,
        `closed-status transition (${entry.from} to ${entry.to}) awaiting evidence`,
      );
    }
  }
  return holds;
}

/**
 * Restore each held slug's row to its HEAD value and recompute _meta with the
 * same formulas the pull uses, anchored on the pull's own generated_at so the
 * counters keep describing the pull instant. Everything the splice cannot
 * honestly recompute (unmatched_rows, schema_version, _doc) is untouched.
 */
export function spliceArtifact(freshArtifact, headArtifact, holds) {
  const spliced = { ...freshArtifact };
  for (const slug of holds.keys()) {
    if (Object.hasOwn(headArtifact, slug) && !slug.startsWith("_")) {
      spliced[slug] = headArtifact[slug];
    } else {
      delete spliced[slug];
    }
  }

  const anchor = Date.parse(spliced._meta?.generated_at ?? "");
  const anchorMs = Number.isFinite(anchor) ? anchor : Date.now();
  const rows = dataRows(spliced).map(([, value]) => value);
  const withSchedule = rows.filter(
    (row) => Array.isArray(row.weekday_hours) && row.weekday_hours.length > 0,
  );
  const timestamps = rows
    .map((row) => Date.parse(row.refreshed_at))
    .filter((value) => Number.isFinite(value));
  spliced._meta = {
    ...spliced._meta,
    rows: rows.length,
    with_schedule: withSchedule.length,
    fresh_schedule_rows: withSchedule.filter(
      (row) => anchorMs - Date.parse(row.refreshed_at) <= HOURS_POLICY_MS,
    ).length,
    recent_rows: rows.filter(
      (row) => anchorMs - Date.parse(row.refreshed_at) <= MAX_LATEST_AGE_MS,
    ).length,
    ...(timestamps.length > 0
      ? {
          oldest_refreshed_at: new Date(Math.min(...timestamps)).toISOString(),
          newest_refreshed_at: new Date(Math.max(...timestamps)).toISOString(),
        }
      : {}),
  };
  return spliced;
}

export function main() {
  const root = process.cwd();
  const reportIndex = process.argv.indexOf("--report");
  const reportPath =
    reportIndex >= 0 && process.argv[reportIndex + 1]
      ? process.argv[reportIndex + 1]
      : null;

  const headArtifact = jsonAtHead(root, ARTIFACT_PATH);
  const freshArtifact = jsonAtWorktree(root, ARTIFACT_PATH);
  const analysis = analyzeHoursRefreshChange({
    beforeArtifact: headArtifact,
    afterArtifact: freshArtifact,
    beforePlaces: jsonAtHead(root, CLIENT_PATH),
    afterPlaces: jsonAtWorktree(root, CLIENT_PATH),
    statusOverrides: jsonAtWorktree(root, OVERRIDES_PATH),
  });
  const holds = holdbackSlugs(analysis);

  const outputs = {
    held: holds.size > 0,
    held_count: holds.size,
    held_slugs: [...holds.keys()].join(","),
  };
  if (process.env.GITHUB_OUTPUT) {
    appendFileSync(
      process.env.GITHUB_OUTPUT,
      Object.entries(outputs)
        .map(([key, value]) => `${key}=${value}`)
        .join("\n") + "\n",
    );
  }

  if (holds.size === 0) {
    console.log("steward-holdback: nothing to hold; artifact untouched.");
    return;
  }

  const spliced = spliceArtifact(freshArtifact, headArtifact, holds);
  writeFileSync(
    path.join(root, ARTIFACT_PATH),
    `${JSON.stringify(spliced, null, 2)}\n`,
  );
  if (reportPath) {
    writeFileSync(
      reportPath,
      `${JSON.stringify(
        {
          generated_at: freshArtifact._meta?.generated_at ?? null,
          held: [...holds.entries()].map(([slug, reason]) => ({
            slug,
            reason,
          })),
        },
        null,
        2,
      )}\n`,
    );
  }
  console.log(
    `steward-holdback: held ${holds.size} slug(s) at their HEAD values: ${[...holds.keys()].join(", ")}. ` +
      "Rebuild the client artifacts from the spliced base before reviewing.",
  );
}

const invokedPath = process.argv[1]
  ? pathToFileURL(path.resolve(process.argv[1])).href
  : "";
if (import.meta.url === invokedPath) {
  main();
}
