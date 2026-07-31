import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import TodayScopeStatus, { todayScopeStatusText } from "./TodayScopeStatus";

describe("TodayScopeStatus", () => {
  it("names the part of Today that follows a selected town", () => {
    expect(todayScopeStatusText("town:brunswick")).toBe(
      "Brunswick place picks · Countywide weather and events",
    );
  });

  it("keeps nearby and countywide scope claims honest", () => {
    expect(todayScopeStatusText("nearme")).toBe(
      "Nearby place picks · Countywide weather and events",
    );
    expect(todayScopeStatusText("county")).toBe("Countywide briefing");
    expect(todayScopeStatusText(null)).toBe("Countywide briefing");
  });

  it("renders an accessible live status with the server-safe county snapshot", () => {
    const html = renderToStaticMarkup(createElement(TodayScopeStatus));

    expect(html).toContain('role="status"');
    expect(html).toContain('aria-live="polite"');
    expect(html).toContain('data-testid="today-scope-status"');
    expect(html).toContain("Countywide briefing");
  });
});
