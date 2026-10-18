import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import TodayScopeStatus, { todayScopeStatusText } from "./TodayScopeStatus";

vi.mock("next/navigation", () => ({ useSearchParams: () => new URLSearchParams() }));

describe("TodayScopeStatus", () => {
  it("names the part of Today that follows a selected town", () => {
    expect(todayScopeStatusText("town:brunswick")).toBe(
      "Brunswick picks · Countywide weather",
    );
  });

  it("keeps nearby and countywide scope claims honest", () => {
    expect(todayScopeStatusText("nearme")).toBe(
      "Nearby place picks · Countywide weather and events",
    );
    expect(todayScopeStatusText("nearme", false)).toBe(
      "Location needed for nearby picks · Countywide weather and events",
    );
    expect(todayScopeStatusText("county")).toBe("Countywide briefing");
    expect(todayScopeStatusText(null)).toBe("Countywide briefing");
  });

  it("compacts redundant county text without removing the picker or explicit location opt-in", () => {
    const html = renderToStaticMarkup(createElement(TodayScopeStatus, { density: "compact" }));
    expect(html).toContain('data-today-scope-density="compact"');
    expect(html).toMatch(/<p[^>]*role="status"[^>]*class="sr-only"/);
    expect(html).toContain("Countywide briefing");
    expect(html).toContain("Choose your area");
    expect(html).toContain("Whole county");
    expect(html).toContain("Use my location");
    expect(html).not.toContain("data-today-dateline");
  });

  it("renders an accessible live status and an explicit location opt-in", () => {
    const html = renderToStaticMarkup(createElement(TodayScopeStatus));

    expect(html).toContain('role="status"');
    expect(html).toContain('aria-live="polite"');
    expect(html).toContain('data-testid="today-scope-status"');
    expect(html).toContain("Countywide briefing");
    expect(html).toContain('type="button"');
    expect(html).toContain("Use my location");
  });
});
