import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import TodayScopeStatus, { todayScopeStatusText } from "./TodayScopeStatus";

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({ replace: vi.fn(), refresh: vi.fn() }),
}));

describe("TodayScopeStatus", () => {
  it("names the part of Today that follows a selected town", () => {
    expect(todayScopeStatusText("town:brunswick")).toBe(
      "Brunswick picks · Weather for the whole county",
    );
  });

  it("keeps nearby and countywide scope claims honest", () => {
    expect(todayScopeStatusText("nearme")).toBe(
      "Near me picks · Weather and events for the whole county",
    );
    expect(todayScopeStatusText("nearme", false)).toBe(
      "Near me needs your location · Weather and events for the whole county",
    );
    expect(todayScopeStatusText("county")).toBe("Whole county briefing");
    expect(todayScopeStatusText(null)).toBe("Whole county briefing");
  });

  it("compacts redundant county text without removing the picker or explicit location opt-in", () => {
    const html = renderToStaticMarkup(createElement(TodayScopeStatus, { density: "compact" }));
    expect(html).toContain('data-today-scope-density="compact"');
    expect(html).toMatch(/<p[^>]*role="status"[^>]*class="sr-only"/);
    expect(html).toContain("Whole county briefing");
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
    expect(html).toContain("Whole county briefing");
    expect(html).toContain('type="button"');
    expect(html).toContain("Use my location");
  });
});
