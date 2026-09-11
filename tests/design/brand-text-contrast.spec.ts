import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

/**
 * Contrast guard (design review P1-1).
 *
 * `--app-brand` (#E14328) on the paper ground measures 3.24:1 — below the
 * WCAG AA 4.5:1 floor for normal-size text. The palette ships
 * `--app-brand-press` (#B5300F, 4.80:1) for exactly this, and the July 2026
 * contrast pass routed every small-text usage to it. This spec keeps the
 * rule from regressing:
 *
 *   --app-brand        → fills, icon strokes, borders, rings, large/bold
 *                        display text ONLY (3:1 graphical threshold)
 *   --app-brand-press  → any small or normal-weight text
 *
 * Mechanism: for each `color: "var(--app-brand)"` in a .tsx file, look at
 * the JSX element it sits in (back to the nearest `<` tag opener). If that
 * same element carries a small text-size class (text-[8–14px] / text-xs /
 * text-sm) or an inline fontSize ≤ 14, it is small brand text — flag it.
 * Icons never carry text-size classes, so they pass untouched.
 */

const SRC = join(__dirname, "..", "..", "src");

// Marketing surfaces use their own (dark) palette where the cream-ground
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
  it("no small text uses var(--app-brand) — use var(--app-brand-press)", () => {
    const violations: string[] = [];
    for (const file of tsxFiles(SRC)) {
      if (EXEMPT.some((re) => re.test(file))) continue;
      violations.push(...findViolations(file.slice(SRC.length + 1), readFileSync(file, "utf8")));
    }
    expect(
      violations,
      `Small text set in --app-brand fails WCAG AA on the cream ground (3.24:1). ` +
        `Use var(--app-brand-press) (4.80:1) for text; keep --app-brand for ` +
        `icons, fills, and large display type.\n${violations.join("\n")}`,
    ).toEqual([]);
  });
});
