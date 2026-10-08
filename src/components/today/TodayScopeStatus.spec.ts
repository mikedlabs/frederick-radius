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

  it("renders one area line with an accessible live status", () => {
    const html = renderToStaticMarkup(createElement(TodayScopeStatus));

    expect(html).toContain('role="status"');
    expect(html).toContain('aria-live="polite"');
    expect(html).toContain('data-testid="today-scope-status"');
    expect(html).toContain("Countywide briefing");
    expect(html).toContain('<span class="sr-only">Choose your area</span>');
    // The select is set as 16px semibold text, not a bordered box, so iOS
    // does not zoom on focus and the line reads as type.
    expect(html).toMatch(/<select[^>]*class="[^"]*text-body-lg[^"]*appearance-none[^"]*border-0[^"]*bg-transparent/);
    expect(html).toMatch(/<select[^>]*class="[^"]*min-h-11/);
    expect(html).not.toContain("rounded-full");
  });

  it("keeps the location explanation and its button off the first screen", () => {
    const html = renderToStaticMarkup(createElement(TodayScopeStatus));

    // The benefit sentence and the one button that can open the browser
    // prompt appear only after someone chooses Near me. The live region that
    // will announce them is already mounted.
    expect(html).not.toContain("Use my location");
    expect(html).not.toContain(NEAR_ME_BENEFIT);
    expect(html).not.toContain("<button");
    expect(html).toContain('<div aria-live="polite"></div>');
  });

  it("names the area choices with the shared scope labels, Near me second", () => {
    const html = renderToStaticMarkup(createElement(TodayScopeStatus));

    expect(html).toContain(
      `<option value="county" selected="">${scopeLabel("county")}</option><option value="nearme">${scopeLabel("nearme")}</option><option value="town:`,
    );
    expect(html).not.toContain("Frederick, MD");
  });
});
