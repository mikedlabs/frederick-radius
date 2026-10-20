import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";
import { mkdtempSync, writeFileSync, readFileSync, readdirSync, statSync, existsSync, mkdirSync, symlinkSync, linkSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { spawn, spawnSync } from "node:child_process";

const require = createRequire(import.meta.url);
const helperPath = fileURLToPath(new URL("./manual-merchant-budget.cjs", import.meta.url));
const { SCOPE, checkManualMerchantBudget, reserveManualMerchantAttempt } = require(helperPath);
const repo = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const cli = join(repo, "scripts/manual-merchant-refresh-budget.ts");
const sources = [
  { slug: "sumittra-thai-cuisine", url: "https://www.sumittra.com/" },
  { slug: "the-curious-iguana-frederick", url: "https://curiousiguana.com/" },
];
const now = new Date("2026-10-20T12:00:00.000Z");
const limits = { maximum_page_attempts_per_utc_day: 2, maximum_page_attempts_per_utc_month: 30, maximum_attempts_per_source_refresh: 1, retries: 0, automatic_paid_github_jobs: false };
// All account-like evidence below is synthetic test data, never a private receipt.
function ledger(attempts = []) {
  return { schema_version: 1, scope: SCOPE, initialized_at: "2026-09-01T00:00:00.000Z", limits: { ...limits }, authorization: "Reviewed owner authorization; never printed.", source_watch_ledgers: "Preserve separately.", initial_balance: 500, final_balance: 499, attempts };
}
function attempt(source = sources[0], stamp = "2026-10-20T11:00:00.000Z", status = "pending") {
  return { slug: source.slug, requestedUrl: source.url, reserved_at: stamp, status, evidence: { keep: true } };
}
function fixture(t, value = ledger()) {
  const directory = mkdtempSync(join(tmpdir(), "fr-manual-budget-"));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const file = join(directory, "private-ledger.json");
  writeFileSync(file, JSON.stringify(value, null, 2) + "\n", { mode: 0o600 });
  return { directory, file };
}
const check = (file, date = now) => checkManualMerchantBudget({ ledgerPath: file, approvedSources: sources, now: date });
const reserve = (file, slug = sources[0].slug, date = now) => reserveManualMerchantAttempt({ ledgerPath: file, approvedSources: sources, slug, now: date });
const code = (expected) => (error) => error.code === expected;

test("check is read-only and returns derived UTC counters without account evidence", (t) => {
  const { file, directory } = fixture(t, ledger([attempt(sources[0], "2026-10-19T23:59:59.999Z")]));
  const before = readFileSync(file), inode = statSync(file).ino;
  const result = check(file);
  assert.equal(result.allowed, true); assert.equal(result.dailyAttempts, 0); assert.equal(result.monthlyAttempts, 1);
  assert.equal(result.day, "2026-10-20"); assert.deepEqual(result.availableSources, sources.map((s) => s.slug));
  assert.equal("initial_balance" in result, false); assert.equal("authorization" in result, false);
  assert.deepEqual(readFileSync(file), before); assert.equal(statSync(file).ino, inode);
  assert.deepEqual(readdirSync(directory), ["private-ledger.json"]);
});
test("reservation is durable before authorization, includes UUID and preserves existing evidence", (t) => {
  const { file } = fixture(t, ledger([attempt(sources[1], "2026-10-19T11:00:00.000Z", "error")]));
  const before = JSON.parse(readFileSync(file, "utf8"));
  const result = reserve(file), saved = JSON.parse(readFileSync(file, "utf8"));
  assert.equal(result.allowed, true); assert.equal(result.dailyAttempts, 1); assert.equal(result.monthlyAttempts, 2);
  assert.match(result.reservation.reservation_id, /^[0-9a-f-]{36}$/);
  assert.equal(result.reservation.reserved_at, now.toISOString()); assert.equal(result.reservation.requestedUrl, sources[0].url);
  assert.equal(result.reservation.reserved_before_call, true); assert.equal(result.reservation.status, "reserved");
  assert.deepEqual(saved.attempts[0], before.attempts[0]); assert.deepEqual(saved.attempts[1], result.reservation);
  for (const key of Object.keys(before).filter((k) => k !== "attempts")) assert.deepEqual(saved[key], before[key]);
  assert.equal(statSync(file).mode & 0o777, 0o600); assert.equal(existsSync(file + ".lock"), false);
});
test("pending, error and unknown outcome rows all spend one attempt", (t) => {
  for (const status of ["pending", "error", "unknown", "reserved", "completed"]) {
    const { file } = fixture(t, ledger([attempt(sources[0], "2026-10-20T11:00:00.000Z", status)]));
    assert.equal(check(file).dailyAttempts, 1);
    assert.throws(() => reserve(file), code("source_used_today"));
    const second = reserve(file, sources[1].slug);
    assert.equal(second.dailyAttempts, 2); assert.equal(second.canReserveAnother, false);
    assert.equal(check(file).allowed, false);
  }
});
test("daily ceiling blocks a third reservation without modifying history", (t) => {
  const { file } = fixture(t, ledger([attempt(), attempt(sources[1])]));
  const before = readFileSync(file);
  assert.equal(check(file).reason, "daily_limit");
  assert.throws(() => reserve(file), code("daily_limit"));
  assert.deepEqual(readFileSync(file), before); assert.equal(existsSync(file + ".lock"), false);
});
function thirtyAttempts() {
  return Array.from({ length: 15 }, (_, i) => sources.map((s) => attempt(s, `2026-10-${String(i + 1).padStart(2, "0")}T11:00:00.000Z`))).flat();
}
test("monthly ceiling blocks a new UTC day even with no attempts today", (t) => {
  const { file } = fixture(t, ledger(thirtyAttempts()));
  assert.equal(check(file).dailyAttempts, 0); assert.equal(check(file).monthlyAttempts, 30);
  assert.equal(check(file).reason, "monthly_limit"); assert.throws(() => reserve(file), code("monthly_limit"));
});
test("UTC month rollover preserves history and admits new reservations", (t) => {
  const { file } = fixture(t, ledger(thirtyAttempts()));
  const result = reserve(file, sources[0].slug, new Date("2026-11-01T00:00:00.000Z"));
  assert.equal(result.monthlyAttempts, 1); assert.equal(result.day, "2026-11-01");
  assert.equal(JSON.parse(readFileSync(file, "utf8")).attempts.length, 31);
});
test("the same source may reserve after exact UTC day rollover, not an Eastern date shortcut", (t) => {
  const { file } = fixture(t, ledger([attempt(sources[0], "2026-10-19T23:59:59.999Z")]));
  const result = reserve(file, sources[0].slug, new Date("2026-10-20T00:00:00.000Z"));
  assert.equal(result.dailyAttempts, 1); assert.equal(result.monthlyAttempts, 2);
});
test("missing and corrupt ledgers are never initialized or reset", (t) => {
  const { file } = fixture(t); rmSync(file);
  assert.throws(() => reserve(file), code("unavailable_ledger")); assert.equal(existsSync(file), false);
  writeFileSync(file, "{corrupt account receipt"); const before = readFileSync(file);
  assert.throws(() => check(file), code("invalid_ledger")); assert.throws(() => reserve(file), code("invalid_ledger"));
  assert.deepEqual(readFileSync(file), before); assert.equal(existsSync(file + ".lock"), false);
});
test("wrong scope, schema, counters and cap overrides fail closed", (t) => {
  for (const mutate of [
    (v) => { v.scope = "source_intelligence"; }, (v) => { v.schema_version = 2; },
    (v) => { v.limits.maximum_page_attempts_per_utc_day = 3; }, (v) => { v.limits.maximum_page_attempts_per_utc_month = 31; },
    (v) => { v.limits.retries = 1; }, (v) => { v.limits.override = 100; }, (v) => { v.attempts = {}; },
    (v) => { v.attempts = [{ ...attempt(), creditsUsed: -1 }]; }, (v) => { v.attempts = [{ ...attempt(), creditsUsed: "1" }]; },
  ]) {
    const value = ledger(); mutate(value); const { file } = fixture(t, value), before = readFileSync(file);
    assert.throws(() => reserve(file), code("invalid_ledger")); assert.deepEqual(readFileSync(file), before);
  }
});
test("all historical reservation dates and ceilings remain authoritative", (t) => {
  for (const attempts of [[attempt(), attempt()], [...thirtyAttempts(), attempt(sources[0], "2026-10-16T11:00:00.000Z")]]) {
    const { file } = fixture(t, ledger(attempts)); assert.throws(() => check(file), code("invalid_ledger"));
  }
});
test("missing, impossible, non-UTC and future dates refuse reservation", (t) => {
  for (const stamp of [undefined, "not-a-date", "2026-02-30T11:00:00.000Z", "2026-10-20T11:00:00-04:00", "2026-10-20T12:00:00.001Z"]) {
    const { file } = fixture(t, ledger([attempt(sources[0], stamp)]));
    if (stamp === undefined) { const data = JSON.parse(readFileSync(file, "utf8")); delete data.attempts[0].reserved_at; writeFileSync(file, JSON.stringify(data)); }
    assert.throws(() => check(file));
  }
  const value = ledger(); value.initialized_at = "2026-10-21T00:00:00Z";
  assert.throws(() => check(fixture(t, value).file), code("future_history"));
  const { file } = fixture(t); assert.throws(() => reserve(file, sources[0].slug, new Date(NaN)), code("invalid_clock"));
  assert.equal(existsSync(file + ".lock"), false);
});
test("original microsecond UTC receipts and old reservations before ledger assembly are retained", (t) => {
  const value = ledger([{ ...attempt(), observedAt: "2026-10-20T11:05:00.123456+00:00" }]);
  value.initialized_at = "2026-10-20T11:57:44.929734+00:00";
  const { file } = fixture(t, value); const result = reserve(file, sources[1].slug);
  assert.equal(result.dailyAttempts, 2);
  assert.equal(JSON.parse(readFileSync(file, "utf8")).attempts[0].observedAt, value.attempts[0].observedAt);
});
test("unknown source and mismatched requested/final identities cannot consume another business allowance", (t) => {
  for (const row of [{ ...attempt(), slug: "not-reviewed" }, { ...attempt(), requestedUrl: "https://other.example/" }, { ...attempt(), finalUrl: "https://other.example/" }, { ...attempt(), source_url: sources[1].url }]) {
    const { file } = fixture(t, ledger([row])); assert.throws(() => check(file), code("invalid_ledger"));
  }
  const { file } = fixture(t); assert.throws(() => reserve(file, "not-reviewed"), code("unknown_source"));
  assert.equal(existsSync(file + ".lock"), false);
});
test("inconsistent observation dates and reused reservation UUIDs are rejected", (t) => {
  for (const observedAt of ["2026-10-20T10:59:59.999Z", "2026-10-20T12:00:00.001Z"]) {
    assert.throws(() => check(fixture(t, ledger([{ ...attempt(), observedAt }])).file), code("future_history"));
  }
  const id = "91c62741-0ab0-42b4-9fa2-690cd56e0d9f";
  assert.throws(() => check(fixture(t, ledger([{ ...attempt(), reservation_id: id }, { ...attempt(sources[1]), reservation_id: id }])).file), code("invalid_ledger"));
});
test("private ledger cannot be in a Git worktree, nested folder or symlink into one", (t) => {
  for (const gitMarker of ["directory", "file"]) {
    const { directory } = fixture(t); const worktree = join(directory, gitMarker); mkdirSync(worktree);
    if (gitMarker === "directory") mkdirSync(join(worktree, ".git")); else writeFileSync(join(worktree, ".git"), "gitdir: /reviewed/metadata");
    mkdirSync(join(worktree, "nested")); const file = join(worktree, "nested", "ledger.json"); writeFileSync(file, JSON.stringify(ledger()));
    assert.throws(() => check(file), code("public_ledger_path"));
    const alias = join(directory, `alias-${gitMarker}`); symlinkSync(join(worktree, "nested"), alias);
    assert.throws(() => check(join(alias, "ledger.json")), code("public_ledger_path"));
  }
});
test("relative paths, file symlinks and directories are refused", (t) => {
  const { directory, file } = fixture(t);
  assert.throws(() => check("relative-ledger.json"), code("invalid_ledger_path"));
  const link = join(directory, "alias.json"); symlinkSync(file, link);
  assert.throws(() => reserve(link), code("invalid_ledger_path"));
  assert.throws(() => check(directory), code("invalid_ledger_path"));
});
test("hard-linked aliases cannot create two independent locks for one ledger", (t) => {
  const { directory, file } = fixture(t); const alias = join(directory, "hard-alias.json"); linkSync(file, alias);
  assert.throws(() => reserve(alias), code("invalid_ledger_path"));
  assert.throws(() => reserve(file), code("invalid_ledger_path"));
  assert.equal(JSON.parse(readFileSync(file, "utf8")).attempts.length, 0);
});
test("an interrupted atomic rename never authorizes a provider or corrupts old history", (t) => {
  const { file, directory } = fixture(t); const before = readFileSync(file), fs = require("node:fs"), original = fs.renameSync;
  let providerCalled = false;
  try {
    fs.renameSync = () => { throw new Error("Simulated rename failure."); };
    assert.throws(() => { reserve(file); providerCalled = true; }, /rename failure/);
  } finally { fs.renameSync = original; }
  assert.equal(providerCalled, false); assert.deepEqual(readFileSync(file), before);
  assert.deepEqual(readdirSync(directory), ["private-ledger.json"]);
});
test("failure after rename retains the spent reservation while authorizing no provider", (t) => {
  const { file } = fixture(t); const fs = require("node:fs"), original = fs.fsyncSync;
  let syncs = 0, providerCalled = false;
  try {
    fs.fsyncSync = (descriptor) => { if (++syncs === 3) throw new Error("Simulated directory sync failure."); original(descriptor); };
    assert.throws(() => { reserve(file); providerCalled = true; }, /directory sync failure/);
  } finally { fs.fsyncSync = original; }
  assert.equal(providerCalled, false); assert.equal(check(file).dailyAttempts, 1);
  assert.throws(() => reserve(file), code("source_used_today"));
});
test("the helper refuses an expanded or malformed manual source registry", (t) => {
  const { file } = fixture(t);
  for (const approvedSources of [[sources[0]], [...sources, { slug: "another", url: "https://another.example/" }], [sources[0], sources[0]], [{ slug: 42, url: "https://another.example/" }, sources[1]]]) {
    assert.throws(() => checkManualMerchantBudget({ ledgerPath: file, approvedSources, now }), code("invalid_sources"));
  }
});
test("a stale or foreign lock is never reclaimed or removed by check/reserve", (t) => {
  const { file } = fixture(t); const lock = file + ".lock";
  const evidence = '{"owner":"another-run","reserved_at":"2020-01-01T00:00:00Z"}\n'; writeFileSync(lock, evidence);
  assert.throws(() => check(file), code("ledger_locked")); assert.throws(() => reserve(file), code("ledger_locked"));
  assert.equal(readFileSync(lock, "utf8"), evidence); assert.equal(JSON.parse(readFileSync(file, "utf8")).attempts.length, 0);
});
function contender(file) {
  const child = spawn(process.execPath, ["-e", `const h=require(process.argv[1]);process.send('ready');process.once('message',()=>{try{const result=h.reserveManualMerchantAttempt({ledgerPath:process.argv[2],approvedSources:JSON.parse(process.argv[3]),slug:JSON.parse(process.argv[3])[0].slug});process.send({allowed:result.allowed});}catch(e){process.send({allowed:false,code:e.code});}process.disconnect();});`, helperPath, file, JSON.stringify(sources)], { stdio: ["ignore", "ignore", "pipe", "ipc"] });
  let result;
  const ready = new Promise((resolveReady, reject) => { child.once("error", reject); child.once("message", resolveReady); });
  const done = new Promise((resolveDone, reject) => { child.on("message", (message) => { if (message !== "ready") result = message; }); child.once("error", reject); child.once("exit", (status) => status === 0 ? resolveDone(result) : reject(new Error("Budget child failed."))); });
  return { child, ready, done };
}
test("concurrent native processes cannot reserve the same source twice or lose history", { timeout: 10000 }, async (t) => {
  const { file } = fixture(t); const children = [contender(file), contender(file)];
  t.after(() => children.forEach(({ child }) => { if (child.exitCode === null) child.kill(); }));
  await Promise.all(children.map((value) => value.ready)); children.forEach(({ child }) => child.send("reserve"));
  const results = await Promise.all(children.map((value) => value.done));
  assert.equal(results.filter((r) => r.allowed).length, 1);
  assert.ok(["ledger_locked", "source_used_today"].includes(results.find((r) => !r.allowed).code));
  const saved = JSON.parse(readFileSync(file, "utf8")); assert.equal(saved.attempts.length, 1); assert.equal(saved.attempts[0].slug, sources[0].slug);
  assert.equal(existsSync(file + ".lock"), false);
});
test("CLI derives the real manual registry, stays read-only for check and rejects extra/cap flags", (t) => {
  const { file } = fixture(t); const before = readFileSync(file);
  const invoke = (...args) => spawnSync(process.execPath, ["--import", "tsx", cli, ...args], { cwd: repo, encoding: "utf8", timeout: 10000 });
  const result = invoke("--ledger", file, "--check");
  assert.equal(result.status, 0, result.stderr); const value = JSON.parse(result.stdout);
  assert.deepEqual(value.availableSources, sources.map((s) => s.slug)); assert.equal(value.allowed, true); assert.deepEqual(readFileSync(file), before);
  for (const args of [["--check", "--daily-limit=10"], ["--check", "--check"], ["--check", "--reserve=" + sources[0].slug], ["--reserve=not-reviewed"], ["--init"], ["--reset"]]) {
    const failed = invoke("--ledger", file, ...args);
    assert.equal(failed.status, 1); assert.equal(JSON.parse(failed.stderr).allowed, false);
    assert.equal(failed.stderr.includes(file), false); assert.equal(failed.stderr.includes("500"), false);
    assert.deepEqual(readFileSync(file), before);
  }
});
