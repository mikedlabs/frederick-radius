#!/usr/bin/env node
/**
 * migration-audit.mjs — guard the hand-applied migration discipline (mig-1).
 *
 * Migrations in this repo are applied BY HAND in the Supabase SQL editor and
 * drizzle/meta/_journal.json is intentionally partial (see drizzle/README.md),
 * so nothing reconciles "what's committed" against "what's recorded as applied."
 * This script keeps an explicit ledger (drizzle/applied.json) honest without
 * pretending that observable production effects prove when or how a migration
 * file ran:
 *
 *   node scripts/migration-audit.mjs            # AUDIT (CI / manual gate)
 *   node scripts/migration-audit.mjs --write    # seed/update the ledger
 *
 * AUDIT mode (exit 1 on any drift):
 *   - every drizzle/NNNN_*.sql is present in the ledger
 *   - each ledger sha256 still matches the file on disk (a migration edited
 *     after production evidence was recorded is drift)
 *   - no ledger entry points at a file that no longer exists
 *   - every entry has one explicit production_state:
 *       unverified         — production has not been checked
 *       effects_present    — the expected effects exist, provenance unknown
 *       effects_absent     — a live check found the expected effects missing
 *       migration_recorded — Supabase migration history confirms a named run
 *
 * --write mode: adds any new migration files as production_state:"unverified"
 * and refreshes recorded hashes only for entries that remain unverified. It
 * will NOT silently rewrite a hash once production evidence has been recorded.
 *
 * Intentionally DB-free: it runs in CI with no DATABASE_URL (per CLAUDE.md, CI
 * has no DB by design). Observable-effect assertions against a live DB (RLS on,
 * indexes present) belong in a separate DB-connected check.
 */
