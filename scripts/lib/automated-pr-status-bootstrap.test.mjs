import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

// Execute the actual workflow bootstrap, not a copied approximation. Only the
// helper response, GitHub/core interfaces and receipt filesystem are controlled.
const require = createRequire(path.join(process.cwd(), "package.json"));
const workflow = require("yaml").parse(readFileSync(".github/workflows/automated-pr-status-bridge.yml", "utf8"));
const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
const NativeFunction = Function;
const helperPath = "scripts/lib/automated-pr-status-bridge.cjs";
const scenarios = ["wrong-ref", "fetch-failure", "invalid-size", "size-mismatch", "syntax-failure", "execution-failure", "valid"];

for (const jobName of ["attach", "reconcile-stale"]) {
  const job = workflow.jobs[jobName];
  const step = job.steps.find((candidate) => candidate.with?.script);
  const artifact = job.steps.find((candidate) => candidate.uses?.startsWith("actions/upload-artifact@"));
  for (const scenario of scenarios) test(`${jobName}: ${scenario} retains a private receipt`, async () => {
    assert.match(artifact.if, /always\(\)/);
    assert.equal(artifact.with.path, step.env.BRIDGE_RECEIPT_PATH);
    assert.equal(artifact.with["if-no-files-found"], "error");
    const dir = mkdtempSync(path.join(process.env.BRIDGE_BOOTSTRAP_TMP || os.tmpdir(), "radius-bridge-bootstrap-"));
    const receiptPath = path.join(dir, "receipt.json");
    const calls = { fetch: [], construct: 0, execute: 0, write: 0, failures: [], logs: [], summary: [] };
    const context = { ref: scenario === "wrong-ref" ? "refs/heads/bot/data-steward" : "refs/heads/main",
      sha: "a".repeat(40), runId: 1700, repo: { owner: "fixture-owner", repo: "fixture-repo" } };
    const validReceipt = { schema_version: 2, mode: jobName, verified: true, fixture: "exact helper result",
      targets: [{ sha: "b".repeat(40), checks: [101, 102] }] };
    const goodSource = `module.exports = { attachAutomatedPrStatuses: async () => (${JSON.stringify(validReceipt)}), reconcileStaleAutomatedPrStatuses: async () => (${JSON.stringify(validReceipt)}) };`;
    const source = scenario === "syntax-failure" ? "module.exports = {"
      : scenario === "execution-failure" ? "throw new Error('fixture bootstrap execution failed');" : goodSource;
    const bytes = Buffer.from(source);
    const github = { rest: { repos: { getContent: async (input) => {
      calls.fetch.push(input);
      if (scenario === "fetch-failure") throw new Error("fixture getContent unavailable");
      return { data: { type: "file", path: helperPath, encoding: "base64", content: bytes.toString("base64"),
        size: scenario === "invalid-size" ? 65537 : bytes.length + (scenario === "size-mismatch" ? 1 : 0) } };
    } } } };
    function TrackedFunction(...args) {
      calls.construct++;
      const execute = new NativeFunction(...args);
      return (...values) => { calls.execute++; return execute(...values); };
    }
    const summary = { addHeading(value) { calls.summary.push(value); return this; },
      addCodeBlock(value) { calls.summary.push(value); return this; }, async write() {} };
    const core = { setFailed: (value) => calls.failures.push(value), info: (value) => calls.logs.push(value), summary };
    const canary = "fixture-do-not-log-credential";
    const env = { BRIDGE_RECEIPT_PATH: receiptPath, GITHUB_RUN_ATTEMPT: "2", AUTOMATED_PR_TOKEN: canary,
      AUTOMATED_PR_BRANCH: "bot/data-steward", AUTOMATED_PR_HEAD_SHA: "b".repeat(40),
      AUTOMATED_PR_CI_RUN_ID: "71", AUTOMATED_PR_STYLE_RUN_ID: "72" };
    const restrictedRequire = (name) => {
      assert.equal(name, "fs");
      return { writeFileSync(file, body, options) {
        assert.equal(file, receiptPath); assert.equal(options.mode, 0o600); calls.write++;
        writeFileSync(file, body, options);
      } };
    };
    try {
      const execute = new AsyncFunction("github", "context", "core", "require", "process", "Buffer", "Function", step.with.script);
      await execute(github, context, core, restrictedRequire, { env }, Buffer, TrackedFunction);
      assert.equal(calls.write, 1);
      assert.equal(statSync(receiptPath).mode & 0o777, 0o600);
      const raw = readFileSync(receiptPath, "utf8"), receipt = JSON.parse(raw);
      assert.ok(raw.endsWith("\n"));
      assert.ok(!JSON.stringify([receipt, calls.failures, calls.logs, calls.summary]).includes(canary));
      assert.deepEqual(calls.logs, [JSON.stringify(receipt)]);
      assert.ok(calls.summary.includes(JSON.stringify(receipt)));
      if (scenario === "valid") {
        assert.deepEqual(receipt, validReceipt); assert.deepEqual(calls.failures, []);
        assert.equal(calls.construct, 1); assert.equal(calls.execute, 1);
      } else {
        assert.equal(receipt.verified, false); assert.equal(receipt.phase, "preflight");
        assert.deepEqual(receipt.workflow, { sha: context.sha, runId: 1700, runAttempt: 2 });
        assert.equal(calls.failures.length, 1); assert.equal(receipt.failure, calls.failures[0]);
        assert.equal(calls.execute, scenario === "execution-failure" ? 1 : 0);
        assert.equal(calls.construct, ["syntax-failure", "execution-failure"].includes(scenario) ? 1 : 0);
      }
      assert.equal(calls.fetch.length, scenario === "wrong-ref" ? 0 : 1);
      if (calls.fetch.length) assert.deepEqual(calls.fetch[0], { ...context.repo, path: helperPath, ref: context.sha });
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
}
