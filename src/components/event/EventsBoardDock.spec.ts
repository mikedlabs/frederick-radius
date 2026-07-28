import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("EventsBoardDock mobile hierarchy", () => {
  it("keeps the primary event questions visible and nests display controls", () => {
    const source = readFileSync("src/components/event/EventsBoardDock.tsx", "utf8");
    const styles = readFileSync("src/app/globals.css", "utf8");

    expect(source).toContain("eb-whenribbon");
    expect(source).toContain("eb-capbar");
    expect(source).toContain("<span>Display</span>");
    expect(source).toContain('<details className="eb-display-options">');
    expect(source.indexOf("eb-capbar")).toBeLessThan(source.indexOf("eb-display-options"));
    expect(source).toContain('label="Order"');
    expect(styles).toContain(".eb-masthead {\n    display: flex;");
    expect(styles).toContain("max-height: 48px;");
    expect(styles).toContain("min-height: 44px;");
  });
});
