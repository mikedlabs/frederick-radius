/* eslint-disable @typescript-eslint/no-require-imports -- Offline CommonJS helper shared with native node:test. */
"use strict";

// Manual merchant reads are separate from automated source-watch ledgers.
// This helper never creates a ledger, resets history, or calls a provider.
const fs = require("node:fs");
const path = require("node:path");
const { randomUUID } = require("node:crypto");

const SCOPE = "explicit_manual_merchant_maintenance";
const DAILY_LIMIT = 2;
const MONTHLY_LIMIT = 30;
const MAX_LEDGER_BYTES = 2 * 1024 * 1024;
const FIXED_LIMITS = Object.freeze({
  maximum_page_attempts_per_utc_day: DAILY_LIMIT,
  maximum_page_attempts_per_utc_month: MONTHLY_LIMIT,
  maximum_attempts_per_source_refresh: 1,
  retries: 0,
  automatic_paid_github_jobs: false,
});

function denied(code, message) {
  const error = new Error(message);
  error.name = "ManualMerchantBudgetError";
  error.code = code;
  return error;
}
function object(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
function clock(now) {
  if (!(now instanceof Date) || !Number.isFinite(now.getTime())) {
    throw denied("invalid_clock", "The current UTC clock is invalid; no read is authorized.");
  }
  return now.getTime();
}
function timestamp(value) {
  // Accept the original receipt's UTC microseconds without rewriting history.
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|\+00:00)$/.test(value)) {
    throw denied("invalid_ledger", "The manual ledger has an invalid observation or reservation date.");
  }
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed) || new Date(parsed).toISOString().slice(0, 19) !== value.slice(0, 19)) {
    throw denied("invalid_ledger", "The manual ledger has an invalid observation or reservation date.");
  }
  return parsed;
}
function approvedSourceMap(approvedSources) {
  if (!Array.isArray(approvedSources) || approvedSources.length !== 2) {
    throw denied("invalid_sources", "Exactly two reviewed manual merchant sources are required.");
  }
  const sources = new Map();
  for (const source of approvedSources) {
    let url;
    try { url = new URL(source?.url); } catch { /* Rejected below. */ }
    if (!object(source) || typeof source.slug !== "string" || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(source.slug) || sources.has(source.slug)
      || !url || url.protocol !== "https:" || url.username || url.password || url.port || url.search || url.hash
      || url.href !== source.url) {
      throw denied("invalid_sources", "The reviewed manual merchant source identities are invalid.");
    }
    sources.set(source.slug, source.url);
  }
  return sources;
}
function assertNotInGit(directory) {
  for (let cursor = directory; ; cursor = path.dirname(cursor)) {
    try {
      fs.lstatSync(path.join(cursor, ".git"));
      throw denied("public_ledger_path", "The private manual ledger must be outside every Git worktree.");
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
    if (path.dirname(cursor) === cursor) break;
  }
}
function privateLedgerPath(ledgerPath) {
  if (typeof ledgerPath !== "string" || !path.isAbsolute(ledgerPath) || ledgerPath.includes("\0")) {
    throw denied("invalid_ledger_path", "An existing absolute private ledger path is required.");
  }
  try {
    const directory = fs.realpathSync(path.dirname(ledgerPath));
    assertNotInGit(directory);
    const canonical = path.join(directory, path.basename(ledgerPath));
    const stat = fs.lstatSync(canonical);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1) {
      throw denied("invalid_ledger_path", "The existing private ledger must be one regular file, not a symlink or hard-linked alias.");
    }
    return canonical;
  } catch (error) {
    if (error.code === "public_ledger_path" || error.code === "invalid_ledger_path") throw error;
    throw denied("unavailable_ledger", "The private manual ledger is missing or inaccessible; do not initialize or reset it.");
  }
}
function readLedger(file) {
  let descriptor;
  try {
    descriptor = fs.openSync(file, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW);
    const stat = fs.fstatSync(descriptor);
    if (!stat.isFile() || stat.size > MAX_LEDGER_BYTES) throw new Error("Invalid ledger file.");
    const raw = fs.readFileSync(descriptor, "utf8");
    if (Buffer.byteLength(raw) > MAX_LEDGER_BYTES) throw new Error("Invalid ledger file.");
    const value = JSON.parse(raw);
    return value;
  } catch {
    throw denied("invalid_ledger", "The private manual ledger is unreadable or corrupt; preserve it and stop paid reads.");
  } finally {
    if (descriptor !== undefined) fs.closeSync(descriptor);
  }
}
function validateLedger(value, sources, now) {
  const nowMs = clock(now);
  if (!object(value) || value.schema_version !== 1 || value.scope !== SCOPE
    || !object(value.limits) || Object.keys(value.limits).length !== Object.keys(FIXED_LIMITS).length
    || Object.entries(FIXED_LIMITS).some(([key, expected]) => value.limits[key] !== expected)
    || !Array.isArray(value.attempts)) {
    throw denied("invalid_ledger", "The manual ledger scope, fixed limits or attempt history is invalid.");
  }
  if (timestamp(value.initialized_at) > nowMs) {
    throw denied("future_history", "The manual ledger clock is ahead of the current clock; no read is authorized.");
  }
  const days = new Map(), months = new Map(), sourceDays = new Set(), reservationIds = new Set();
  for (const attempt of value.attempts) {
    const expectedUrl = object(attempt) && sources.get(attempt.slug);
    const urls = object(attempt) ? ["requestedUrl", "source_url", "url"].filter((key) => Object.hasOwn(attempt, key)).map((key) => attempt[key]) : [];
    if (!expectedUrl || !urls.length || urls.some((url) => url !== expectedUrl)
      || (Object.hasOwn(attempt, "finalUrl") && attempt.finalUrl !== expectedUrl)
      || typeof attempt.status !== "string" || !attempt.status.trim()
      || (Object.hasOwn(attempt, "creditsUsed") && (!Number.isSafeInteger(attempt.creditsUsed) || attempt.creditsUsed < 0))) {
      throw denied("invalid_ledger", "A manual attempt has an unknown source, mismatched URL or invalid counter/status.");
    }
    const reserved = timestamp(attempt.reserved_at);
    if (reserved > nowMs) throw denied("future_history", "Manual reservation history is ahead of the current clock; no read is authorized.");
    if (Object.hasOwn(attempt, "observedAt")) {
      const observed = timestamp(attempt.observedAt);
      if (observed < reserved || observed > nowMs) throw denied("future_history", "Manual observation history is inconsistent; no read is authorized.");
    }
    if (Object.hasOwn(attempt, "reservation_id")) {
      if (typeof attempt.reservation_id !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(attempt.reservation_id) || reservationIds.has(attempt.reservation_id)) {
        throw denied("invalid_ledger", "The manual ledger has invalid or duplicate reservation identities.");
      }
      reservationIds.add(attempt.reservation_id);
    }
    const day = new Date(reserved).toISOString().slice(0, 10), month = day.slice(0, 7);
    const sourceDay = `${day}:${attempt.slug}`;
    if (sourceDays.has(sourceDay)) throw denied("invalid_ledger", "The manual ledger repeats a source in one UTC day; history needs review.");
    sourceDays.add(sourceDay);
    days.set(day, (days.get(day) ?? 0) + 1);
    months.set(month, (months.get(month) ?? 0) + 1);
    if (days.get(day) > DAILY_LIMIT || months.get(month) > MONTHLY_LIMIT) {
      throw denied("invalid_ledger", "The manual ledger exceeds an immutable historical attempt ceiling.");
    }
  }
  const day = now.toISOString().slice(0, 10), month = day.slice(0, 7);
  const dailyAttempts = days.get(day) ?? 0, monthlyAttempts = months.get(month) ?? 0;
  const availableSources = [...sources.keys()].filter((slug) => !sourceDays.has(`${day}:${slug}`));
  const reason = dailyAttempts >= DAILY_LIMIT ? "daily_limit" : monthlyAttempts >= MONTHLY_LIMIT ? "monthly_limit" : availableSources.length === 0 ? "sources_used_today" : null;
  return { allowed: reason === null, scope: SCOPE, day, month, dailyAttempts, monthlyAttempts, dailyLimit: DAILY_LIMIT, monthlyLimit: MONTHLY_LIMIT, availableSources, reason };
}
function noExistingLock(file) {
  try { fs.lstatSync(`${file}.lock`); } catch (error) {
    if (error.code === "ENOENT") return;
    throw denied("ledger_locked", "The manual ledger lock cannot be verified; no read is authorized.");
  }
  throw denied("ledger_locked", "Another manual reservation holds the ledger lock; do not retry or remove it without review.");
}
function checkManualMerchantBudget({ ledgerPath, approvedSources, now = new Date() }) {
  const sources = approvedSourceMap(approvedSources), file = privateLedgerPath(ledgerPath);
  noExistingLock(file);
  return validateLedger(readLedger(file), sources, now);
}
function reserveManualMerchantAttempt({ ledgerPath, approvedSources, slug, now = new Date() }) {
  clock(now);
  const sources = approvedSourceMap(approvedSources);
  if (!sources.has(slug)) throw denied("unknown_source", "Only an exact reviewed manual merchant source may be reserved.");
  const file = privateLedgerPath(ledgerPath), lock = `${file}.lock`, owner = randomUUID();
  let descriptor, ownsLock = false, temporary;
  try {
    try { descriptor = fs.openSync(lock, "wx", 0o600); ownsLock = true; }
    catch { throw denied("ledger_locked", "Another manual reservation holds the ledger lock; no provider read is authorized."); }
    fs.writeFileSync(descriptor, JSON.stringify({ owner, reserved_at: now.toISOString() }) + "\n", "utf8");
    fs.fsyncSync(descriptor); fs.closeSync(descriptor); descriptor = undefined;
    const ledger = readLedger(file), before = validateLedger(ledger, sources, now);
    if (!before.allowed) throw denied(before.reason, "The manual merchant attempt ceiling is exhausted; no provider read is authorized.");
    if (!before.availableSources.includes(slug)) throw denied("source_used_today", "This manual source already has a reservation today; do not retry it.");
    const reservation = { reservation_id: randomUUID(), slug, requestedUrl: sources.get(slug), reserved_at: now.toISOString(), reserved_before_call: true, status: "reserved" };
    ledger.attempts.push(reservation);
    const after = validateLedger(ledger, sources, now);
    temporary = `${file}.tmp-${randomUUID()}`;
    descriptor = fs.openSync(temporary, "wx", 0o600);
    fs.writeFileSync(descriptor, JSON.stringify(ledger, null, 2) + "\n", "utf8");
    fs.fsyncSync(descriptor); fs.closeSync(descriptor); descriptor = undefined;
    fs.renameSync(temporary, file); temporary = undefined;
    descriptor = fs.openSync(path.dirname(file), fs.constants.O_RDONLY);
    fs.fsyncSync(descriptor); fs.closeSync(descriptor); descriptor = undefined;
    return { ...after, allowed: true, reason: null, canReserveAnother: after.allowed, nextRestriction: after.reason, reservation };
  } finally {
    if (descriptor !== undefined) fs.closeSync(descriptor);
    if (temporary) { try { fs.unlinkSync(temporary); } catch (error) { if (error.code !== "ENOENT") throw error; } }
    if (ownsLock) {
      // Never reclaim an abandoned lock or unlink one whose ownership changed.
      let stored;
      try { stored = JSON.parse(fs.readFileSync(lock, "utf8")); } catch { /* Preserve uncertain locks. */ }
      if (stored?.owner === owner) fs.unlinkSync(lock);
    }
  }
}
module.exports = { SCOPE, DAILY_LIMIT, MONTHLY_LIMIT, checkManualMerchantBudget, reserveManualMerchantAttempt };
