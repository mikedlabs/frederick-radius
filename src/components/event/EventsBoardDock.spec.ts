import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("EventsBoardDock mobile hierarchy", () => {
  it("keeps one filter doorway visible and nests filter and display controls", () => {
    const source = readFileSync("src/components/event/EventsBoardDock.tsx", "utf8");
    const styles = readFileSync("src/app/globals.css", "utf8");

    expect(source).toContain("eb-whenribbon");
    expect(source).toContain("eb-filterbar");
    expect(source).toContain("eb-pane-tabs");
    expect(source).toContain('aria-label="Event filter sections"');
    expect(source).toContain("<span>View</span>");
    expect(source).toContain('<details className="eb-display-options">');
    expect(source.indexOf("eb-filterbar")).toBeLessThan(source.indexOf("eb-display-options"));
    expect(source).toContain('label="Order"');
    expect(source).not.toContain('{ key: "compact", label: "Compact"');
    expect(source).not.toContain("Change the main interest from the visual rail below.");
    expect(styles).toContain(".eb-masthead {\n    display: flex;");
    expect(styles).toContain("max-height: 48px;");
    expect(styles).toContain("min-height: 44px;");
  });
});
