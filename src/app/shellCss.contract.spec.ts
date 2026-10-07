import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Build-free contracts for the shared shell stylesheet and the divider
 * utility. Each one pins a defect that shipped because the source looked
 * right while the cascade disagreed.
 */

const GLOBALS = readFileSync("src/app/globals.css", "utf8");

type CssBlock = {
  /** Selector, or the at-rule prelude ("@layer base", "@media ..."). */
  prelude: string;
  body: string;
};

/** Split a stylesheet into its blocks at one nesting level. Comments are
 *  dropped first because a minifier ignores them when it decides whether
 *  two rules are neighbors. */
function blocks(css: string): CssBlock[] {
  const text = css.replace(/\/\*[\s\S]*?\*\//g, "");
  const out: CssBlock[] = [];
  let depth = 0;
  let start = 0;
  let bodyStart = -1;
  let prelude = "";
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (ch === ";" && depth === 0) {
      // A statement at-rule such as @import; it ends the previous run.
      start = i + 1;
    } else if (ch === "{") {
      if (depth === 0) {
        prelude = text.slice(start, i).trim();
        bodyStart = i + 1;
      }
      depth += 1;
    } else if (ch === "}") {
      depth -= 1;
      if (depth === 0) {
        out.push({ prelude, body: text.slice(bodyStart, i) });
        start = i + 1;
      }
    }
  }
  return out;
}

