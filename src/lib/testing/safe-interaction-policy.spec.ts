import { describe, expect, it } from "vitest";
import {
  classifySafeInteraction,
  type InteractionCandidate,
} from "./safe-interaction-policy";

function candidate(
  overrides: Partial<InteractionCandidate> = {},
): InteractionCandidate {
  return {
    tagName: "button",
    text: "Options",
    href: null,
    target: null,
    download: false,
    buttonType: "button",
    disabled: false,
    role: null,
    ariaExpanded: "false",
    ariaPressed: null,
    ariaHasPopup: null,
    crawlerPolicy: null,
    ...overrides,
  };
}

describe("safe browser interaction policy", () => {
  it.each([
    candidate(),
    candidate({ text: "Transit", ariaExpanded: null, ariaPressed: "false" }),
    candidate({ text: "Weekend", ariaExpanded: null, role: "tab" }),
    candidate({
      tagName: "a",
      text: "Open Today",
      href: "/today",
      buttonType: null,
      ariaExpanded: null,
    }),
    candidate({
      tagName: "a",
      text: "Back to access code",
      href: "#beta-access",
      buttonType: null,
      ariaExpanded: null,
    }),
    candidate({
      tagName: "a",
      text: "Find something to save",
      href: "/search",
      buttonType: null,
      ariaExpanded: null,
    }),
  ])("allows a provably read-only control", (value) => {
    expect(classifySafeInteraction(value).safe).toBe(true);
  });

  it.each([
    candidate({ text: "Save this place", ariaExpanded: null }),
    candidate({ text: "Delete", ariaExpanded: null }),
    candidate({ text: "Submit", buttonType: "submit" }),
    candidate({ text: "Unknown action", ariaExpanded: null }),
    candidate({
      tagName: "a",
      text: "Email us",
      href: "mailto:hello@example.com",
      buttonType: null,
      ariaExpanded: null,
    }),
    candidate({
      tagName: "a",
      text: "Admin",
      href: "/admin",
      buttonType: null,
      ariaExpanded: null,
    }),
    candidate({
      tagName: "a",
      text: "Log out",
      href: "/logout",
      buttonType: null,
      ariaExpanded: null,
    }),
    candidate({
      tagName: "a",
      text: "Remove this place",
      href: "/my-radius/remove/example",
      buttonType: null,
      ariaExpanded: null,
    }),
    candidate({
      tagName: "a",
      text: "External",
      href: "https://example.com",
      buttonType: null,
      ariaExpanded: null,
    }),
    candidate({
      tagName: "a",
      text: "Download",
      href: "/guide.pdf",
      download: true,
      buttonType: null,
      ariaExpanded: null,
    }),
    candidate({ crawlerPolicy: "false" }),
  ])("denies a control that could mutate or leave the app", (value) => {
    expect(classifySafeInteraction(value).safe).toBe(false);
  });

  it("does not let an explicit opt-in bypass a submit or unsafe label", () => {
    expect(
      classifySafeInteraction(
        candidate({
          text: "Send update",
          buttonType: "submit",
          crawlerPolicy: "true",
        }),
      ).safe,
    ).toBe(false);
  });
});
