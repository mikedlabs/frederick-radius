"use strict";

const DAILY_CEILING = 2;
const MONTHLY_CEILING = 30;
const MAX_LEGACY_RUN_IDS = 100;

const WORKFLOWS = Object.freeze([
  Object.freeze({
    file: "ingest-venues.yml",
    title: "Ingest venue events",
  }),
  Object.freeze({
    file: "ingest-business-info.yml",
    title: "Ingest business deep-info",
  }),
  Object.freeze({
    file: "ingest-civic.yml",
    title: "Ingest municipal civic data",
  }),
]);

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function runTitle(policy, enabled, cap) {
  return `${policy.title} (firecrawl=${enabled}, cap=${cap})`;
}

function parseRunTitle(policy, title) {
  const match = new RegExp(
    `^${escapeRegExp(policy.title)} \\(firecrawl=([01]), cap=([12])\\)$`,
  ).exec(title);
  if (!match) return null;
  return {
    enabled: match[1] === "1",
    cap: Number(match[2]),
    legacy: false,
  };
}

function parseLegacyDisabledRunIds(value) {
  if (value === "") return new Set();
  if (typeof value !== "string" || !/^[1-9]\d*(,[1-9]\d*)*$/.test(value)) {
    return null;
  }
  const ids = value.split(",").map(exactPositiveInteger);
  if (
    ids.some((id) => id === null) ||
    ids.length > MAX_LEGACY_RUN_IDS ||
    new Set(ids).size !== ids.length
  ) {
    return null;
  }
  return new Set(ids);
}

function fail(core, message) {
  core.setFailed(message);
  return { allowed: false };
}

function exactPositiveInteger(value) {
  if (typeof value === "number") {
    return Number.isSafeInteger(value) && value > 0 ? value : null;
  }
  if (typeof value !== "string" || !/^[1-9]\d*$/.test(value)) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : null;
}

function currentConfiguration(env) {
  const policy = WORKFLOWS.find(
    (candidate) => candidate.file === env.CURRENT_WORKFLOW_FILE,
  );
  if (!policy) return null;
  if (
    env.FIRECRAWL_FETCH_FALLBACK !== "0" &&
    env.FIRECRAWL_FETCH_FALLBACK !== "1"
  ) {
    return null;
  }
  if (
    env.FIRECRAWL_FALLBACK_MAX_REQUESTS !== "1" &&
    env.FIRECRAWL_FALLBACK_MAX_REQUESTS !== "2"
  ) {
    return null;
  }
  return {
    policy,
    enabled: env.FIRECRAWL_FETCH_FALLBACK === "1",
    cap: Number(env.FIRECRAWL_FALLBACK_MAX_REQUESTS),
  };
}

