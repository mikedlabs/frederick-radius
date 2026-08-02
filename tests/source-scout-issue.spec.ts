import { createRequire } from "node:module";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";

const require = createRequire(import.meta.url);
const lifecycle = require("../scripts/lib/source-scout-issue.cjs") as {
  ALERT_MARKER_PREFIX: string;
  ATTEMPT_MARKER_PREFIX: string;
  FINGERPRINT_MARKER_PREFIX: string;
  LABEL_NAME: string;
  TRUSTED_BOT_LOGIN: string;
  attemptMarker: (
    item: Record<string, unknown>,
    runId: number,
    runAttempt: number,
  ) => string;
  candidateFingerprint: (
    candidates: readonly Record<string, unknown>[],
  ) => string;
  stableMarker: (profileId: string, queryId: string) => string;
  updateSourceScoutIssues: (options: Record<string, unknown>) => Promise<void>;
  validateSignal: (signal: unknown) => boolean;
};

const {
  ALERT_MARKER_PREFIX,
  FINGERPRINT_MARKER_PREFIX,
  LABEL_NAME,
  TRUSTED_BOT_LOGIN,
  attemptMarker,
  candidateFingerprint,
  stableMarker,
  updateSourceScoutIssues,
  validateSignal,
} = lifecycle;

const GENERATED_AT = "2026-08-01T12:00:00.000Z";
const EXPIRES_AT = "2026-08-31T12:00:00.000Z";
const PROFILE_ID = "official-events";
const QUERY_ID = "venue-programming";
const MANAGED_LABEL = {
  name: LABEL_NAME,
  color: "1d76db",
  description: "Bot-owned Source Scout review queue",
};

type Candidate = { url: string; domain: string; score: number };
type ScoutStatus =
  "fetched" | "cache" | "error" | "skipped-budget" | "skipped-terminal-error";

const FIRST_CANDIDATE: Candidate = {
  url: "https://weinbergcenter.org/events/",
  domain: "weinbergcenter.org",
  score: 0.91,
};
const SECOND_CANDIDATE: Candidate = {
  url: "https://skystagefrederick.com/calendar/",
  domain: "skystagefrederick.com",
  score: 0.82,
};

function item(
  status: ScoutStatus = "fetched",
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  const candidates = (overrides.candidates ??
    (status === "fetched" || status === "cache" ? [FIRST_CANDIDATE] : [])) as
    Candidate[] | unknown[];
  return {
    profileId: PROFILE_ID,
    queryId: QUERY_ID,
    observedAt: GENERATED_AT,
    expiresAt: EXPIRES_AT,
    status,
    candidateFingerprint: candidateFingerprint(
      candidates as Record<string, unknown>[],
    ),
    candidateCount: candidates.length,
    candidates,
    estimatedCredits: 1,
    requestId: status === "fetched" ? "req-123" : null,
    apiReportedCredits: status === "fetched" ? 1 : null,
    errorCode: status === "error" ? "rate_limited" : null,
    errorStatus: status === "error" ? 429 : null,
    ...overrides,
  };
}

function signal(...items: Array<Record<string, unknown>>) {
  return { schemaVersion: 1, generatedAt: GENERATED_AT, items };
}

async function signalFile(value: unknown): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), "radius-source-scout-issue-"));
  const path = join(directory, "signal.json");
  await writeFile(path, `${JSON.stringify(value)}\n`, "utf8");
  return path;
}

type IssueComment = {
  body: string;
  user: { login: string; type: "Bot" | "User" };
};

type ExistingIssue = {
  number: number;
  title: string;
  body: string;
  state: "open" | "closed";
  labels: Array<{ name: string }>;
  user: { login: string; type: "Bot" | "User" };
};

function titleFor(value: Record<string, unknown>): string {
  return `[source-scout:${value.profileId}/${value.queryId}] Candidate sources need review`;
}

function fingerprintMarker(value: Record<string, unknown>): string {
  return `${FINGERPRINT_MARKER_PREFIX}${value.profileId}:${value.queryId}:${value.candidateFingerprint}:${value.expiresAt} -->`;
}

function alertMarker(value: Record<string, unknown>): string {
  return `${ALERT_MARKER_PREFIX}${value.profileId}:${value.queryId}:${value.expiresAt} -->`;
}

function existing(
  value = item(),
  overrides: Partial<ExistingIssue> = {},
): ExistingIssue {
  return {
    number: 41,
    title: titleFor(value),
    state: "open",
    labels: [{ name: LABEL_NAME }],
    user: { login: TRUSTED_BOT_LOGIN, type: "Bot" },
    body: [
      stableMarker(String(value.profileId), String(value.queryId)),
      fingerprintMarker(value),
      alertMarker(value),
    ].join("\n"),
    ...overrides,
  };
}

