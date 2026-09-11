import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import PlaceCommunicationAccess from "./PlaceCommunicationAccess";

describe("PlaceCommunicationAccess", () => {
  it("renders only source-backed communication facts with their checked source", () => {
    const html = renderToStaticMarkup(
      createElement(PlaceCommunicationAccess, {
        place: {
          accessibility: {
            communication: {
              deaf_community: true,
              asl_environment: true,
              written_contact: true,
              videophone: true,
              source_url: "https://example.org/access",
              verified_at: "2026-07-28",
              notes: "Email and videophone contact methods are published.",
            },
          },
        },
      }),
    );

    expect(html).toContain("Communication access");
    expect(html).toContain("Deaf-community place");
    expect(html).toContain("ASL-rich environment");
    expect(html).toContain("Written contact available");
    expect(html).toContain("Videophone");
    expect(html).toContain("Email and videophone contact methods are published.");
    expect(html).toContain('href="https://example.org/access"');
    expect(html).toContain("Source checked Jul 28, 2026");
    expect(html).not.toContain("ASL interpretation");
    expect(html).not.toContain("Captions");
  });

  it("renders nothing when no communication-access facts are published", () => {
    expect(
      renderToStaticMarkup(
        createElement(PlaceCommunicationAccess, {
          place: { accessibility: undefined },
        }),
      ),
    ).toBe("");
  });
});
