import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

const require = createRequire(path.join(process.cwd(), "package.json"));
const yaml = require("yaml");
const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
const NativeFunction = Function;
const helperPath = "scripts/lib/native-automated-pr-gates.cjs";
const MAIN = "a".repeat(40), HEAD = "b".repeat(40), MERGE = "c".repeat(40);
const suites = [
  { file: "ci.yml", job: "verify", phase: "preflight", method: "classifyNativeAutomatedPr", cases: ["data-only", "full", "held", "unverified-data", "unknown-mode", "fetch-failure", "ordinary-fetch-failure", "invalid-size", "size-mismatch", "syntax-failure", "execution-failure"] },
  { file: "ci.yml", job: "verify", phase: "final", method: "classifyNativeAutomatedPr", cases: ["data-only", "held", "unverified-data", "fetch-failure", "invalid-size", "size-mismatch", "syntax-failure", "execution-failure"] },
  { file: "automated-pr-checks.yml", phase: "approval", job: "dispatch", method: "approveNativeAutomatedPrRuns", cases: ["approved", "observed", "held", "wrong-ref", "main-moved", "fetch-failure", "invalid-size", "size-mismatch", "syntax-failure", "execution-failure"] },
];
for (const suite of suites) {
  const workflow = yaml.parse(readFileSync(`.github/workflows/${suite.file}`, "utf8"));
  const steps = workflow.jobs[suite.job].steps;
  const step = steps.find((row) => suite.phase === "final" ? row.id === "native_pr_recheck" : row.with?.script);
  const artifact = steps.find((row) => row.uses?.startsWith("actions/upload-artifact@") && row.with.path === step.env.NATIVE_PR_RECEIPT_PATH);
  for (const scenario of suite.cases) test(`${suite.file} ${suite.phase}: ${scenario} keeps native execution and data authority separate`, async () => {
    const classification = suite.file === "ci.yml";
    const ordinary = ["full", "ordinary-fetch-failure"].includes(scenario);
    const dir = mkdtempSync(path.join(os.tmpdir(), "radius-native-bootstrap-"));
    const receiptPath = path.join(dir, "receipt.json");
    const calls = { main: [], fetch: [], execute: [], outputs: [], exports: [], failures: [], warnings: [], logs: [], summary: [], writes: 0 };
    const context = { repo: { owner: "fixture-owner", repo: "fixture-repo" },
      ref: classification ? "refs/pull/7/merge" : scenario === "wrong-ref" ? "refs/heads/bot/data-steward" : "refs/heads/main",
      sha: classification ? MERGE : MAIN, payload: { pull_request: {
        number: 7, head: { ref: ordinary ? "codex/code-change" : "bot/data-steward", sha: HEAD,
          repo: { full_name: "fixture-owner/fixture-repo" } },
      } } };
    const receipt = classification
      ? { schema_version: 1, mode: scenario === "unknown-mode" ? "unknown" : ordinary ? "full" : scenario === "held" ? "held" : "data-only",
          verified: ["data-only", "unknown-mode"].includes(scenario), identity: { pullNumber: 7, headSha: HEAD } }
      : { schema_version: 1, state: ["approved", "observed"].includes(scenario) ? scenario : "held",
          verified: ["approved", "observed"].includes(scenario), approvalWrites: scenario === "approved" ? 2 : 0,
          runs: [{ id: 71, attempt: 1 }, { id: 72, attempt: 1 }], manualApprovalRequired: !["approved", "observed"].includes(scenario) };
    const validSource = `module.exports.${suite.method} = async (input) => { input.github.fixtureExecute(input); return ${JSON.stringify(receipt)}; };`;
    const source = scenario === "syntax-failure" ? "module.exports = {"
      : scenario === "execution-failure" ? "throw new Error('fixture helper unavailable');" : validSource;
    const bytes = Buffer.from(source);
    const github = { fixtureExecute(input) { calls.execute.push(input); }, rest: {
      git: { getRef: async (input) => { calls.main.push(input); return { data: { object: { sha: scenario === "main-moved" ? HEAD : MAIN } } }; } },
      repos: { getContent: async (input) => {
        calls.fetch.push(input);
        if (["fetch-failure", "ordinary-fetch-failure"].includes(scenario)) throw new Error("fixture getContent unavailable");
        return { data: { type: "file", path: helperPath, encoding: "base64", content: bytes.toString("base64"),
          size: scenario === "invalid-size" ? 65537 : bytes.length + (scenario === "size-mismatch" ? 1 : 0) } };
      } },
    } };
    const summary = { addHeading(value) { calls.summary.push(value); return this; },
      addCodeBlock(value) { calls.summary.push(value); return this; }, async write() {} };
    const core = { setOutput: (...values) => calls.outputs.push(values), exportVariable: (...values) => calls.exports.push(values),
      setFailed: (value) => calls.failures.push(value), warning: (value) => calls.warnings.push(value), info: (value) => calls.logs.push(value), summary };
    const env = { NATIVE_PR_RECEIPT_PATH: receiptPath, AUTOMATED_PR_BRANCH: "bot/data-steward", AUTOMATED_PR_HEAD_SHA: HEAD,
      FIXTURE_SECRET: "fixture-do-not-log-credential" };
    const restrictedRequire = (name) => { assert.equal(name, "fs"); return { writeFileSync(file, body, options) {
      assert.equal(file, receiptPath); assert.equal(options.mode, 0o600); calls.writes++; writeFileSync(file, body, options);
    } }; };
    try {
      await new AsyncFunction("github", "context", "core", "require", "process", "Buffer", "Function", step.with.script)(github, context, core, restrictedRequire, { env }, Buffer, NativeFunction);
      assert.match(artifact.if, /always\(\)/);
      assert.equal(artifact.with.path, step.env.NATIVE_PR_RECEIPT_PATH);
      assert.equal(artifact.with["if-no-files-found"], "error");
      assert.equal(artifact.with["retention-days"], 14);
      assert.equal(calls.writes, 1); assert.equal(statSync(receiptPath).mode & 0o777, 0o600);
      const raw = readFileSync(receiptPath, "utf8"), actual = JSON.parse(raw);
      assert.ok(raw.endsWith("\n"));
      assert.ok(!JSON.stringify([actual, calls.failures, calls.warnings, calls.logs, calls.summary]).includes(env.FIXTURE_SECRET));
      assert.deepEqual(calls.logs, [JSON.stringify(actual)]); assert.ok(calls.summary.includes(JSON.stringify(actual)));
      if (calls.fetch.length) assert.deepEqual(calls.fetch[0], { ...context.repo, path: helperPath, ref: MAIN });
      if (calls.execute.length) {
        assert.equal(calls.execute[0].trustedMainSha, MAIN); assert.equal(calls.execute[0].context, context);
        if (!classification) { assert.equal(calls.execute[0].branch, env.AUTOMATED_PR_BRANCH); assert.equal(calls.execute[0].headSha, HEAD); }
      }
      if (classification) {
        assert.deepEqual(calls.outputs[0], ["data_only", "false"]);
        if (scenario === "data-only") { assert.deepEqual(calls.exports, [["AUTOMATED_DATA_PR", "1"]]); assert.deepEqual(calls.outputs.at(-1), ["data_only", "true"]); }
        else { assert.deepEqual(calls.exports, []); assert.ok(calls.outputs.every((row) => row[1] === "false")); }
        assert.equal(calls.failures.length, ordinary || scenario === "data-only" ? 0 : 1);
        assert.equal(actual.mode, ["fetch-failure", "invalid-size", "size-mismatch", "syntax-failure", "execution-failure"].includes(scenario) ? "held" : scenario === "ordinary-fetch-failure" ? "full" : receipt.mode);
      } else {
        assert.equal(calls.failures.length, ["approved", "observed"].includes(scenario) ? 0 : 1);
        assert.deepEqual(calls.exports, []);
        if (["approved", "observed", "held"].includes(scenario)) assert.deepEqual(actual, receipt);
        else { assert.equal(actual.state, "held"); assert.equal(actual.verified, false); assert.equal(actual.manualApprovalRequired, true); }
        if (scenario === "wrong-ref") { assert.equal(calls.main.length, 0); assert.equal(calls.fetch.length, 0); }
        if (scenario === "main-moved") assert.equal(calls.fetch.length, 0);
      }
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
}
