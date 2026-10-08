import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  BASELINE_FILE,
  MAP_PAINT_FILES,
  RULES,
  SCAN_ROOTS,
  baselineDocument,
  compareToBaseline,
  countTypeScale,
  listFiles,
} from "../scripts/check-type-scale.mjs";

/**
 * The type-scale ratchet (scripts/check-type-scale.mjs) holds the October 2026
 * UI review's floor: no file may add bracketed text sizes, type below the
 * 11 px caption, tracked caps, press-scale literals, or stroke literals.
 *
 * Fixture classes reuse utilities the app already ships, and the few that do
 * not are assembled at runtime, so Tailwind's content scanner (which reads
 * tests too) cannot mint new utilities from this file.
 */
const bracketText = (value: string) => ["text", `[${value}]`].join("-");

function counts(source: string, file = "fixture.tsx") {
  return countTypeScale(source, file).counts;
}

describe("type-scale ratchet: TS and TSX", () => {
  it("counts bracketed text sizes and flags the ones under 11 px", () => {
    const source = [
      `<p className="text-[10.5px] font-semibold">A</p>`,
      `<p className="text-[11px]">B</p>`,
      `<p className="sm:text-[15px]">C</p>`,
      `<p className="${bracketText("0.6rem")}">D</p>`,
      `<p className="text-[clamp(13px,0.8125rem,18px)]">E</p>`,
      `<p className="text-xs text-[var(--app-ink-3)]">F</p>`,
    ].join("\n");

    expect(counts(source)).toMatchObject({ arbitraryTextSize: 5, subElevenFont: 2 });
  });

  it("reads style-object font sizes, including ternary branches, and skips SVG attributes", () => {
    const source = [
      `<span style={{ fontSize: 10, color: "var(--app-ink)" }} />`,
      `<span style={{ fontSize: "9.5px" }} />`,
      `<span style={{ fontSize: compact ? 10 : 12 }} />`,
      `<span style={{ fontSize: 11 }} />`,
      `<span style={{ fontSize: 0 }} />`,
      `<span style={{ fontSize: "clamp(28px, 7vw, 40px)" }} />`,
      `<text fontSize="9">viewBox units</text>`,
      `node.style.fontSize = "8px";`,
    ].join("\n");

    expect(counts(source).subElevenFont).toBe(4);
  });

  it("counts uppercase with tracking once per class string or style object", () => {
    const source = [
      `<p className="text-[11px] uppercase tracking-[0.12em]">One</p>`,
      `<p className="uppercase tracking-wide" /><p className="uppercase tracking-wide" />`,
      `<p className={cn("uppercase", "tracking-wide")} />`,
      `<p className="uppercase tracking-normal" />`,
      `<p className="uppercase" />`,
      `<p style={{`,
      `  textTransform: "uppercase",`,
      `  letterSpacing: "0.08em",`,
      `}} />`,
      `<p style={{ textTransform: "uppercase", letterSpacing: 0 }} />`,
      `el.innerHTML = "<b style='text-transform:uppercase;letter-spacing:.1em'>x</b>";`,
    ].join("\n");

    expect(counts(source).uppercaseTracking).toBe(6);
  });

  it("counts press-scale literals and numeric stroke widths, not tokens", () => {
    const source = [
      `<button className="transition active:scale-95" />`,
      `<button className="active:scale-[0.98]" />`,
      `<motion.button whileTap={{ scale: 0.95 }} />`,
      `<Icon strokeWidth={1.5} />`,
      `<Icon strokeWidth="2" />`,
      `<Icon strokeWidth={active ? 2.25 : 2} />`,
      `<Icon strokeWidth={ICON_STROKE} />`,
      `const ok = typeof strokeWidth === "number";`,
      `const svg = '<path stroke-width="2.2" />';`,
    ].join("\n");

    expect(counts(source)).toMatchObject({ activeScale: 3, strokeWidthLiteral: 4 });
  });

  it("ignores comments but keeps reading after an image/* accept attribute", () => {
    const source = [
      `// <p className="text-[9px] uppercase tracking-wide" />`,
      `/* <Icon strokeWidth={1.5} /> */`,
      `/**`,
      ` * active:scale-95 and text-[9px] in prose`,
      ` */`,
      `{/* <p className="text-[9px]" /> */}`,
      `const x = 1; // was text-[9px]`,
      `<input type="file" accept="image/*" />`,
      `<p className="text-[9px]" />`,
    ].join("\n");

    expect(counts(source)).toMatchObject({
      arbitraryTextSize: 1,
      subElevenFont: 1,
      uppercaseTracking: 0,
      activeScale: 0,
      strokeWidthLiteral: 0,
    });
  });
});

