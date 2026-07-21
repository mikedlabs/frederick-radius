#!/usr/bin/env node
/**
 * Color-token guard — lightweight. Keeps the palette tokens (the --app- family
 * in globals.css) the single source of truth for app UI color, so a surface
 * can't quietly grow its own hardcoded palette again (the way /beer did).
 * `style-lint.ts` enforces VOICE; this enforces COLOR — they're separate
 * concerns and there was no automated color check before.
 *
 * Flags, in app .tsx/.ts: a Tailwind arbitrary color utility whose value is a
 * bare hex — one of the bg / text / border / from / to / via / ring / fill /
 * stroke / decoration / outline / caret / accent / divide / shadow prefixes
 * carrying a hex value that starts right after the opening bracket. Use a
 * palette token in the arbitrary value instead (a var(--app-token) reference),
 * or the tolerated fallback form where the var() carries a hex fallback — that
 * still resolves to the token when the token is present.
 *
 * IMPORTANT — no example utility syntax in this file. Tailwind v4's content
 * scanner reads this script too, and it will mint a real (and sometimes
 * invalid) utility from any literal "prefix-[value]" it finds in a comment or
 * string here, which can break the generated stylesheet at build time. So the
 * shapes above are described in words, and the one place a bracket appears is
 * the detection regex below, where the brackets are escaped and cannot be read
 * as a class candidate. Keep it that way.
 *
 * Intentionally NOT flagged here:
 *   - inline style hex that must mirror Mapbox GL paint (GL can't read CSS
 *     vars); those are a documented, contained exception.
 *   - the var() with a hex fallback form (has "var(" before the hex).
 *
 * ALLOWLISTED surfaces (own palette, on purpose or as tracked debt):
 *   - marketing / pitch — the deliberately separate dark marketing world.
 *   - proto — dev/preview-only mockups, prod-404'd.
 *   - beer — KNOWN DEBT: the /beer vertical was built on a hardcoded
 *     brown/cream palette (~136 literals). Tracked for tokenization; listed
 *     here so the guard protects every OTHER surface today without a false
 *     red on work already scheduled. Remove this entry once /beer is tokenized.
 */
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const EXCLUDE = [
  "src/components/marketing/",
  "src/app/pitch/",
  "/proto/",
  // KNOWN DEBT — remove when /beer is tokenized (see docs/UI_AUDIT_2026-07-21.md).
  "src/components/beer/",
  "src/app/(app)/beer/",
];

// Matches an arbitrary color utility whose value is a bare hex — the "#" sits
// immediately inside the bracket. A value that begins with "var(" (a token
// reference, with or without a hex fallback) has var( before the hex and is
// skipped. The brackets here are escaped so the content scanner can't read
// this pattern as a real class candidate.
const BARE_HEX_UTILITY =
  /\b(?:bg|text|border|from|to|via|ring|fill|stroke|decoration|outline|caret|accent|divide|shadow)-\[#[0-9a-fA-F]{3,8}\]/;

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
    const m = line.match(BARE_HEX_UTILITY);
    if (m) hits.push(`${file}:${i + 1}  ${m[0]}`);
  });
}

if (hits.length > 0) {
  console.error(
    `check-colors: ${hits.length} bare-hex color utilit(ies) in app UI.\n` +
      `Use a palette token in the arbitrary value (a var(--app-token) reference), ` +
      `or the var() hex-fallback form.\n`,
  );
  for (const h of hits) console.error("  " + h);
  process.exit(1);
}

console.log(`check-colors: ${files.length} files scanned, 0 bare-hex color utilities. ✓`);