function botComment(body: string): IssueComment {
  return {
    body,
    user: { login: TRUSTED_BOT_LOGIN, type: "Bot" },
  };
}

function humanComment(body: string): IssueComment {
  return { body, user: { login: "reviewer", type: "User" } };
}

function harness({
  issues = [],
  comments = {},
  context = {},
}: {
  issues?: ExistingIssue[];
  comments?: Record<number, IssueComment[]>;
  context?: Record<string, unknown>;
} = {}) {
  const listForRepo = vi.fn();
  const listComments = vi.fn();
  const getLabel = vi.fn(async (input: Record<string, unknown>) => {
    void input;
    return { data: MANAGED_LABEL };
  });
  const createLabel = vi.fn(async (input: Record<string, unknown>) => {
    void input;
    return { data: MANAGED_LABEL };
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
      runAttempt: 1,
      ...context,
    },
    core: { info: vi.fn(), setFailed },
    getLabel,
    createLabel,
    create,
    createComment,
    update,
    setFailed,
  };
}

async function updateQueue(h: ReturnType<typeof harness>, value: unknown) {
  await updateSourceScoutIssues({
    github: h.github,
    context: h.context,
    core: h.core,
    signalPath: await signalFile(value),
  });
}

describe("Source Scout compact issue schema", () => {
  it("accepts only IDs, timestamps, URL evidence, fingerprints, and bounded provider metadata", () => {
    expect(validateSignal(signal(item()))).toBe(true);
    expect(validateSignal(signal(item("cache")))).toBe(true);
    expect(validateSignal(signal(item("error")))).toBe(true);
    expect(validateSignal(signal(item("skipped-budget")))).toBe(true);
    expect(
      validateSignal(signal(item("fetched", { title: "Result title" }))),
    ).toBe(false);
    expect(
      validateSignal(signal(item("fetched", { queryText: "search prose" }))),
    ).toBe(false);
    expect(
      validateSignal(
        signal(item("fetched", { requestId: "request query prose" })),
      ),
    ).toBe(false);
  });

  it("rejects private URLs, mismatched domains, bad fingerprints, and duplicate identities", () => {
    const privateCandidate = {
      url: "http://service.internal/admin",
      domain: "service.internal",
      score: 1,
    };
    expect(
      validateSignal(
        signal(item("fetched", { candidates: [privateCandidate] })),
      ),
    ).toBe(false);
    expect(
      validateSignal(
        signal(
          item("fetched", {
            candidates: [
              {
                url: `https://weinbergcenter.org/${"a".repeat(2_100)}`,
                domain: "weinbergcenter.org",
                score: 1,
              },
            ],
          }),
        ),
      ),
    ).toBe(false);
    expect(
      validateSignal(
        signal(
          item("fetched", {
            candidates: [{ ...FIRST_CANDIDATE, domain: "example.com" }],
          }),
        ),
      ),
    ).toBe(false);
    expect(
      validateSignal(
        signal(item("fetched", { candidateFingerprint: "a".repeat(64) })),
      ),
    ).toBe(false);
    expect(validateSignal(signal(item(), item()))).toBe(false);
  });

  it("fingerprints URL identities independent of score and order", () => {
    expect(candidateFingerprint([FIRST_CANDIDATE, SECOND_CANDIDATE])).toBe(
      candidateFingerprint([
        { ...SECOND_CANDIDATE, score: 0.1 },
        { ...FIRST_CANDIDATE, score: 0.2 },
      ]),
    );
    expect(candidateFingerprint([FIRST_CANDIDATE])).not.toBe(
      candidateFingerprint([SECOND_CANDIDATE]),
    );
  });
});

