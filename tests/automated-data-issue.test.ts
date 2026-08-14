import { createRequire } from "node:module";
import assert from "node:assert/strict";
import test from "node:test";

const require = createRequire(import.meta.url);
const {
  closeRecovered,
  upsertFailure,
}: {
  closeRecovered: (args: Record<string, unknown>) => Promise<number>;
  upsertFailure: (args: Record<string, unknown>) => Promise<{ number: number }>;
} = require("../scripts/lib/automated-data-issue.cjs");

type RecordedCall = { method: string; payload: Record<string, unknown> };

function githubMock(openIssues: Array<Record<string, unknown>>) {
  const calls: RecordedCall[] = [];
  return {
    calls,
    github: {
      paginate: async () => openIssues,
      rest: {
        issues: {
          listForRepo: () => undefined,
          create: async (payload: Record<string, unknown>) => {
            calls.push({ method: "create", payload });
            return { data: { id: 999, number: 99, ...payload } };
          },
          update: async (payload: Record<string, unknown>) => {
            calls.push({ method: "update", payload });
            return { data: payload };
          },
          createComment: async (payload: Record<string, unknown>) => {
            calls.push({ method: "comment", payload });
            return { data: payload };
          },
        },
      },
    },
  };
}

const context = {
  repo: { owner: "mikedlabs", repo: "frederick-radius" },
  runId: 1234,
};

test("creates one stable issue with a run link when none is open", async () => {
  const { github, calls } = githubMock([]);
  const issue = await upsertFailure({
    github,
    context,
    family: "refresh",
    body: "mdot_chart failed with HTTP 403",
  });

  assert.equal(issue.number, 99);
  assert.equal(calls.length, 1);
  assert.equal(calls[0]?.method, "create");
  assert.equal(calls[0]?.payload.title, "Data refresh failure · active");
  assert.match(String(calls[0]?.payload.body), /automated-data-issue:refresh/);
  assert.match(String(calls[0]?.payload.body), /actions\/runs\/1234/);
});

test("keeps public-data acceptance separate from deploy integrity", async () => {
  const { github, calls } = githubMock([]);
  await upsertFailure({
    github,
    context,
    family: "data",
    body: "Event inventory is below its public coverage floor.",
  });

  assert.equal(calls[0]?.payload.title, "Public data acceptance failed · active");
  assert.match(String(calls[0]?.payload.body), /automated-data-issue:data/);
});

test("keeps workflow availability separate from collector and data failures", async () => {
  const { github, calls } = githubMock([]);
  await upsertFailure({
    github,
    context,
    family: "automation",
    body: "GitHub stopped the workflow before any repository job began.",
  });

  assert.equal(calls[0]?.payload.title, "Data automation unavailable · active");
  assert.match(
    String(calls[0]?.payload.body),
    /automated-data-issue:automation/,
  );
});

test("updates the newest issue and closes older duplicates", async () => {
  const { github, calls } = githubMock([
    { id: 100, number: 10, title: "Data refresh failure 2026-07-30", body: "", user: { type: "Bot" } },
    { id: 120, number: 12, title: "Data refresh failure 2026-07-31", body: "", user: { login: "github-actions[bot]" } },
    { number: 11, title: "Unrelated", body: "" },
  ]);

  const issue = await upsertFailure({
    github,
    context,
    family: "refresh",
    body: "one source failed",
  });

  assert.equal(issue.number, 12);
  assert.equal(calls[0]?.method, "update");
  assert.equal(calls[0]?.payload.issue_number, 12);
  assert.equal(Object.hasOwn(calls[0]?.payload ?? {}, "labels"), false);
  assert.equal(calls[1]?.method, "comment");
  assert.equal(calls[1]?.payload.issue_number, 10);
  assert.equal(calls[2]?.payload.state_reason, "duplicate");
  assert.equal(calls[2]?.payload.duplicate_issue_id, 120);
  assert.equal(calls.some((call) => call.payload.issue_number === 11), false);
});

test("closes every recovered issue in a family and ignores pull requests", async () => {
  const { github, calls } = githubMock([
    { id: 70, number: 7, title: "Stale data sources 2026-06-01", body: "", user: { type: "Bot" } },
    {
      number: 8,
      title: "Different title",
      body: "<!-- automated-data-issue:freshness -->",
    },
    {
      number: 9,
      title: "Stale data sources from a PR",
      body: "",
      pull_request: {},
    },
  ]);

  const closed = await closeRecovered({
    github,
    context,
    family: "freshness",
    recoveryMessage: "Freshness is back within policy.",
  });

  assert.equal(closed, 2);
  assert.equal(calls.filter((call) => call.method === "comment").length, 2);
  assert.equal(
    calls.filter(
      (call) => call.method === "update" && call.payload.state === "closed",
    ).length,
    2,
  );
  assert.equal(calls.some((call) => call.payload.issue_number === 9), false);
});

test("does not rewrite a human issue that merely resembles a legacy title", async () => {
  const { github, calls } = githubMock([
    {
      id: 21,
      number: 21,
      title: "Data refresh failure 2026-07-31",
      body: "Please investigate my import.",
      user: { login: "mikedlabs", type: "User" },
    },
  ]);

  await upsertFailure({
    github,
    context,
    family: "refresh",
    body: "automated source failed",
  });

  assert.equal(calls.length, 1);
  assert.equal(calls[0]?.method, "create");
});
