import { randomUUID } from "node:crypto";
import {
  closeSync,
  existsSync,
  mkdirSync,
  openSync,
  readFileSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { dirname } from "node:path";

export type UsageBucket = {
  attemptedRequests: number;
  attemptedCredits: number;
};

export type UsageLedger = {
  schemaVersion: 1;
  timezone: "UTC";
  updatedAt: string;
  days: Record<string, UsageBucket>;
  months: Record<string, UsageBucket>;
};

export type UsageBudgetDecision =
  | { allowed: true }
  | {
      allowed: false;
      reason: "run-requests" | "run-credits" | "daily-credits" | "monthly-credits";
    };

export function usageBudgetDecision(
  usage: {
    runRequests: number;
    runCredits: number;
    dailyCredits: number;
    monthlyCredits: number;
    estimatedCredits?: number;
  },
  limits: {
    runRequests: number;
    runCredits: number;
    dailyCredits: number;
    monthlyCredits: number;
  },
): UsageBudgetDecision {
  const estimatedCredits = usage.estimatedCredits ?? 1;
  if (usage.runRequests + 1 > limits.runRequests) {
    return { allowed: false, reason: "run-requests" };
  }
  if (usage.runCredits + estimatedCredits > limits.runCredits) {
    return { allowed: false, reason: "run-credits" };
  }
  if (usage.dailyCredits + estimatedCredits > limits.dailyCredits) {
    return { allowed: false, reason: "daily-credits" };
  }
  if (usage.monthlyCredits + estimatedCredits > limits.monthlyCredits) {
    return { allowed: false, reason: "monthly-credits" };
  }
  return { allowed: true };
}

export function usageBucket(
  buckets: Record<string, UsageBucket>,
  key: string,
): UsageBucket {
  return buckets[key] ?? { attemptedRequests: 0, attemptedCredits: 0 };
}

function isBucket(value: unknown): value is UsageBucket {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const bucket = value as Record<string, unknown>;
  return (
    Number.isInteger(bucket.attemptedRequests) &&
    Number(bucket.attemptedRequests) >= 0 &&
    Number.isInteger(bucket.attemptedCredits) &&
    Number(bucket.attemptedCredits) >= 0
  );
}

function isBucketMap(value: unknown): value is Record<string, UsageBucket> {
  return (
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    Object.values(value).every(isBucket)
  );
}

function isMissingFile(error: unknown): boolean {
  return error instanceof Error && "code" in error && error.code === "ENOENT";
}

export function readUsageLedger(
  path: string,
  now: Date,
  label: string,
): UsageLedger {
  try {
    const parsed = JSON.parse(readFileSync(path, "utf8")) as unknown;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      const ledger = parsed as Record<string, unknown>;
      if (
        ledger.schemaVersion === 1 &&
        ledger.timezone === "UTC" &&
        typeof ledger.updatedAt === "string" &&
        isBucketMap(ledger.days) &&
        isBucketMap(ledger.months)
      ) {
        return ledger as UsageLedger;
      }
    }
    throw new Error("invalid schema");
  } catch (error) {
    if (isMissingFile(error)) {
      return {
        schemaVersion: 1,
        timezone: "UTC",
        updatedAt: now.toISOString(),
        days: {},
        months: {},
      };
    }
    throw new Error(`${label} usage ledger is invalid at ${path}; no API calls were made.`, {
      cause: error,
    });
  }
}

export function reserveUsage(
  ledger: UsageLedger,
  now: Date,
  credits = 1,
): void {
  const timestamp = now.toISOString();
  const day = timestamp.slice(0, 10);
  const month = timestamp.slice(0, 7);
  const daily = usageBucket(ledger.days, day);
  const monthly = usageBucket(ledger.months, month);
  ledger.days[day] = {
    attemptedRequests: daily.attemptedRequests + 1,
    attemptedCredits: daily.attemptedCredits + credits,
  };
  ledger.months[month] = {
    attemptedRequests: monthly.attemptedRequests + 1,
    attemptedCredits: monthly.attemptedCredits + credits,
  };
  ledger.updatedAt = timestamp;
}

export function writeJsonAtomic(path: string, value: unknown): void {
  mkdirSync(dirname(path), { recursive: true });
  const temporary = `${path}.tmp-${process.pid}-${randomUUID()}`;
  try {
    writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, "utf8");
    renameSync(temporary, path);
  } finally {
    if (existsSync(temporary)) unlinkSync(temporary);
  }
}

export function acquireExclusiveLock(
  path: string,
  now: Date,
  label: string,
): () => void {
  mkdirSync(dirname(path), { recursive: true });
  const ownerToken = randomUUID();
  let descriptor: number;
  try {
    descriptor = openSync(path, "wx");
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "EEXIST") {
      throw new Error(
        `Another ${label} live run holds ${path}. Verify no run is active before removing that lock. No API calls were made.`,
      );
    }
    throw error;
  }
  try {
    writeFileSync(
      descriptor,
      `${JSON.stringify({ ownerToken, createdAt: now.toISOString() })}\n`,
      "utf8",
    );
  } catch (error) {
    try {
      unlinkSync(path);
    } catch {
      // Preserve the original write failure.
    }
    throw error;
  } finally {
    closeSync(descriptor);
  }

  return () => {
    try {
      const lock = JSON.parse(readFileSync(path, "utf8")) as { ownerToken?: unknown };
      if (lock.ownerToken === ownerToken) unlinkSync(path);
    } catch (error) {
      if (!isMissingFile(error)) throw error;
    }
  };
}