describe("Source Scout managed label and trusted identity", () => {
  it("creates and verifies the exact managed label when it is absent", async () => {
    const h = harness();
    h.getLabel.mockRejectedValueOnce({ status: 404 });
    await updateQueue(h, signal(item("fetched", { candidates: [] })));

    expect(h.createLabel).toHaveBeenCalledWith(
      expect.objectContaining(MANAGED_LABEL),
    );
  });

  it("rereads and verifies the label after a concurrent 422 create", async () => {
    const h = harness();
    h.getLabel
      .mockRejectedValueOnce({ status: 404 })
      .mockResolvedValueOnce({ data: MANAGED_LABEL });
    h.createLabel.mockRejectedValueOnce({ status: 422 });
    await updateQueue(h, signal(item("fetched", { candidates: [] })));

    expect(h.getLabel).toHaveBeenCalledTimes(2);
    expect(h.create).not.toHaveBeenCalled();
  });

  it("stops when the existing or returned label is not the exact bot contract", async () => {
    const h = harness();
    h.getLabel.mockResolvedValueOnce({
      data: { ...MANAGED_LABEL, description: "Human queue" },
    });
    await expect(
      updateQueue(h, signal(item("fetched", { candidates: [] }))),
    ).rejects.toThrow("does not match the bot-owned queue contract");
    expect(h.create).not.toHaveBeenCalled();
  });

  it("verifies both a newly created label and a label reread after a 422 race", async () => {
    const badCreated = harness();
    badCreated.getLabel.mockRejectedValueOnce({ status: 404 });
    badCreated.createLabel.mockResolvedValueOnce({
      data: { ...MANAGED_LABEL, color: "ffffff" },
    });
    await expect(
      updateQueue(badCreated, signal(item("fetched", { candidates: [] }))),
    ).rejects.toThrow("does not match the bot-owned queue contract");

    const badRace = harness();
    badRace.getLabel
      .mockRejectedValueOnce({ status: 404 })
      .mockResolvedValueOnce({
        data: { ...MANAGED_LABEL, description: "Different queue" },
      });
    badRace.createLabel.mockRejectedValueOnce({ status: 422 });
    await expect(
      updateQueue(badRace, signal(item("fetched", { candidates: [] }))),
    ).rejects.toThrow("does not match the bot-owned queue contract");
  });

  it("requires exact title, marker line, label, and bot author before trusting an issue", async () => {
    const value = item();
    const nearMarker = existing(value, {
      body: `prefix ${stableMarker(PROFILE_ID, QUERY_ID)} suffix`,
    });
    const wrongTitle = existing(value, {
      number: 42,
      title: `${titleFor(value)} edited`,
    });
    const human = existing(value, {
      number: 43,
      user: { login: TRUSTED_BOT_LOGIN, type: "User" },
    });
    const h = harness({ issues: [nearMarker, wrongTitle, human] });
    await updateQueue(h, signal(value));

    expect(h.create).toHaveBeenCalledOnce();
  });

  it("ignores forged human comment state", async () => {
    const oldValue = item();
    const newValue = item("fetched", { candidates: [SECOND_CANDIDATE] });
    const forged = [
      fingerprintMarker(newValue),
      attemptMarker(newValue, 123, 1),
    ].join("\n");
    const h = harness({
      issues: [existing(oldValue)],
      comments: { 41: [humanComment(forged)] },
    });
    await updateQueue(h, signal(newValue));

    expect(h.createComment).toHaveBeenCalledOnce();
  });

  it("fails before issue mutation when duplicate trusted stable issues exist", async () => {
    const value = item();
    const h = harness({
      issues: [existing(value), existing(value, { number: 42 })],
    });
    await updateQueue(h, signal(value));

    expect(h.setFailed).toHaveBeenCalledWith(
      expect.stringContaining("multiple trusted stable issues"),
    );
    expect(h.create).not.toHaveBeenCalled();
    expect(h.createComment).not.toHaveBeenCalled();
    expect(h.update).not.toHaveBeenCalled();
  });
});

