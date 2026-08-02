import { createRequire } from "node:module";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";

const require = createRequire(import.meta.url);
const lifecycle = require("../scripts/lib/source-watch-issue.cjs") as {
  BOT_LOGIN: string;
  QUEUE_LABEL: string;
  evidenceMarker: (runId: number, runAttempt: number) => string;
  latestExpiryFromBodies: (
    bodies: readonly unknown[],
    sourceId: string,
  ) => string | undefined;
  markerForSource: (sourceId: string) => string;
  updateSourceWatchIssues: (options: Record<string, unknown>) => Promise<void>;
  validateSignal: (signal: unknown) => boolean;
};
const {
  BOT_LOGIN,
  QUEUE_LABEL,
  evidenceMarker,
  latestExpiryFromBodies,
  markerForSource,
  updateSourceWatchIssues,
  validateSignal,
} = lifecycle;

const FIRST_HASH = "a".repeat(64);
const SECOND_HASH = "b".repeat(64);
const CHECKED_AT = "2026-08-01T12:00:00.000Z";
const EXPIRES_AT = "2026-08-15T12:00:00.000Z";

type Status =
  "baseline" | "same" | "changed" | "removed" | "error" | "url-baseline";

function item(
  status: Status,
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  const base = {
    sourceId: "weinberg-performances",
    sourceUrl: "https://weinbergcenter.org/performances/",
    checkedAt: CHECKED_AT,
    expiresAt: EXPIRES_AT,
    status,
  };
  if (["baseline", "same", "url-baseline"].includes(status)) {
    return {
      ...base,
      currentHash: FIRST_HASH,
      textLength: 1234,
      linkCount: 8,
      ...overrides,
    };
  }
  if (status === "changed") {
    return {
      ...base,
      previousHash: FIRST_HASH,
      currentHash: SECOND_HASH,
      textLength: 1235,
      linkCount: 9,
      ...overrides,
    };
  }
  return {
    ...base,
    previousHash: FIRST_HASH,
    errorCode: status === "removed" ? "TARGET_HTTP_ERROR" : "SOURCE_REJECTED",
    ...(status === "removed" ? { httpStatus: 404 } : {}),
    ...overrides,
  };
}

function signal(...items: Array<Record<string, unknown>>) {
  return { schemaVersion: 1, generatedAt: CHECKED_AT, items };
}

async function signalFile(value: unknown): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), "radius-source-watch-issue-"));
  const path = join(directory, "signal.json");
  await writeFile(path, `${JSON.stringify(value)}\n`, "utf8");
  return path;
}

type ExistingIssue = {
  number: number;
  body: string;
  state: "open" | "closed";
  title: string;
  labels: Array<string | { name?: string }>;
  user: { login: string };
  pull_request?: Record<string, unknown>;
};

type ExistingComment = {
  body: string;
  user: { login: string };
};

function apiError(status: number): Error & { status: number } {
  return Object.assign(new Error(`GitHub API ${status}`), { status });
}

function botComment(body: string): ExistingComment {
  return { body, user: { login: BOT_LOGIN } };
}

function harness({
  issues = [],
  comments = {},
  runAttempt = 1,
  labelExists = true,
  labelCreateRace = false,
}: {
  issues?: ExistingIssue[];
  comments?: Record<number, ExistingComment[]>;
  runAttempt?: number;
  labelExists?: boolean;
  labelCreateRace?: boolean;
} = {}) {
  let queueLabelExists = labelExists;
  const listForRepo = vi.fn();
  const listComments = vi.fn();
  const getLabel = vi.fn(async () => {
    if (!queueLabelExists) throw apiError(404);
    return { data: { name: QUEUE_LABEL } };
  });
  const createLabel = vi.fn(async () => {
    queueLabelExists = true;
    if (labelCreateRace) throw apiError(422);
    return { data: { name: QUEUE_LABEL } };
  });
  const create = vi.fn(async (input: Record<string, unknown>) => {
    void input;
    return {};
  });
  const createComment = vi.fn(async (input: Record<string, unknown>) => {
    void input;
    return {};
  });
  const update = vi.fn(async (input: Record<string, unknown>) => {
    void input;
    return {};
  });
  const setFailed = vi.fn();
  return {
    github: {
      paginate: vi.fn(
        async (method: unknown, parameters: Record<string, unknown>) => {
          if (method === listForRepo) return issues;
          if (method === listComments) {
            return comments[Number(parameters.issue_number)] ?? [];
          }
          throw new Error("unexpected pagination method");
        },
      ),
      rest: {
        issues: {
          listForRepo,
          listComments,
          getLabel,
          createLabel,
          create,
          createComment,
          update,
        },
      },
    },
    context: {
      serverUrl: "https://github.com",
      repo: { owner: "mikedlabs", repo: "frederick-radius" },
      runId: 123,
      runAttempt,
    },
    core: { info: vi.fn(), setFailed },
    create,
    createLabel,
    createComment,
    getLabel,
    update,
    setFailed,
  };
}