describe("type-scale ratchet: CSS modules", () => {
  it("counts small font sizes, tracked caps, numeric :active scales and stroke widths", () => {
    const css = [
      `/* .old { font-size: 9px; } */`,
      `.eyebrow { font-size: 0.625rem; text-transform: uppercase; letter-spacing: 0.08em; }`,
      `.caption { font-size: .6875rem; text-transform: uppercase; letter-spacing: normal; }`,
      `.tool:active { transform: scale(.95); }`,
      `.pop:active { transform: scale(var(--pop, 1.06)); }`,
      `@media (prefers-reduced-motion: reduce) { .tool:active { transform: none; } }`,
      `.path { stroke-width: 1.5px; }`,
    ].join("\n");

    expect(counts(css, "Fixture.module.css")).toEqual({
      arbitraryTextSize: 0,
      subElevenFont: 1,
      uppercaseTracking: 1,
      activeScale: 1,
      strokeWidthLiteral: 1,
      eyebrowClass: 0,
      moduleUppercase: 2,
    });
  });
});

describe("type-scale ratchet: baseline comparison", () => {
  it("fails a rise, reports a fall, and treats a new file as starting from zero", () => {
    const baseline = {
      "src/components/a.tsx": { arbitraryTextSize: 4, subElevenFont: 1 },
      "src/components/gone.tsx": { strokeWidthLiteral: 2 },
    };
    const current = {
      "src/components/a.tsx": { arbitraryTextSize: 5 },
      "src/components/new.tsx": { uppercaseTracking: 1 },
    };

    const { regressions, improvements } = compareToBaseline(current, baseline);

    expect(regressions).toEqual([
      { file: "src/components/a.tsx", rule: "arbitraryTextSize", was: 4, now: 5 },
      { file: "src/components/new.tsx", rule: "uppercaseTracking", was: 0, now: 1 },
    ]);
    expect(improvements).toEqual([
      { file: "src/components/a.tsx", rule: "subElevenFont", was: 1, now: 0 },
      { file: "src/components/gone.tsx", rule: "strokeWidthLiteral", was: 2, now: 0 },
    ]);
  });

  it("writes a sorted baseline with totals and no zero counts", () => {
    const doc = baselineDocument({
      "src/components/b.tsx": { activeScale: 2 },
      "src/components/a.tsx": { arbitraryTextSize: 3, activeScale: 1 },
    });

    expect(Object.keys(doc.files)).toEqual(["src/components/a.tsx", "src/components/b.tsx"]);
    expect(doc.totals).toMatchObject({ arbitraryTextSize: 3, activeScale: 3, subElevenFont: 0 });
    expect(doc.rules).toEqual(RULES);
  });
});

describe("type-scale ratchet: scope", () => {
  it("covers product source only and leaves map paint files out", () => {
    const files = listFiles();

    expect(files).toContain("src/components/ui/EmptyState.tsx");
    expect(files.every((file) => SCAN_ROOTS.some((root) => file.startsWith(`${root}/`)))).toBe(true);
    expect(files.filter((file) => /\.(?:spec|test|stories)\.tsx?$|fixture/.test(file))).toEqual([]);
    for (const paint of MAP_PAINT_FILES) expect(files).not.toContain(paint);
  });

  it("commits a baseline in the shape the check reads", () => {
    const committed = JSON.parse(readFileSync(BASELINE_FILE, "utf8"));

    expect(committed.rules).toEqual(RULES);
    expect(Object.keys(committed.files).length).toBeGreaterThan(0);
  });
});
