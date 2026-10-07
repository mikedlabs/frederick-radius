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

  it("explains what location is for beside the button that can prompt for it", () => {
    const html = renderToStaticMarkup(createElement(TodayScopeStatus));
    const describedBy = html.match(/<button[^>]*aria-describedby="([^"]+)"/)?.[1];

    expect(describedBy).toBeTruthy();
    expect(html).toContain(`id="${describedBy}"`);
    expect(html).toContain(NEAR_ME_BENEFIT);
    // The sentence is on the page before the tap, not after the prompt.
    expect(html.indexOf("Use my location")).toBeLessThan(html.indexOf(NEAR_ME_BENEFIT));
  });

  it("names the area choices with the shared scope labels", () => {
    const html = renderToStaticMarkup(createElement(TodayScopeStatus));

    expect(html).toContain(`<option value="county" selected="">${scopeLabel("county")}</option>`);
    expect(html).not.toContain("Frederick, MD");
  });
});
