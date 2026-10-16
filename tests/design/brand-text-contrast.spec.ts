import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

/**
 * Keep the filled action color out of small text. Product text uses
 * --app-link, whose foreground follows the actual light/dark surface.
 * Palette contrast is measured separately by primary-tabs-palette.spec.ts.
 * This source guard preserves the established distinction between text and
 * fill roles; graphical borders and icons remain unaffected.
 */

const SRC = join(__dirname, "..", "..", "src");

// Marketing surfaces use their own (dark) palette where the product-surface
// ratio doesn't apply, and /admin is owner-only tooling outside the
// public accessibility bar. Nothing else is exempt.
const EXEMPT = [/\/pitch\//, /marketing/, /^app\/admin\//, /\/admin\//];

function tsxFiles(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) out.push(...tsxFiles(p));
    else if (name.endsWith(".tsx")) out.push(p);
  }
  return out;
}

const SMALL_TEXT =
  /text-\[(?:8|8\.5|9|9\.5|10|10\.5|11|11\.5|12|12\.5|13|13\.5|14)px\]|\btext-xs\b|\btext-sm\b|fontSize:\s*(?:[89]|1[0-4])\b/;

function findViolations(file: string, source: string): string[] {
  const hits: string[] = [];
  const needle = 'color: "var(--app-brand)"';
  let idx = source.indexOf(needle);
  while (idx !== -1) {
    // Scope to the enclosing JSX element: back to the nearest tag opener.
    // If a ">" sits between the opener and the match, the match is NOT
    // inside that element's opening tag (it's a const/object elsewhere) —
    // then only a small fontSize in the immediate style object counts.
    const open = source.lastIndexOf("<", idx);
    const span = open === -1 ? "" : source.slice(open, idx);
    const insideTag = open !== -1 && !span.includes(">") && idx - open < 600;
    const flagged = insideTag
      ? SMALL_TEXT.test(span)
      : /fontSize:\s*(?:[89]|1[0-4])\b/.test(source.slice(Math.max(0, idx - 120), idx));
    if (flagged) {
      const line = source.slice(0, idx).split("\n").length;
      hits.push(`${file}:${line}`);
    }
    idx = source.indexOf(needle, idx + 1);
  }
  return hits;
}

describe("brand color as small text (WCAG AA guard)", () => {
  it("no small text uses var(--app-brand) — use var(--app-link)", () => {
    const violations: string[] = [];
    for (const file of tsxFiles(SRC)) {
      if (EXEMPT.some((re) => re.test(file))) continue;
      violations.push(...findViolations(file.slice(SRC.length + 1), readFileSync(file, "utf8")));
    }
    expect(
      violations,
      `Small text uses the filled-action token. Use var(--app-link), whose ` +
        `foreground follows the selected color scheme; keep --app-brand for ` +
        `icons, fills, and large display type.\n${violations.join("\n")}`,
    ).toEqual([]);
  });
});