async function enforceFirecrawlFallbackBudget({
  github,
  context,
  core,
  env = process.env,
  now = new Date(),
}) {
  const configuration = currentConfiguration(env);
  if (!configuration) {
    return fail(
      core,
      "The Firecrawl fallback configuration or workflow identity is invalid; no provider key is allowed.",
    );
  }

  const currentRunId = exactPositiveInteger(env.GITHUB_RUN_ID);
  const currentAttempt = exactPositiveInteger(env.GITHUB_RUN_ATTEMPT);
  const contextRunId = exactPositiveInteger(context?.runId);
  const contextRunAttempt = exactPositiveInteger(context?.runAttempt);
  if (
    env.GITHUB_REF !== "refs/heads/main" ||
    context?.ref !== "refs/heads/main" ||
    !currentRunId ||
    !currentAttempt ||
    currentRunId !== contextRunId ||
    currentAttempt !== contextRunAttempt
  ) {
    return fail(
      core,
      "GitHub did not provide an exact main-branch run ID and attempt; no provider key is allowed.",
    );
  }

  if (!configuration.enabled) {
    core.setOutput("allowed", "true");
    core.setOutput("enabled", "false");
    core.setOutput("reservation", "0");
    core.info(
      "Firecrawl fallback is off; this run reserves zero provider requests.",
    );
    return {
      allowed: true,
      enabled: false,
      dailyReserved: 0,
      monthlyReserved: 0,
    };
  }

  const legacyDisabledRunIds = parseLegacyDisabledRunIds(
    env.FIRECRAWL_LEGACY_DISABLED_RUN_IDS ?? "",
  );
  if (!legacyDisabledRunIds) {
    return fail(
      core,
      "The audited legacy Firecrawl run IDs are malformed; no provider key is allowed.",
    );
  }

  const nowMs = now.getTime();
  if (!Number.isFinite(nowMs)) {
    return fail(
      core,
      "The UTC budget window is invalid; no provider key is allowed.",
    );
  }
  const day = now.toISOString().slice(0, 10);
  const month = day.slice(0, 7);
  const dayStartMs = Date.parse(`${day}T00:00:00.000Z`);
  const monthStartMs = Date.parse(`${month}-01T00:00:00.000Z`);
  if (!Number.isFinite(dayStartMs) || !Number.isFinite(monthStartMs)) {
    return fail(
      core,
      "The UTC budget window is invalid; no provider key is allowed.",
    );
  }

  let dailyReserved = 0;
  let monthlyReserved = 0;
  let currentSeen = 0;

  for (const policy of WORKFLOWS) {
    let runs;
    try {
      runs = await github.paginate(github.rest.actions.listWorkflowRuns, {
        ...context.repo,
        workflow_id: policy.file,
        branch: "main",
        per_page: 100,
      });
    } catch {
      return fail(
        core,
        `GitHub history for ${policy.file} could not be read; no provider key is allowed.`,
      );
    }
    if (!Array.isArray(runs)) {
      return fail(
        core,
        `GitHub returned malformed history for ${policy.file}; no provider key is allowed.`,
      );
    }

    for (const run of runs) {
      if (!run || typeof run !== "object") {
        return fail(
          core,
          "GitHub returned a malformed workflow run; no provider key is allowed.",
        );
      }
      const updatedAtMs =
        typeof run.updated_at === "string"
          ? Date.parse(run.updated_at)
          : Number.NaN;
      if (!Number.isFinite(updatedAtMs)) {
        return fail(
          core,
          "GitHub returned workflow history without a valid update time; no provider key is allowed.",
        );
      }
      if (updatedAtMs < monthStartMs) continue;

      const createdAtMs =
        typeof run.created_at === "string"
          ? Date.parse(run.created_at)
          : Number.NaN;
      const runId = exactPositiveInteger(run.id);
      const runAttempt = exactPositiveInteger(run.run_attempt);
      if (
        !Number.isFinite(createdAtMs) ||
        createdAtMs > updatedAtMs ||
        updatedAtMs > nowMs + 300_000 ||
        !runId ||
        !runAttempt ||
        run.head_branch !== "main" ||
        typeof run.display_title !== "string"
      ) {
        return fail(
          core,
          "GitHub returned uncertain current-month workflow history; no provider key is allowed.",
        );
      }

      let classification = parseRunTitle(policy, run.display_title);
      if (
        !classification &&
        run.display_title === policy.title &&
        runAttempt === 1 &&
        legacyDisabledRunIds.has(runId)
      ) {
        classification = { enabled: false, cap: 0, legacy: true };
      }
      if (!classification) {
        return fail(
          core,
          `A current-month ${policy.file} run has no trusted Firecrawl reservation classification; no provider key is allowed.`,
        );
      }

      if (runId === currentRunId) {
        currentSeen += 1;
        if (
          policy.file !== configuration.policy.file ||
          runAttempt !== currentAttempt ||
          run.display_title !==
            runTitle(
              configuration.policy,
              configuration.enabled ? "1" : "0",
              configuration.cap,
            )
        ) {
          return fail(
            core,
            "GitHub history does not match the current Firecrawl fallback configuration and attempt; no provider key is allowed.",
          );
        }
      }

      if (!classification.enabled) continue;
      const reserved = classification.cap * runAttempt;
      if (
        !Number.isSafeInteger(reserved) ||
        !Number.isSafeInteger(monthlyReserved + reserved) ||
        (updatedAtMs >= dayStartMs &&
          !Number.isSafeInteger(dailyReserved + reserved))
      ) {
        return fail(
          core,
          "GitHub workflow-attempt history exceeds the safe reservation range; no provider key is allowed.",
        );
      }
      monthlyReserved += reserved;
      if (updatedAtMs >= dayStartMs) dailyReserved += reserved;
    }
  }

  if (currentSeen !== 1) {
    return fail(
      core,
      "The exact current workflow run and attempt are absent from durable GitHub history; no provider key is allowed.",
    );
  }
  if (dailyReserved > DAILY_CEILING || monthlyReserved > MONTHLY_CEILING) {
    return fail(
      core,
      `Shared Firecrawl fallback reservation ceiling reached: ${dailyReserved}/${DAILY_CEILING} requests today and ${monthlyReserved}/${MONTHLY_CEILING} this UTC month. No provider key is allowed.`,
    );
  }

  core.setOutput("allowed", "true");
  core.setOutput("enabled", "true");
  core.setOutput("reservation", String(configuration.cap));
  core.setOutput("day", day);
  core.setOutput("month", month);
  core.setOutput("daily-reserved", String(dailyReserved));
  core.setOutput("monthly-reserved", String(monthlyReserved));
  core.info(
    `Shared Firecrawl fallback reservation: ${dailyReserved}/${DAILY_CEILING} requests today; ${monthlyReserved}/${MONTHLY_CEILING} this UTC month.`,
  );
  return {
    allowed: true,
    enabled: true,
    dailyReserved,
    monthlyReserved,
  };
}

module.exports = {
  DAILY_CEILING,
  MAX_LEGACY_RUN_IDS,
  MONTHLY_CEILING,
  WORKFLOWS,
  enforceFirecrawlFallbackBudget,
  parseLegacyDisabledRunIds,
  parseRunTitle,
  runTitle,
};
