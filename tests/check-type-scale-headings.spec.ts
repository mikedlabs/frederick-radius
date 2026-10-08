import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { BASELINE_FILE, RULES, countTypeScale } from "../scripts/check-type-scale.mjs";

/**
 * The "Headings are type" half of the type-scale ratchet: uses of the global
 * caps-label classes in TS/TSX strings, and uppercase rules in CSS modules.
 * Both may fall, never rise (docs/brand/BRAND_GUIDE.md, Headings are type).
 */
function counts(source: string, file = "fixture.tsx") {
  return countTypeScale(source, file).counts;
}

describe("type-scale ratchet: eyebrow classes", () => {
  it("counts each caps-label class token inside a string", () => {
    const source = [
      `<p className="eyebrow">Parks</p>`,
      `<p className="eyebrow mb-2">Trails</p>`,
      `<p className="mb-1.5 fg-eyebrow">Plate</p>`,
      `<span className='content-chapter__label'>Chapter</span>`,
      `<p className={cn("text-meta-lg", open && "eyebrow")}>Mixed</p>`,
      "<p className={`eyebrow ${tone}`}>Template</p>",
    ].join("\n");

    expect(counts(source).eyebrowClass).toBe(6);
  });

  it("ignores props, variables, keys and compound class names called eyebrow", () => {
    const source = [
      `<PageHeader eyebrow="Parks and open space" />`,
      `const eyebrow = copy.eyebrow;`,
      `const copy = { eyebrow: "Tonight" };`,
      `{eyebrow ? <p className={styles.eyebrow}>{eyebrow}</p> : null}`,
      `<p className="map-finding-eyebrow" id="hh-wallet-eyebrow" />`,
      "<p className={`p-4${eyebrow ? \" pt-2\" : \"\"}`} />",
      `// <p className="eyebrow">commented out</p>`,
      `{/* <p className="eyebrow" /> */}`,
    ].join("\n");

    expect(counts(source).eyebrowClass).toBe(0);
  });

  it("follows template literals across lines and back into their expressions", () => {
    const source = [
      "const cls = `",
      "  flex items-center",
      "  ${active ? \"eyebrow\" : \"\"}",
      "  ${eyebrow}",
      "  fg-eyebrow",
      "`;",
      `<p className="eyebrow">After</p>`,
    ].join("\n");

    const result = countTypeScale(source, "fixture.tsx");
    expect(result.counts.eyebrowClass).toBe(3);
    expect(result.lines.eyebrowClass).toEqual([3, 5, 7]);
  });

  it("limits a stray apostrophe to its own line", () => {
    const source = [
      `const note = isOpen ? x : y; const it's = 1`,
      `<p className="eyebrow">Next line still counts</p>`,
    ].join("\n");

    expect(counts(source).eyebrowClass).toBe(1);
  });

  it("does not hold stylesheets to the class rule", () => {
    expect(counts(`.eyebrow { color: var(--app-ink-3); }`, "Fixture.module.css").eyebrowClass).toBe(0);
  });
});

describe("type-scale ratchet: uppercase in CSS modules", () => {
  it("counts every module rule that sets uppercase, tracked or not", () => {
    const css = [
      `.label { text-transform: uppercase; }`,
      `.kicker { text-transform: uppercase; letter-spacing: 0.1em; }`,
      `.title { text-transform: none; }`,
      `/* .old { text-transform: uppercase; } */`,
      `@media (min-width: 640px) { .wide { text-transform: uppercase; } }`,
    ].join("\n");

    const result = countTypeScale(css, "Fixture.module.css");
    expect(result.counts.moduleUppercase).toBe(3);
    expect(result.lines.moduleUppercase).toEqual([1, 2, 5]);
    expect(result.counts.uppercaseTracking).toBe(1);
  });

  it("leaves a stylesheet that is not a module alone", () => {
    expect(counts(`.label { text-transform: uppercase; }`, "globals.css").moduleUppercase).toBe(0);
  });
});

describe("type-scale ratchet: heading rules in the baseline", () => {
  it("names both rules and records their counts in the committed baseline", () => {
    const committed = JSON.parse(readFileSync(BASELINE_FILE, "utf8"));

    expect(RULES).toHaveProperty("eyebrowClass");
    expect(RULES).toHaveProperty("moduleUppercase");
    expect(committed.totals.eyebrowClass).toBeGreaterThan(0);
    expect(committed.totals.moduleUppercase).toBeGreaterThan(0);
  });

  it("holds the shared heading primitives at zero caps labels", () => {
    const committed = JSON.parse(readFileSync(BASELINE_FILE, "utf8"));

    for (const file of [
      "src/components/ui/SectionHeading.tsx",
      "src/components/ui/CollapsibleSection.tsx",
      "src/components/ui/PageChapter.tsx",
    ]) {
      expect(committed.files[file]?.eyebrowClass ?? 0, file).toBe(0);
      expect(committed.files[file]?.uppercaseTracking ?? 0, file).toBe(0);
    }
  });
});
