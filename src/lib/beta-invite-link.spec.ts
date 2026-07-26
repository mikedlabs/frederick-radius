import { describe, expect, it } from "vitest";
import { buildBetaInviteLink } from "./beta-invite-link";

describe("buildBetaInviteLink", () => {
  it("carries a safe shared destination through the email", () => {
    const link = new URL(
      buildBetaInviteLink(
        "frederick-abcd",
        "/places/gravel-and-grind-frederick?from=map",
      ),
    );
    expect(link.origin).toBe("https://frederickradius.app");
    expect(link.pathname).toBe("/beta");
    expect(link.searchParams.get("code")).toBe("frederick-abcd");
    expect(link.searchParams.get("next")).toBe(
      "/places/gravel-and-grind-frederick?from=map",
    );
  });

  it("falls back to Today for an external destination", () => {
    const link = new URL(
      buildBetaInviteLink("frederick-abcd", "https://evil.example/phish"),
    );
    expect(link.searchParams.get("next")).toBe("/today");
  });
});