function declarations(body: string): string {
  return body
    .split(";")
    .map((decl) => decl.replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .sort()
    .join(";");
}

const normalize = (selector: string) => selector.replace(/\s+/g, " ").trim();

describe("global focus ring", () => {
  const top = blocks(GLOBALS);
  const baseIndex = top.findIndex(
    (block) => normalize(block.prelude) === ":where(:focus-visible)",
  );
  const base = top[baseIndex];

  it("is a zero-specificity :where(:focus-visible) rule", () => {
    expect(baseIndex).toBeGreaterThan(-1);
    expect(declarations(base.body)).toBe(
      "outline-offset: 2px;outline: 2px solid var(--app-brand)",
    );
    // A bare :focus-visible base (0,1,0) beat component resets written
    // earlier in the file and invited the merge described below.
    expect(top.some((block) => normalize(block.prelude) === ":focus-visible")).toBe(false);
  });

  it("has no neighbor with the same declarations, so a minifier cannot fold it into :is()", () => {
    // Production folded `:focus-visible` and the search-shell ring into
    // `:is(:focus-visible, .search-field-shell:has(input:focus-visible))`.
    // :is() takes its most specific argument, so every focus ring rose to
    // (0,2,1) and drew a rectangle inside the map and Ask search pills.
    const ring = declarations(base.body);
    expect(declarations(top[baseIndex - 1]?.body ?? "")).not.toBe(ring);
    expect(declarations(top[baseIndex + 1]?.body ?? "")).not.toBe(ring);

    const shellIndex = top.findIndex(
      (block) =>
        normalize(block.prelude) === ".search-field-shell:has(input:focus-visible)",
    );
    expect(shellIndex).toBeGreaterThan(-1);
    expect(Math.abs(shellIndex - baseIndex)).toBeGreaterThan(1);
    expect(declarations(top[shellIndex - 1].body)).not.toBe(ring);
    expect(declarations(top[shellIndex + 1].body)).not.toBe(ring);
  });

  it("keeps component outline resets able to win over the base ring", () => {
    expect(GLOBALS).toMatch(/\.dock-search-input:focus-visible \{\s+outline: none;/);
    expect(GLOBALS).toMatch(/\.ask-composer :is\(input, textarea\):focus-visible \{\s+outline: none;/);
    expect(GLOBALS).toMatch(/\.search-field-shell input:focus-visible \{\s+outline: none;/);
  });

  it("does not ring headings and regions that take programmatic focus", () => {
    const reset = top.find(
      (block) =>
        block.prelude.includes('[tabindex="-1"]:focus-visible') &&
        normalize(block.prelude).startsWith(":where("),
    );
    expect(reset).toBeDefined();
    for (const target of ["h1", "h2", "h3", "h4", "h5", "h6", '[role="region"]']) {
      expect(reset?.prelude).toContain(target);
    }
    expect(declarations(reset?.body ?? "")).toBe("outline: none");
    // Its neighbors must not share `outline: none`, or a merge into :is()
    // would hand this zero-specificity reset a neighbor's specificity.
    const resetIndex = top.indexOf(reset as CssBlock);
    expect(declarations(top[resetIndex - 1].body)).not.toBe("outline: none");
    expect(declarations(top[resetIndex + 1].body)).not.toBe("outline: none");
    expect(GLOBALS).toMatch(/#main-content:focus-visible \{\s+outline: none;/);
  });
});

describe("shell surfaces", () => {
  it("keeps the field-guide plate position overridable by utilities", () => {
    const top = blocks(GLOBALS);
    // Unlayered, `.fg-plate { position: relative }` beat PlaceHero's
    // `absolute inset-0` and the emblem hugged the top of its band.
    expect(top.some((block) => normalize(block.prelude) === ".fg-plate")).toBe(false);
    const layered = top.filter((block) => normalize(block.prelude) === "@layer base");
    expect(
      layered.some((block) =>
        blocks(block.body).some(
          (inner) =>
            normalize(inner.prelude) === ".fg-plate" &&
            declarations(inner.body) === "position: relative",
        ),
      ),
    ).toBe(true);
  });

  it("paints the events filter pane and display popover on an opaque surface", () => {
    const top = blocks(GLOBALS);
    const pane = top.find((block) => normalize(block.prelude) === ".eb-pane");
    expect(pane?.body).toContain("background: var(--app-bg-elevated-solid);");

    const popover = top
      .filter((block) => block.prelude.startsWith("@media"))
      .flatMap((block) => blocks(block.body))
      .find((block) => normalize(block.prelude) === ".eb-display-panel");
    expect(popover?.body).toContain("background: var(--app-bg-elevated-solid);");
  });

  it("opens route drawers on the opaque drawer surface", () => {
    const drawer = readFileSync("src/components/nav/InterceptedDrawer.tsx", "utf8");
    expect(drawer).toContain('surface="solid"');
  });
});

/**
 * Tailwind v4 dropped the gray default border color: a bare border is
 * currentColor, so `divide-y` with only a parent `style={{ borderColor }}`
 * drew Ink rules between the children. Every divider needs its own color.
 */
describe("divider color", () => {
  // Files whose dividers are still colorless on purpose. Each entry must keep
  // earning its place: the test fails once the file no longer needs it.
  const ALLOWED: Record<string, string> = {
    // Every <li> in the "Good to know" list sets its own borderColor, so no
    // Ink rule shows. Remove this entry when that list gains a divide color.
    "src/app/(app)/events/[slug]/page.tsx": "children carry their own borderColor",
  };

  const WIDTH = /^(?:[a-z0-9-]+:)*divide-[xy]$/;
  const NON_COLOR = /^(?:[a-z0-9-]+:)*divide-(?:[xy](?:-\d+|-reverse)?|solid|dashed|dotted|double|none)$/;
  const COLOR = /^(?:[a-z0-9-]+:)*divide-/;

  function walk(dir: string): string[] {
    return readdirSync(dir).flatMap((name) => {
      const path = join(dir, name);
      if (statSync(path).isDirectory()) return walk(path);
      return /\.tsx$/.test(name) && !/\.spec\.tsx$/.test(name) ? [path] : [];
    });
  }

  function colorlessDividers(source: string): string[] {
    const literals = source.match(/"[^"\n]*"|`[^`]*`/g) ?? [];
    return literals.filter((literal) => {
      const tokens = literal.slice(1, -1).split(/\s+/);
      if (!tokens.some((token) => WIDTH.test(token))) return false;
      return !tokens.some((token) => COLOR.test(token) && !NON_COLOR.test(token));
    });
  }

  const files = walk("src");

  it("gives every divide-x and divide-y an explicit color", () => {
    const offenders = files
      .filter((file) => !(file in ALLOWED))
      .flatMap((file) =>
        colorlessDividers(readFileSync(file, "utf8")).map((literal) => `${file}: ${literal}`),
      );
    expect(offenders).toEqual([]);
  });

  it("keeps the allowlist honest", () => {
    for (const file of Object.keys(ALLOWED)) {
      expect(colorlessDividers(readFileSync(file, "utf8")).length, file).toBeGreaterThan(0);
    }
  });

  it("recognizes a colorless divider and a colored one", () => {
    expect(colorlessDividers('<ul className="divide-y" style={{ borderColor: "x" }}>')).toHaveLength(1);
    expect(colorlessDividers('<ul className="mt-2 divide-y divide-[var(--app-border)]">')).toHaveLength(0);
    expect(colorlessDividers('<ul className="divide-y divide-black/10">')).toHaveLength(0);
    expect(colorlessDividers('<dl className="divide-y sm:divide-y-0 sm:divide-x">')).toHaveLength(1);
  });
});
