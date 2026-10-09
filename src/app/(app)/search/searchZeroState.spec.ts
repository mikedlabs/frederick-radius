import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const page = readFileSync("src/app/(app)/search/page.tsx", "utf8");

/**
 * /search with no matches (map audit MAP-13): the page put an Ask card above
 * the explanation and left an empty tab bar underneath. The zero state now
 * explains first, offers one fallback row, and drops the tabs.
 */
describe("/search zero state", () => {
  const zeroStart = page.indexOf("{zeroResults && (");
  const zeroEnd = page.indexOf("</section>", zeroStart);
  const zero = page.slice(zeroStart, zeroEnd);

  it("explains first and then offers one Ask fallback", () => {
    expect(zeroStart).toBeGreaterThan(-1);
    const explanation = zero.indexOf("There are no matches for");
    const ask = zero.indexOf("Ask Radius about &ldquo;{query}&rdquo;");
    expect(explanation).toBeGreaterThan(-1);
    expect(ask).toBeGreaterThan(explanation);
    expect(zero.match(/href=\{`\/ask\?/g)).toHaveLength(1);
  });

  it("no longer leads with a separate Ask card above the results", () => {
    expect(page).not.toContain("Need a recommendation or a plan?");
    expect(page.match(/\/ask\?/g)).toHaveLength(1);
  });

  it("hides the result-type tabs when there is nothing to filter", () => {
    const nav = page.indexOf('<nav aria-label="Result types"');
    const guard = page.lastIndexOf("{query && !suppressLocalHits", nav);
    expect(page.slice(guard, nav)).toContain('!(zeroResults && kind === "all")');
    expect(zeroStart).toBeLessThan(nav);
  });

  it("keeps one primary action when a direct answer already leads", () => {
    expect(zero).toContain("{!answerLeads && (");
    expect(page).toContain("const answerLeads = Boolean(answer && result.meta.qualifiers.openNow);");
  });
});