import { readFileSync, writeFileSync, readdirSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const DRIZZLE_DIR = join(ROOT, "drizzle");
const LEDGER_PATH = join(DRIZZLE_DIR, "applied.json");

const sha256 = (buf) => createHash("sha256").update(buf).digest("hex");

function migrationFiles() {
  return readdirSync(DRIZZLE_DIR)
    .filter((f) => /^\d{4}_.*\.sql$/.test(f))
    .sort();
}

function loadLedger() {
  if (!existsSync(LEDGER_PATH)) return { schema_version: 2, migrations: [] };
  try {
    return JSON.parse(readFileSync(LEDGER_PATH, "utf8"));
  } catch (error) {
    console.error(
      `[migration-audit] cannot parse ${LEDGER_PATH}: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
    process.exit(1);
  }
}

const LEDGER_NOTE =
  "Production state ledger for hand-managed migrations. effects_present records observable production effects only; it does not claim the SQL file ran or assign an execution time. See drizzle/README.md.";
const PRODUCTION_STATES = new Set([
  "unverified",
  "effects_present",
  "effects_absent",
  "migration_recorded",
]);

const write = process.argv.includes("--write");
const files = migrationFiles();
const ledger = loadLedger();
const entries = Array.isArray(ledger.migrations) ? ledger.migrations : [];
const byFile = new Map(entries.map((m) => [m.file, m]));

if (write) {
  if (!Array.isArray(ledger.migrations)) {
    console.error(
      "[migration-audit] refusing to write: ledger migrations must be an array",
    );
    process.exit(1);
  }

  const duplicateFiles = entries
    .map((entry) => entry?.file)
    .filter((file, index, all) => file && all.indexOf(file) !== index);
  if (duplicateFiles.length > 0) {
    console.error(
      `[migration-audit] refusing to write: duplicate entries for ${[
        ...new Set(duplicateFiles),
      ].join(", ")}`,
    );
    process.exit(1);
  }

  const verifiedDrift = [];
  for (const file of files) {
    const hash = sha256(readFileSync(join(DRIZZLE_DIR, file)));
    const existing = byFile.get(file);
    if (!existing) {
      byFile.set(file, {
        file,
        sha256: hash,
        production_state: "unverified",
        note: "Recorded from the repository; production has not been checked.",
      });
    } else if (
      existing.production_state === "unverified" &&
      existing.sha256 !== hash
    ) {
      // No production evidence is attached to this hash, so it may be refreshed.
      existing.sha256 = hash;
    } else if (existing.sha256 !== hash) {
      verifiedDrift.push(file);
    }
  }
  if (verifiedDrift.length > 0) {
    console.error(
      `[migration-audit] refusing to write: production evidence is attached to changed SQL: ${verifiedDrift.join(", ")}`,
    );
    process.exit(1);
  }
  const out = {
    schema_version: 2,
    note: LEDGER_NOTE,
    migrations: files.map((f) => byFile.get(f)),
  };
  writeFileSync(LEDGER_PATH, JSON.stringify(out, null, 2) + "\n");
  console.log(`[migration-audit] wrote ${LEDGER_PATH} (${files.length} migrations)`);
  process.exit(0);
}

// ── AUDIT mode ──
const problems = [];

if (ledger.schema_version !== 2) {
  problems.push(
    `UNSUPPORTED LEDGER SCHEMA: expected schema_version 2, found ${String(ledger.schema_version)}`,
  );
}

if (ledger.note !== LEDGER_NOTE) {
  problems.push("LEDGER NOTE DRIFT: preserve the production-state semantics documented by migration-audit");
}

if (!Array.isArray(ledger.migrations)) {
  problems.push("INVALID LEDGER: migrations must be an array");
}

const seen = new Set();
for (const [index, entry] of entries.entries()) {
  if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
    problems.push(`INVALID ENTRY: migrations[${index}] must be an object`);
    continue;
  }
  if (typeof entry.file !== "string" || !/^\d{4}_.*\.sql$/.test(entry.file)) {
    problems.push(`INVALID FILE: migrations[${index}] has an invalid file name`);
    continue;
  }
  if (seen.has(entry.file)) {
    problems.push(`DUPLICATE LEDGER ENTRY: ${entry.file}`);
  }
  seen.add(entry.file);

  if (typeof entry.sha256 !== "string" || !/^[a-f0-9]{64}$/.test(entry.sha256)) {
    problems.push(`INVALID SHA256: ${entry.file}`);
  }
  if (!PRODUCTION_STATES.has(entry.production_state)) {
    problems.push(
      `INVALID PRODUCTION STATE: ${entry.file} has ${String(entry.production_state)}`,
    );
  }
  if ("applied_at" in entry) {
    problems.push(
      `LEGACY APPLIED TIMESTAMP: ${entry.file} uses applied_at; record production_state without inventing execution time`,
    );
  }
  if (
    (entry.production_state === "effects_absent" ||
      entry.production_state === "migration_recorded") &&
    (typeof entry.note !== "string" || entry.note.trim().length === 0)
  ) {
    problems.push(`MISSING EVIDENCE NOTE: ${entry.file} (${entry.production_state})`);
  }
  if (
    entry.production_state === "migration_recorded" &&
    (typeof entry.migration_record !== "string" ||
      entry.migration_record.trim().length === 0)
  ) {
    problems.push(`MISSING MIGRATION RECORD: ${entry.file}`);
  }
  if (
    entry.production_state !== "migration_recorded" &&
    "migration_record" in entry
  ) {
    problems.push(
      `UNSUPPORTED MIGRATION RECORD: ${entry.file} is not migration_recorded`,
    );
  }
}

const ledgerOrder = entries.map((m) => m.file);
if (JSON.stringify(ledgerOrder) !== JSON.stringify(files)) {
  problems.push(
    "LEDGER ORDER DRIFT: entries must exactly match the sorted drizzle/NNNN_*.sql file list",
  );
}

for (const file of files) {
  const entry = byFile.get(file);
  if (!entry) {
    problems.push(
      `MISSING FROM LEDGER: ${file} (run: node scripts/migration-audit.mjs --write; it will be recorded as unverified)`,
    );
    continue;
  }
  const hash = sha256(readFileSync(join(DRIZZLE_DIR, file)));
  if (entry.sha256 !== hash) {
    problems.push(
      `SHA DRIFT: ${file} changed since it was recorded` +
        (entry.production_state !== "unverified"
          ? ` with production_state ${entry.production_state}`
          : "") +
        ` — do not update the ledger until the changed SQL and production evidence are reconciled.`,
    );
  }
}

for (const m of entries) {
  if (!existsSync(join(DRIZZLE_DIR, m.file))) {
    problems.push(`LEDGER POINTS AT MISSING FILE: ${m.file}`);
  }
}

if (problems.length > 0) {
  console.error(`[migration-audit] ${problems.length} problem(s):`);
  for (const p of problems) console.error(`  ✗ ${p}`);
  process.exit(1);
}

const counts = Object.fromEntries(
  [...PRODUCTION_STATES].map((state) => [
    state,
    entries.filter((entry) => entry.production_state === state).length,
  ]),
);
const absent = entries
  .filter((entry) => entry.production_state === "effects_absent")
  .map((entry) => entry.file);
const unverified = entries
  .filter((entry) => entry.production_state === "unverified")
  .map((entry) => entry.file);

console.log(
  `[migration-audit] OK — ${files.length} migrations tracked; ` +
    `${counts.migration_recorded} migration-recorded, ` +
    `${counts.effects_present} effects-present, ` +
    `${counts.effects_absent} effects-absent, ` +
    `${counts.unverified} unverified`,
);
if (absent.length > 0) {
  console.warn(
    `[migration-audit] KNOWN ABSENT — ${absent.join(", ")}. This is visible evidence, not a CI bookkeeping failure.`,
  );
}
if (unverified.length > 0) {
  console.warn(
    `[migration-audit] UNVERIFIED — ${unverified.join(", ")}. Check production before claiming these migrations are deployed.`,
  );
}
process.exit(0);
