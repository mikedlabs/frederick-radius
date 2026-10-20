#!/usr/bin/env node
/**
 * Typography ratchet — the type-scale guard.
 *
 * The design system defines a small semantic type scale in globals.css
 * (the .text-title / .text-body / .text-caption / .display-* / .eyebrow
 * family). The drift the UX audit named is that almost nothing uses it:
 * screens reach for an arbitrary pixel font size in a Tailwind class
 * instead, so hierarchy is retyped by hand on every surface and never
 * coheres. `style-lint.ts` guards VOICE, `check-colors.mjs` guards COLOR,
 * `check-zindex.mjs` guards LAYERING; this guards the TYPE SCALE.
 *
 * There are thousands of these already (see the committed baseline). We do
 * not block the world red on day one, and we do not do a risky repo-wide
 * rewrite in the same change that adds the guard. Instead this is a
 * RATCHET: a per-file baseline of the current count is committed, and the
 * check fails only when a file GROWS its count or a file with none adds
 * one. Removing them is always allowed; run this with --write to lock the
 * lower number in after a cleanup so it can never climb back.
 *
 * What is flagged: a Tailwind arbitrary text-size utility whose value is a
 * pixel length (the text- prefix carrying a number-and-px arbitrary value,
 * with or without a variant prefix like a breakpoint or state). Migrate it
 * to a semantic scale class instead. Color utilities (text- carrying a hex
 * or a var()) and non-text arbitrary utilities are not this guard's
 * concern and are not matched.
 *
 * IMPORTANT — no literal example utility syntax in this file. Tailwind v4's
 * content scanner reads this script too and will mint a real (sometimes
 * invalid) utility from any literal "prefix-[value]" it finds in a comment
 * or string here, which can break the generated stylesheet at build time.
 * The one place a bracket appears is the detection regex, where the
 * brackets are escaped and cannot be read as a class candidate. Keep it
 * that way: describe shapes in words, never write the bracket form inline.
 */
import { readFileSync, writeFileSync, readdirSync, existsSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = process.cwd();
const BASELINE_PATH = join(ROOT, "scripts", "typography-baseline.json");
const WRITE = process.argv.includes("--write");

// Separate worlds with their own type treatments, on purpose:
//   - marketing / pitch: the deliberately separate presentation surfaces.
//   - proto: dev/preview-only mockups, prod-404'd.
const EXCLUDE = [
  "src/components/marketing/",
  "src/app/pitch/",
  "/proto/",
];

// An arbitrary text-size utility whose value is a pixel length. The "text-"
// prefix, then an escaped bracket, a number (optionally decimal), the "px"
// unit, and an escaped closing bracket. A word boundary before "text"
// admits variant prefixes (a breakpoint or state segment ends in a
// non-word ":" or "!"). Escaped brackets keep the content scanner from
// reading this as a real class candidate. Color values (a hex or a var())
// never reach the "px" unit and so never match.
const ARB_PX_TEXT = /\btext-\[[0-9.]+px\]/g;

function walk(dir, out = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, entry.name);
    if (EXCLUDE.some((e) => p.includes(e))) continue;
    if (entry.isDirectory()) walk(p, out);
    else if (/\.tsx?$/.test(entry.name)) out.push(p);
  }
  return out;
}

function countMatches(text) {
  const m = text.match(ARB_PX_TEXT);
  return m ? m.length : 0;
}

const files = walk(join(ROOT, "src"));
const current = {};
for (const file of files) {
  const rel = relative(ROOT, file);
  const n = countMatches(readFileSync(file, "utf8"));
  if (n > 0) current[rel] = n;
}

if (WRITE) {
  const sorted = Object.fromEntries(
    Object.entries(current).sort(([a], [b]) => a.localeCompare(b)),
  );
  writeFileSync(BASELINE_PATH, JSON.stringify(sorted, null, 2) + "\n");
  const total = Object.values(sorted).reduce((s, n) => s + n, 0);
  console.log(
    `check-typography: baseline written — ${Object.keys(sorted).length} files, ${total} arbitrary pixel text sizes.`,
  );
  process.exit(0);
}

if (!existsSync(BASELINE_PATH)) {
  console.error(
    "check-typography: no baseline found. Generate it once with:\n" +
      "  node scripts/check-typography.mjs --write\n",
  );
  process.exit(1);
}

const baseline = JSON.parse(readFileSync(BASELINE_PATH, "utf8"));

const regressions = [];
for (const [rel, n] of Object.entries(current)) {
  const allowed = baseline[rel] ?? 0;
  if (n > allowed) regressions.push({ rel, allowed, now: n });
}

if (regressions.length > 0) {
  console.error(
    `check-typography: ${regressions.length} file(s) added arbitrary pixel text sizes.\n` +
      `Use a semantic type-scale class from globals.css (the .text-title / ` +
      `.text-body / .text-caption / .display-* / .eyebrow family) instead of ` +
      `an arbitrary pixel font size.\n`,
  );
  for (const r of regressions) {
    console.error(`  ${r.rel}: ${r.allowed} allowed, ${r.now} found`);
    const lines = readFileSync(join(ROOT, r.rel), "utf8").split("\n");
    lines.forEach((line, i) => {
      if (ARB_PX_TEXT.test(line)) console.error(`    ${r.rel}:${i + 1}  ${line.trim()}`);
      ARB_PX_TEXT.lastIndex = 0;
    });
  }
  console.error(
    `\nIf you deliberately removed some and want to lock the lower count in, ` +
      `run: node scripts/check-typography.mjs --write`,
  );
  process.exit(1);
}

const totalNow = Object.values(current).reduce((s, n) => s + n, 0);
const totalBase = Object.values(baseline).reduce((s, n) => s + n, 0);
let note = "";
if (totalNow < totalBase) {
  note =
    ` (${totalBase - totalNow} fewer than baseline — run --write to lock the ` +
    `lower count in)`;
}
console.log(
  `check-typography: ${files.length} files scanned, no new arbitrary pixel text sizes.${note} ✓`,
);
