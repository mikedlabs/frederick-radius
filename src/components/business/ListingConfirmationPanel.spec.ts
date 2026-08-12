import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { OwnerListingFacts } from "@/lib/business/owner-listing-confirmation";

vi.mock("@/components/business/manage-actions", () => ({
  submitOwnerListingConfirmationAction: vi.fn(),
}));

import ListingConfirmationPanel from "./ListingConfirmationPanel";

function render(facts: OwnerListingFacts) {
  return renderToStaticMarkup(
    createElement(ListingConfirmationPanel, {
      token: "owner-token",
      listingHref: "/places/test-cafe",
      facts,
    }),
  );
}

describe("ListingConfirmationPanel", () => {
  it("labels the decision, current facts, moderation note, and public listing link", () => {
    const html = render({
      status: {
        value: "operational",
        label: "Operating",
        confirmable: true,
      },
      hours: { lines: ["Mon 8am–5pm"], checkedAt: "2026-08-10T12:00:00Z" },
      phone: "301-555-0100",
      website: "https://example.com",
      listingCheckedAt: "2026-08-10T12:00:00Z",
    });

    expect(html).toContain('aria-labelledby="listing-check-title"');
    expect(html.match(/type="radio"/g)).toHaveLength(2);
    expect(html).toMatch(/Are the listed details still right\?/i);
    expect(html).toContain('href="/places/test-cafe"');
    expect(html).toContain("View public page");
    expect(html).toContain("Every confirmation and change is reviewed");
  });

  it("does not turn an unsafe stored website into a link", () => {
    const html = render({
      status: undefined,
      hours: null,
      website: "javascript:alert(1)",
    });

    expect(html).not.toContain('href="javascript:');
    expect(html).toContain("javascript:alert(1)");
  });

  it("disables confirmation when the page has no confirmable facts", () => {
    const html = render({
      status: {
        value: "needs_verification",
        label: "Not yet confirmed",
        confirmable: false,
      },
      hours: null,
    });

    const confirmed = html.match(/<input[^>]*value="confirmed"[^>]*>/)?.[0];
    expect(confirmed).toContain("disabled");
    expect(html).toMatch(/no published details are ready/i);
  });
});
