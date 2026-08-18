/**
 * Answer coverage report — "does the app answer the question?", measured.
 *
 * Drives the real answer stack over the needs corpus and prints a per-persona
 * table plus every need that is not a clean PASS. Deterministic and offline:
 * no model calls, no network, committed seed events.
 *
 *   npm run eval:coverage
 *   npm run eval:coverage -- --verbose   # also list every phrasing's verdict
 */

import { runCoverage, type NeedOutcome } from "@/lib/search/coverage";
import { COVERAGE_CORPUS } from "@/lib/search/coverage-corpus";
import { EVENTS } from "@/data/events";

const verbose = process.argv.includes("--verbose");

const report = runCoverage(COVERAGE_CORPUS, EVENTS);
const { tally, scored, gaps } = report;
const pct = (n: number, d: number) => (d === 0 ? "100.0%" : `${((n / d) * 100).toFixed(1)}%`);

console.log("\nAnswer coverage — the real stack, over the needs corpus\n");
console.log(
  `  scored needs ${scored.length}   ` +
    `PASS ${tally.PASS} (${pct(tally.PASS, scored.length)})  ` +
    `WEAK ${tally.WEAK}  FAIL ${tally.FAIL}  EMPTY ${tally.EMPTY}`,
);
if (gaps.length) {
  console.log(`  data gaps ${gaps.length} (excluded from the score, listed below)`);
}

console.log("\n  by persona");
const width = Math.max(...report.byPersona.map((p) => p.persona.length));
for (const p of [...report.byPersona].sort((a, b) => a.pass / a.total - b.pass / b.total)) {
  const bar = "#".repeat(Math.round((p.pass / p.total) * 20)).padEnd(20, ".");
  console.log(
    `    ${p.persona.padEnd(width)}  ${bar}  ${String(p.pass).padStart(2)}/${p.total}  ${pct(p.pass, p.total)}`,
  );
}

const describe = (o: NeedOutcome) => {
  const worst = o.outcomes.filter((q) => q.verdict === o.verdict);
  const detail = worst
    .map((q) => `"${q.query}"${q.position ? ` @${q.position}` : ""} (${q.rowCount} rows)`)
    .join(", ");
  return `    ${o.verdict.padEnd(5)} ${o.need.persona} · ${o.need.need}\n           ${detail}`;
};

const notPassing = scored.filter((o) => o.verdict !== "PASS");
if (notPassing.length) {
  console.log(`\n  needs that do not land in the top 3 (${notPassing.length})`);
  for (const o of notPassing) console.log(describe(o));
}

if (gaps.length) {
  console.log(`\n  data gaps — no verified row exists to answer these (${gaps.length})`);
  for (const o of gaps) {
    console.log(`    ${o.verdict.padEnd(5)} ${o.need.persona} · ${o.need.need}`);
    console.log(`           ${o.need.knownGap}`);
  }
}

if (verbose) {
  console.log("\n  every phrasing");
  for (const o of [...scored, ...gaps]) {
    console.log(`    ${o.need.persona} · ${o.need.need}`);
    for (const q of o.outcomes) {
      console.log(
        `      ${q.verdict.padEnd(5)} "${q.query}"${q.position ? ` @${q.position}` : ""} (${q.rowCount} rows)`,
      );
    }
  }
}

console.log("");