function existing(
  sourceId = "weinberg-performances",
  expiresAt = EXPIRES_AT,
  state: "open" | "closed" = "open",
  number = 41,
  overrides: Partial<ExistingIssue> = {},
): ExistingIssue {
  return {
    number,
    state,
    title: `[source-watch:${sourceId}] Exact public page needs review`,
    labels: [{ name: QUEUE_LABEL }],
    user: { login: BOT_LOGIN },
    body: [
      markerForSource(sourceId),
      `<!-- source-watch-expires:${sourceId}:${expiresAt} -->`,
    ].join("\n"),
    ...overrides,
  };
}

async function update(h: ReturnType<typeof harness>, value: unknown) {
  await updateSourceWatchIssues({
    github: h.github,
    context: h.context,
    core: h.core,
    signalPath: await signalFile(value),
  });
}

describe("Source Watch compact issue schema", () => {
  it("accepts only IDs, exact public URLs, timestamps, hashes, counts, and statuses", () => {
    expect(validateSignal(signal(item("changed")))).toBe(true);
    expect(
      validateSignal(
        signal(item("changed", { publisherTitle: "Copied page prose" })),
      ),
    ).toBe(false);
    expect(
      validateSignal(
        signal(item("changed", { sourceUrl: "http://127.0.0.1/events" })),
      ),
    ).toBe(false);
    expect(
      validateSignal(
        signal(item("changed", { expiresAt: "2026-08-31T12:00:00.000Z" })),
      ),
    ).toBe(false);
  });

  it("requires one strict shape per status and one item per source ID", () => {
    expect(validateSignal(signal(item("baseline")))).toBe(true);
    expect(validateSignal(signal(item("url-baseline")))).toBe(true);
    expect(validateSignal(signal(item("removed")))).toBe(true);
    expect(
      validateSignal(
        signal(item("url-baseline", { previousHash: FIRST_HASH })),
      ),
    ).toBe(false);
    expect(validateSignal(signal(item("removed", { httpStatus: 500 })))).toBe(
      false,
    );
    expect(validateSignal(signal(item("same"), item("same")))).toBe(false);
  });

  it("selects only the latest valid per-source expiry marker", () => {
    expect(
      latestExpiryFromBodies(
        [
          "<!-- source-watch-expires:other-source:2026-08-20T12:00:00.000Z -->",
          "<!-- source-watch-expires:weinberg-performances:not-a-date -->",
          "<!-- source-watch-expires:weinberg-performances:2026-08-10T12:00:00.000Z -->",
          "<!-- source-watch-expires:weinberg-performances:2026-08-12T12:00:00.000Z -->",
        ],
        "weinberg-performances",
      ),
    ).toBe("2026-08-12T12:00:00.000Z");
  });
});

