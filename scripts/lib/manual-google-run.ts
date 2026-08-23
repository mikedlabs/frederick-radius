export type ManualGoogleRun = {
  live: boolean;
  confirmed: boolean;
  dryRun: boolean;
  limit: number;
  limitWasExplicit: boolean;
};

type ManualGoogleRunConfig = {
  defaultLimit: number;
  maxLimit: number;
  /** Backward-compatible positional limit used by enrich:amenities. */
  legacyLimit?: string;
};

function positiveWholeNumber(value: string, flag: string): number {
  if (!/^[1-9]\d*$/.test(value)) {
    throw new Error(`${flag} must be a positive whole number.`);
  }
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed)) {
    throw new Error(`${flag} must be a safe integer.`);
  }
  return parsed;
}

function flagCount(args: readonly string[], flag: string): number {
  return args.filter((arg) => arg === flag).length;
}

/**
 * Shared safety contract for manually invoked Google maintenance scripts.
 *
 * Planning is always the default. A paid run needs the deliberate trio
 * `--live --confirm --limit N`; no key, implicit default, or legacy mode flag
 * can accidentally turn a planning command into provider traffic.
 */
export function parseManualGoogleRun(
  args: readonly string[],
  config: ManualGoogleRunConfig,
): ManualGoogleRun {
  if (
    !Number.isSafeInteger(config.defaultLimit) ||
    config.defaultLimit < 1 ||
    !Number.isSafeInteger(config.maxLimit) ||
    config.maxLimit < config.defaultLimit
  ) {
    throw new Error("Manual Google run limits are misconfigured.");
  }

  for (const flag of ["--live", "--confirm", "--limit", "--dry-run", "--plan"]) {
    if (flagCount(args, flag) > 1) {
      throw new Error(`${flag} may be provided only once.`);
    }
  }
  if (args.includes("--run")) {
    throw new Error(
      "--run is no longer a paid mode. Use --live --confirm --limit N after reviewing the preview.",
    );
  }

  const live = args.includes("--live");
  const confirmed = args.includes("--confirm");
  const explicitDryRun = args.includes("--dry-run") || args.includes("--plan");
  if (live !== confirmed) {
    throw new Error("Paid Google execution requires both --live and --confirm.");
  }
  if (live && explicitDryRun) {
    throw new Error("A planning flag cannot be combined with --live.");
  }

  const limitIndex = args.indexOf("--limit");
  if (limitIndex >= 0 && config.legacyLimit !== undefined) {
    throw new Error("Use either the positional limit or --limit, not both.");
  }
  const limitValue = limitIndex >= 0 ? args[limitIndex + 1] : config.legacyLimit;
  const limitWasExplicit = limitIndex >= 0 || config.legacyLimit !== undefined;
  if (limitIndex >= 0 && (!limitValue || limitValue.startsWith("--"))) {
    throw new Error("--limit requires a value.");
  }
  if (live && !limitWasExplicit) {
    throw new Error(
      "A live Google run requires an explicit finite --limit N request ceiling.",
    );
  }

  const limit = limitValue
    ? positiveWholeNumber(limitValue, limitIndex >= 0 ? "--limit" : "limit")
    : config.defaultLimit;
  if (limit > config.maxLimit) {
    throw new Error(
      `--limit cannot exceed the immutable ${config.maxLimit}-request run ceiling.`,
    );
  }

  return {
    live,
    confirmed,
    dryRun: !live,
    limit,
    limitWasExplicit,
  };
}

export function googleCostPreview(input: {
  calls: number;
  pricePerThousandUsd: number;
  sku: string;
}): string {
  if (!Number.isSafeInteger(input.calls) || input.calls < 0) {
    throw new Error("Cost preview calls must be a non-negative whole number.");
  }
  if (!Number.isFinite(input.pricePerThousandUsd) || input.pricePerThousandUsd < 0) {
    throw new Error("Cost preview price must be a non-negative finite number.");
  }
  const estimated = (input.calls * input.pricePerThousandUsd) / 1_000;
  return (
    `Cost preview: ${input.calls} call(s) × $${input.pricePerThousandUsd.toFixed(2)}/1,000 ` +
    `(${input.sku}) = up to $${estimated.toFixed(2)} at list price before free-tier or volume discounts.`
  );
}

export type ManualGoogleCallBudget = {
  reserve: () => boolean;
  readonly used: number;
  readonly remaining: number;
  readonly limit: number;
};

/** One shared instance can cover multiple input files without resetting. */
export function createManualGoogleCallBudget(limit: number): ManualGoogleCallBudget {
  if (!Number.isSafeInteger(limit) || limit < 1) {
    throw new Error("Google call budget must be a positive whole number.");
  }
  let used = 0;
  return {
    reserve() {
      if (used >= limit) return false;
      used += 1;
      return true;
    },
    get used() {
      return used;
    },
    get remaining() {
      return limit - used;
    },
    limit,
  };
}
