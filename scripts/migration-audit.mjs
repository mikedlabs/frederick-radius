#!/usr/bin/env node
/**
 * migration-audit.mjs — guard the hand-applied migration discipline (mig-1).
 *
 * Migrations in this repo are applied BY HAND in the Supabase SQL editor and
 * drizzle/meta/_journal.json is intentionally partial (see drizzle/README.md),
 * so nothing reconciles "what's committed" against "what's recorded as applied."
 * This script keeps an explicit ledger (drizzle/applied.json) honest:
 *
 *   node scripts/migration-audit.mjs            # AUDIT (CI / manual gate)
 *   node scripts/migration-audit.mjs --write    # seed/update the ledger
 *
 * AUDIT mode (exit 1 on any drift):
 *   - every drizzle/NNNN_*.sql is present in the ledger
 *   - each ledger sha256 still matches the file on disk (a migration edited
 *     AFTER being marked applied is drift — prod won't have the new bytes)
 *   - no ledger entry points at a file that no longer exists
 *
 * --write mode: adds any new migration files to the ledger (applied_at:null so a
 *   human stamps it after running the SQL) and refreshes recorded hashes for
 *   entries that have NOT yet been marked applied. It will NOT silently rewrite
 *   the hash of an already-applied entry — that case is reported as drift in
 *   audit mode so it can't hide.
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
  if (!existsSync(LEDGER_PATH)) return { migrations: [] };
  return JSON.parse(readFileSync(LEDGER_PATH, "utf8"));
}

const write = process.argv.includes("--write");
const files = migrationFiles();
const ledger = loadLedger();
const byFile = new Map(ledger.migrations.map((m) => [m.file, m]));

if (write) {
  for (const file of files) {
    const hash = sha256(readFileSync(join(DRIZZLE_DIR, file)));
    const existing = byFile.get(file);
    if (!existing) {
      byFile.set(file, {
        file,
        sha256: hash,
        applied_at: null, // stamp after running the SQL in the Supabase editor
        note: "recorded by migration-audit --write; confirm applied on prod",
      });
    } else if (!existing.applied_at && existing.sha256 !== hash) {
      // Not-yet-applied entry whose file changed: refresh the hash freely.
      existing.sha256 = hash;
    }
  }
  const out = {
    note: "Ledger of hand-applied migrations (mig-4). applied_at=null means recorded but not yet confirmed applied on prod. See drizzle/README.md.",
    migrations: files.map((f) => byFile.get(f)),
  };
  writeFileSync(LEDGER_PATH, JSON.stringify(out, null, 2) + "\n");
  console.log(`[migration-audit] wrote ${LEDGER_PATH} (${files.length} migrations)`);
  process.exit(0);
}

// ── AUDIT mode ──
const problems = [];

for (const file of files) {
  const entry = byFile.get(file);
  if (!entry) {
    problems.push(`MISSING FROM LEDGER: ${file} (run: node scripts/migration-audit.mjs --write, then stamp applied_at after applying)`);
    continue;
  }
  const hash = sha256(readFileSync(join(DRIZZLE_DIR, file)));
  if (entry.sha256 !== hash) {
    problems.push(
      `SHA DRIFT: ${file} changed since it was recorded` +
        (entry.applied_at ? ` and applied (${entry.applied_at})` : "") +
        ` — prod will not have the new bytes. Re-apply the SQL and update the ledger.`,
    );
  }
}

for (const m of ledger.migrations) {
  if (!existsSync(join(DRIZZLE_DIR, m.file))) {
    problems.push(`LEDGER POINTS AT MISSING FILE: ${m.file}`);
  }
}

const applied = ledger.migrations.filter((m) => m.applied_at).length;
const pending = ledger.migrations.filter((m) => !m.applied_at).map((m) => m.file);

if (problems.length > 0) {
  console.error(`[migration-audit] ${problems.length} problem(s):`);
  for (const p of problems) console.error(`  ✗ ${p}`);
  process.exit(1);
}

console.log(
  `[migration-audit] OK — ${files.length} migrations, ${applied} marked applied` +
    (pending.length ? `, ${pending.length} awaiting an applied_at stamp: ${pending.join(", ")}` : ""),
);
process.exit(0);
