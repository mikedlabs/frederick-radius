import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { EVENTS_PRIMARY_WHEN_PRESETS } from "./EventsBoardDock";

describe("EventsBoardDock mobile hierarchy", () => {
  it("keeps one preset row, one filter doorway, and one compact display disclosure on mobile", () => {
    const source = readFileSync("src/components/event/EventsBoardDock.tsx", "utf8");
    const explorer = readFileSync("src/components/event/EventsExplorer.tsx", "utf8");
    const styles = readFileSync("src/app/globals.css", "utf8");

    expect(EVENTS_PRIMARY_WHEN_PRESETS.map((preset) => preset.label)).toEqual([
      "Today",
      "Tonight",
      "This weekend",
    ]);
    expect(source).toContain("eb-whenribbon");
    expect(source).toContain("eb-filterbar");
    expect(source).toContain("eb-pane-tabs");
    expect(source).toContain('aria-label="Event filter sections"');
    expect(source).toContain('aria-label="Event interests"');
    expect(source).toContain("More specific categories");
    expect(source).toContain("<span>Display</span>");
    expect(source).toContain('className="eb-display-options"');
    expect(source.match(/className="eb-display-options"/g)).toHaveLength(1);
    expect(source).toContain("Change event display.");
    expect(source).toContain("onSelect={closeMobileDisplay}");
    expect(explorer).not.toContain("<EventsIntentRail");
    expect(explorer).not.toContain('from "@/components/event/EventsIntentRail"');
    expect(source).toContain('label="Order"');
    expect(styles).toContain(".eb-masthead {\n    display: flex;");
    expect(styles).toContain("max-height: 48px;");
    expect(styles).toContain("min-height: 44px;");
  });
});