describe("Source Watch per-source issue lifecycle", () => {
  it("keeps ordinary baselines visible in workflow evidence without opening alerts", async () => {
    const h = harness();
    await update(h, signal(item("baseline")));

    expect(h.getLabel).toHaveBeenCalledOnce();
    expect(h.create).not.toHaveBeenCalled();
    expect(h.createComment).not.toHaveBeenCalled();
    expect(h.core.info).toHaveBeenCalledWith(
      expect.stringContaining("review-visible in workflow evidence"),
    );
  });

  it("opens one independent stable issue for each actionable source", async () => {
    const h = harness();
    await update(
      h,
      signal(
        item("url-baseline"),
        item("error", {
          sourceId: "sky-stage-calendar",
          sourceUrl: "https://www.skystagefrederick.com/project/calendar/",
        }),
      ),
    );

    expect(h.create).toHaveBeenCalledTimes(2);
    const creates = h.create.mock.calls.map(([input]) => input);
    expect(creates[0]).toMatchObject({
      title:
        "[source-watch:weinberg-performances] Exact public page needs review",
      labels: [QUEUE_LABEL],
    });
    expect(creates[1]).toMatchObject({
      title: "[source-watch:sky-stage-calendar] Exact public page needs review",
      labels: [QUEUE_LABEL],
    });
    expect(h.github.paginate).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ labels: QUEUE_LABEL, state: "all" }),
    );
    expect(JSON.stringify(creates)).not.toContain("Copied page prose");
  });

  it("creates the dedicated queue label before applying it", async () => {
    const h = harness({ labelExists: false });
    await update(h, signal(item("changed")));

    expect(h.createLabel).toHaveBeenCalledWith(
      expect.objectContaining({
        name: QUEUE_LABEL,
        color: expect.stringMatching(/^[a-f0-9]{6}$/),
        description: expect.stringContaining("Source Watch"),
      }),
    );
    expect(h.create).toHaveBeenCalledWith(
      expect.objectContaining({ labels: [QUEUE_LABEL] }),
    );
  });

  it("verifies the exact label after a safe concurrent-create race", async () => {
    const h = harness({ labelExists: false, labelCreateRace: true });
    await update(h, signal(item("baseline")));

    expect(h.createLabel).toHaveBeenCalledOnce();
    expect(h.getLabel).toHaveBeenCalledTimes(2);
    expect(h.setFailed).not.toHaveBeenCalled();
  });

  it("fails closed before GitHub mutation without an exact run attempt", async () => {
    const h = harness({ runAttempt: 0 });
    await update(h, signal(item("changed")));

    expect(h.setFailed).toHaveBeenCalledWith(
      expect.stringContaining("run ID and attempt"),
    );
    expect(h.getLabel).not.toHaveBeenCalled();
    expect(h.createLabel).not.toHaveBeenCalled();
    expect(h.create).not.toHaveBeenCalled();
  });

  it("updates only the matching source issue", async () => {
    const h = harness({
      issues: [
        existing("weinberg-performances", EXPIRES_AT, "open", 41),
        existing("sky-stage-calendar", EXPIRES_AT, "closed", 42),
      ],
    });
    await update(h, signal(item("changed")));

    expect(h.create).not.toHaveBeenCalled();
    expect(h.createComment).toHaveBeenCalledWith(
      expect.objectContaining({ issue_number: 41 }),
    );
    expect(h.update).not.toHaveBeenCalled();
  });

  it("does not close an unexpired unresolved alert after a quiet run", async () => {
    const h = harness({ issues: [existing()] });
    await update(h, signal(item("same")));

    expect(h.update).not.toHaveBeenCalled();
    expect(h.createComment).toHaveBeenCalledOnce();
    expect(h.createComment.mock.calls[0]?.[0].body).toContain(
      "does not close it early",
    );
  });

  it("closes only after expiry and a successful quiet run", async () => {
    const h = harness({
      issues: [existing("weinberg-performances", "2026-07-31T12:00:00.000Z")],
    });
    await update(h, signal(item("same")));

    expect(h.update).toHaveBeenCalledWith(
      expect.objectContaining({
        issue_number: 41,
        state: "closed",
        state_reason: "not_planned",
      }),
    );
    expect(h.createComment.mock.calls[0]?.[0].body).toContain(
      "Closing only this review queue as not planned",
    );
  });

  it("never closes an expired alert when the latest run is an error", async () => {
    const h = harness({
      issues: [existing("weinberg-performances", "2026-07-31T12:00:00.000Z")],
    });
    await update(h, signal(item("error")));

    expect(h.update).not.toHaveBeenCalled();
    expect(h.createComment).toHaveBeenCalledOnce();
    expect(h.createComment.mock.calls[0]?.[0].body).toContain("`error`");
  });

  it("leaves an explicitly closed issue closed on quiet runs and reopens it only for a new alert", async () => {
    const quiet = harness({
      issues: [existing(undefined, undefined, "closed")],
    });
    await update(quiet, signal(item("same")));
    expect(quiet.update).not.toHaveBeenCalled();
    expect(quiet.createComment).not.toHaveBeenCalled();

    const actionable = harness({
      issues: [existing(undefined, undefined, "closed")],
    });
    await update(actionable, signal(item("changed")));
    expect(actionable.update).toHaveBeenCalledWith(
      expect.objectContaining({ issue_number: 41, state: "open" }),
    );
    expect(actionable.createComment).toHaveBeenCalledOnce();
  });

  it("is idempotent only for bot-authored evidence from the exact attempt", async () => {
    const h = harness({
      issues: [existing()],
      comments: { 41: [botComment(evidenceMarker(123, 1))] },
    });
    await update(h, signal(item("changed")));

    expect(h.createComment).not.toHaveBeenCalled();
    expect(h.update).not.toHaveBeenCalled();
  });

  it("processes a rerun after attempt one closes an expired quiet queue", async () => {
    const expiredAt = "2026-07-31T12:00:00.000Z";
    const attemptOne = harness({
      issues: [existing("weinberg-performances", expiredAt)],
      runAttempt: 1,
    });
    await update(attemptOne, signal(item("same")));

    expect(attemptOne.update).toHaveBeenCalledWith(
      expect.objectContaining({ state: "closed" }),
    );
    const attemptOneBody = String(
      attemptOne.createComment.mock.calls[0]?.[0].body,
    );
    expect(attemptOneBody).toContain(evidenceMarker(123, 1));
    expect(attemptOneBody).toContain("/actions/runs/123/attempts/1");

    const attemptTwo = harness({
      issues: [existing("weinberg-performances", expiredAt, "closed", 41)],
      comments: { 41: [botComment(attemptOneBody)] },
      runAttempt: 2,
    });
    await update(attemptTwo, signal(item("changed")));

    expect(attemptTwo.update).toHaveBeenCalledWith(
      expect.objectContaining({ issue_number: 41, state: "open" }),
    );
    expect(attemptTwo.createComment).toHaveBeenCalledOnce();
    const attemptTwoBody = String(
      attemptTwo.createComment.mock.calls[0]?.[0].body,
    );
    expect(attemptTwoBody).toContain(evidenceMarker(123, 2));
    expect(attemptTwoBody).toContain("/actions/runs/123/attempts/2");
  });

  it("ignores spoofed issues missing any stable bot queue identity", async () => {
    const h = harness({
      issues: [
        existing(undefined, undefined, "open", 41, {
          user: { login: "radius-reader" },
        }),
        existing(undefined, undefined, "open", 42, { labels: [] }),
        existing(undefined, undefined, "open", 43, {
          title: "[source-watch:weinberg-performances] Similar user report",
        }),
        existing(undefined, undefined, "open", 44, {
          body: "No machine source marker",
        }),
      ],
    });
    await update(h, signal(item("changed")));

    expect(h.setFailed).not.toHaveBeenCalled();
    expect(h.create).toHaveBeenCalledOnce();
    expect(h.createComment).not.toHaveBeenCalled();
    expect(h.update).not.toHaveBeenCalled();
  });

  it("ignores user-authored dedup and expiry markers on the real queue", async () => {
    const expiredAt = "2026-07-31T12:00:00.000Z";
    const h = harness({
      issues: [existing("weinberg-performances", expiredAt)],
      comments: {
        41: [
          {
            user: { login: "radius-reader" },
            body: [
              evidenceMarker(123, 1),
              `<!-- source-watch-expires:weinberg-performances:${EXPIRES_AT} -->`,
            ].join("\n"),
          },
        ],
      },
    });
    await update(h, signal(item("same")));

    expect(h.createComment).toHaveBeenCalledOnce();
    expect(h.update).toHaveBeenCalledWith(
      expect.objectContaining({
        issue_number: 41,
        state: "closed",
        state_reason: "not_planned",
      }),
    );
  });

  it("fails before mutation when duplicate stable issues exist", async () => {
    const h = harness({
      issues: [existing(), existing(undefined, undefined, "open", 42)],
    });
    await update(h, signal(item("changed")));

    expect(h.setFailed).toHaveBeenCalledWith(
      expect.stringContaining("multiple stable issues"),
    );
    expect(h.create).not.toHaveBeenCalled();
    expect(h.createComment).not.toHaveBeenCalled();
    expect(h.update).not.toHaveBeenCalled();
  });
});
