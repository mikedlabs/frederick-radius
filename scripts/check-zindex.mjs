#!/usr/bin/env node
/**
 * z-index guard — lightweight. Keeps the layer scale (docs/Z_INDEX.md +
 * globals.css --z-*) the single source of truth for floating/overlay UI, so
 * the "every floating thing fights for the top of the screen" mess can't
 * creep back.
 *
 * Flags, in app-shell .tsx/.ts:
 *   - arbitrary numeric z-index:  z-[100], z-[120], z-[1000]   (use a token)
 *   - bare high z-index:          z-40 … z-100                 (overlay band → token)
 *   - inline numeric zIndex >= 40: style={{ zIndex: 999 }}     (use a var)
 *
 * Intentionally ALLOWED (local stacking inside a component, not floating UI):
 *   - z-0 / z-10 / z-20 / z-30, negative -z-10, and the token form
 *     z-[var(--z-…)] / zIndex: "var(--z-…)".
 *
 * Out of scope (own cinematic stacking): the marketing/vision surface.
 */
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

// Path fragments excluded — marketing/vision surface + its (marketing-only) map.
const EXCLUDE = [
  "src/components/marketing/",
  "src/components/map/index.tsx",
  "src/components/map/map-component.tsx",
];

// Violations: arbitrary numeric z-[NNN] (the token form z-[var(--…)] has no
// leading digit, so it's not matched), bare z-40+, inline numeric zIndex >= 40.
const ARBITRARY = /\bz-\[\d+\]/;
const BARE_HIGH = /\bz-(?:[4-9]0|100)\b/;
const INLINE_HIGH = /zIndex:\s*(?:[4-9]\d|\d{3,})\b/;

/** Recursively collect .ts/.tsx under a dir, skipping excluded paths. */
function walk(dir, out = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, entry.name);
    if (EXCLUDE.some((e) => p.includes(e))) continue;
    if (entry.isDirectory()) walk(p, out);
    else if (/\.tsx?$/.test(entry.name)) out.push(p);
  }
  return out;
}

const files = walk("src");
const hits = [];
for (const file of files) {
  const lines = readFileSync(file, "utf8").split("\n");
  lines.forEach((line, i) => {
    if (ARBITRARY.test(line) || BARE_HIGH.test(line) || INLINE_HIGH.test(line)) {
      hits.push(`${file}:${i + 1}  ${line.trim().slice(0, 100)}`);
    }
  });
}

if (hits.length > 0) {
  console.error(
    `check-zindex: ${hits.length} ad-hoc z-index value(s) on app-shell UI.\n` +
      `Use a token from the layer scale (docs/Z_INDEX.md): z-[var(--z-…)].\n`,
  );
  for (const h of hits) console.error("  " + h);
  process.exit(1);
}

console.log(`check-zindex: ${files.length} files scanned, 0 ad-hoc overlay z-index. ✓`);
