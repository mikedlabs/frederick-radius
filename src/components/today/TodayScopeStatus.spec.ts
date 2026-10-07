import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import TodayScopeStatus, { todayScopeStatusText } from "./TodayScopeStatus";
import { NEAR_ME_BENEFIT, scopeLabel } from "@/lib/scope";

vi.mock("next/navigation", () => ({ useSearchParams: () => new URLSearchParams() }));

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
    expect(todayScopeStatusText("nearme", false)).toBe(
      "Location needed for nearby picks · Countywide weather and events",
    );
    expect(todayScopeStatusText("county")).toBe("Countywide briefing");
    expect(todayScopeStatusText(null)).toBe("Countywide briefing");
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

  it("keeps the location explanation off the first screen until it is asked for", () => {
    const html = renderToStaticMarkup(createElement(TodayScopeStatus));

    // Today's Find launcher has a first-screen budget (owner PR #1734). The
    // benefit sentence appears on the first tap, before any browser prompt,
    // inside a live region that is already mounted.
    expect(html).toContain("Use my location");
    expect(html).not.toContain(NEAR_ME_BENEFIT);
    expect(html).not.toMatch(/<button[^>]*aria-describedby=/);
    expect(html).toContain('aria-live="polite" class="sr-only"');
  });

  it("names the area choices with the shared scope labels", () => {
    const html = renderToStaticMarkup(createElement(TodayScopeStatus));

    expect(html).toContain(`<option value="county" selected="">${scopeLabel("county")}</option>`);
    expect(html).not.toContain("Frederick, MD");
  });
});
