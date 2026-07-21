#!/usr/bin/env node
/**
 * Color-token guard — lightweight. Keeps the palette tokens
 * (globals.css --app-*) the single source of truth for app UI color, so a
 * surface can't quietly grow its own hardcoded palette again (the way /beer
 * did). `style-lint.ts` enforces VOICE; this enforces COLOR — they're
 * separate concerns and there was no automated color check before.
 *
 * Flags, in app .tsx/.ts: Tailwind arbitrary color classes with a bare hex,
 *   bg-[#..]  text-[#..]  border-[#..]  from/to/via-[#..]  ring/fill/stroke-[#..]
 * Use a token instead: bg-[var(--app-*)], or the tolerated fallback form
 *   bg-[var(--app-ink,#0e0e0e)]  (a var() with a hex FALLBACK is allowed —
 *   it still resolves to the token when present).
 *
 * Intentionally NOT flagged here:
 *   - inline style hex that must mirror Mapbox GL paint (GL can't read CSS
 *     vars); those are a documented, contained exception.
 *   - the var(--x,#hex) fallback form (has "var(" before the hex).
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

// Tailwind arbitrary color utility with a bare hex value: `bg-[#abc]`,
// `text-[#112233]`, `ring-[#aabbccdd]`, etc. The `#` immediately after `[`
// is what makes it bare — `bg-[var(--x,#fff)]` has `var(` first and is skipped.
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
      `Use a palette token: bg-[var(--app-*)] (or the var(--app-*,#hex) fallback form).\n`,
  );
  for (const h of hits) console.error("  " + h);
  process.exit(1);
}

console.log(`check-colors: ${files.length} files scanned, 0 bare-hex color utilities. ✓`);
