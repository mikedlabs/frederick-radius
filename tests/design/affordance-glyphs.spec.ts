import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

/**
 * Affordance guard (July 2026 Reddit UX review: "sometimes -->, sometimes
 * just >, sometimes nothing").
 *
 * The house standard (docs/AFFORDANCES.md):
 *   - "go somewhere in-app" CTA → lucide <ArrowRight> after the label
 *   - right-edge disclosure row   → lucide <ChevronRight>
 *   - leaves the app              → lucide <ArrowUpRight>
 *   - literal glyphs "→", "›", "»", "&rarr;" as tap cues → BANNED
 *
 * This spec scans JSX text for literal arrow glyphs used as affordances.
 * Legit non-affordance uses of "→" (route/range separators like
 * "BWI → DCA" or "72° → 85°") live in the allowlist below with the reason.
 */

const SRC = join(__dirname, "..", "..", "src");

/** Files where "→" is a data separator, not a tap cue. */
const SEPARATOR_ALLOWLIST = new Set([
  "components/overhead/PlanesOverhead.tsx", // "BWI → DCA" route separators
  "components/overhead/OverheadMap.tsx", // same route separators in popups
  "components/today/HourlySummary.tsx", // temperature range "72 → 85"
  "app/(app)/proto/almanac/page.tsx", // proto range display
]);

function tsxFiles(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...tsxFiles(p));
    else if (name.endsWith(".tsx")) out.push(p);
  }
  return out;
}

/** Strip comments so doc examples never count. */
function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, "")).replace(/\/\/[^\n]*/g, "");
}

describe("affordance glyphs (one arrow system)", () => {
  it("no literal →/›/»/&rarr; used as tap cues — use lucide ArrowRight/ChevronRight/ArrowUpRight", () => {
    const violations: string[] = [];
    for (const file of tsxFiles(SRC)) {
      const rel = file.slice(SRC.length + 1);
      if (SEPARATOR_ALLOWLIST.has(rel)) continue;
      if (/\/(pitch|marketing|admin)\//.test(rel) || rel.startsWith("app/admin/")) continue;
      // Range/route notation is data, not an affordance: "A→Z" sort labels
      // and "X → Y" route hints stay.
      const src = stripComments(readFileSync(file, "utf8"))
        .replace(/A→Z/g, "A-Z")
        .replace(/Point of Rocks → Silver Spring/g, "route");
      const lines = src.split("\n");
      lines.forEach((line, i) => {
        if (/→|›|»|&rarr;/.test(line)) violations.push(`${rel}:${i + 1}  ${line.trim().slice(0, 90)}`);
      });
    }
    expect(
      violations,
      `Literal arrow glyphs as tap cues break the one-arrow system ` +
        `(docs/AFFORDANCES.md). Use <ArrowRight/ChevronRight/ArrowUpRight> ` +
        `from lucide, or add a data-separator to the allowlist with a reason.\n` +
        violations.join("\n"),
    ).toEqual([]);
  });
});