describe("Source Scout per-profile/query lifecycle", () => {
  it("opens independent stable issues for candidate sets and errors without raw prose", async () => {
    const candidateValue = item();
    const errorValue = item("error", {
      profileId: "official-civic",
      queryId: "road-notices",
    });
    const h = harness();
    await updateQueue(h, signal(candidateValue, errorValue));

    expect(h.create).toHaveBeenCalledTimes(2);
    const payload = JSON.stringify(h.create.mock.calls);
    expect(payload).toContain(
      "[source-scout:official-events/venue-programming] Candidate sources need review",
    );
    expect(payload).toContain(
      "[source-scout:official-civic/road-notices] Candidate sources need review",
    );
    expect(payload).toContain("/actions/runs/123/attempts/1");
    expect(payload).toContain("weinbergcenter.org/events/");
    expect(payload).not.toContain("queryText");
    expect(payload).not.toContain("result title");
    expect(payload).not.toContain("raw content");
    expect(h.create.mock.calls[0]?.[0]).toMatchObject({
      labels: [LABEL_NAME],
    });
  });

  it("preserves a human-closed issue when the URL fingerprint is unchanged", async () => {
    const previous = item();
    const changedScore = item("cache", {
      candidates: [{ ...FIRST_CANDIDATE, score: 0.4 }],
    });
    const h = harness({
      issues: [existing(previous, { state: "closed" })],
    });
    await updateQueue(h, signal(changedScore));

    expect(h.update).not.toHaveBeenCalled();
    expect(h.createComment).not.toHaveBeenCalled();
  });

  it("reopens a closed issue only for a changed candidate set or an error", async () => {
    const previous = item();
    const changed = item("fetched", { candidates: [SECOND_CANDIDATE] });
    const changedHarness = harness({
      issues: [existing(previous, { state: "closed" })],
    });
    await updateQueue(changedHarness, signal(changed));
    expect(changedHarness.update).toHaveBeenCalledWith(
      expect.objectContaining({ issue_number: 41, state: "open" }),
    );
    expect(changedHarness.createComment).toHaveBeenCalledOnce();

    const errorHarness = harness({
      issues: [existing(previous, { state: "closed" })],
    });
    await updateQueue(errorHarness, signal(item("error")));
    expect(errorHarness.update).toHaveBeenCalledWith(
      expect.objectContaining({ issue_number: 41, state: "open" }),
    );
    expect(errorHarness.createComment).toHaveBeenCalledOnce();
  });

  it("leaves an open unresolved alert untouched for same, cache, quiet, and skipped runs", async () => {
    for (const value of [
      item("fetched"),
      item("cache"),
      item("fetched", { candidates: [] }),
      item("cache", { candidates: [] }),
      item("skipped-budget"),
    ]) {
      const h = harness({ issues: [existing(item())] });
      await updateQueue(h, signal(value));
      expect(h.update).not.toHaveBeenCalled();
      expect(h.createComment).not.toHaveBeenCalled();
    }
  });

  it("closes only after 30-day expiry and a fresh successful empty result", async () => {
    const oldAlert = item("fetched", {
      observedAt: "2026-07-01T12:00:00.000Z",
      expiresAt: "2026-07-31T12:00:00.000Z",
    });
    const quietAfterExpiry = item("fetched", {
      observedAt: GENERATED_AT,
      candidates: [],
    });
    const fresh = harness({ issues: [existing(oldAlert)] });
    await updateQueue(fresh, signal(quietAfterExpiry));
    expect(fresh.createComment).toHaveBeenCalledOnce();
    expect(fresh.update).toHaveBeenCalledWith(
      expect.objectContaining({
        issue_number: 41,
        state: "closed",
        state_reason: "not_planned",
      }),
    );

    const cached = harness({ issues: [existing(oldAlert)] });
    await updateQueue(cached, signal(item("cache", { candidates: [] })));
    expect(cached.createComment).not.toHaveBeenCalled();
    expect(cached.update).not.toHaveBeenCalled();
  });

  it("uses run attempt as part of idempotence while keeping reruns actionable", async () => {
    const previous = item();
    const changed = item("fetched", { candidates: [SECOND_CANDIDATE] });
    const attemptOneBody = attemptMarker(changed, 123, 1);
    const sameAttempt = harness({
      issues: [existing(previous)],
      comments: { 41: [botComment(attemptOneBody)] },
    });
    await updateQueue(sameAttempt, signal(changed));
    expect(sameAttempt.createComment).not.toHaveBeenCalled();

    const rerun = harness({
      issues: [existing(previous)],
      comments: { 41: [botComment(attemptOneBody)] },
      context: { runAttempt: 2 },
    });
    await updateQueue(rerun, signal(changed));
    expect(rerun.createComment).toHaveBeenCalledOnce();
    expect(rerun.createComment.mock.calls[0]?.[0].body).toContain(
      `${lifecycle.ATTEMPT_MARKER_PREFIX}123:2:${PROFILE_ID}:${QUERY_ID} -->`,
    );

    const substringOnly = harness({
      issues: [existing(previous)],
      comments: {
        41: [botComment(`prefix ${attemptMarker(changed, 123, 1)} suffix`)],
      },
    });
    await updateQueue(substringOnly, signal(changed));
    expect(substringOnly.createComment).toHaveBeenCalledOnce();
  });

  it("finishes an interrupted expiry close without duplicating attempt evidence", async () => {
    const oldAlert = item("fetched", {
      observedAt: "2026-07-01T12:00:00.000Z",
      expiresAt: "2026-07-31T12:00:00.000Z",
    });
    const quiet = item("fetched", { candidates: [] });
    const h = harness({
      issues: [existing(oldAlert)],
      comments: { 41: [botComment(attemptMarker(quiet, 123, 1))] },
    });
    await updateQueue(h, signal(quiet));

    expect(h.createComment).not.toHaveBeenCalled();
    expect(h.update).toHaveBeenCalledWith(
      expect.objectContaining({ state: "closed" }),
    );
  });

  it("fails closed before label or issue calls without attempt-scoped context", async () => {
    const h = harness({ context: { runAttempt: undefined } });
    await updateQueue(h, signal(item()));

    expect(h.setFailed).toHaveBeenCalledWith(
      expect.stringContaining("run attempt"),
    );
    expect(h.getLabel).not.toHaveBeenCalled();
    expect(h.create).not.toHaveBeenCalled();
  });
});
