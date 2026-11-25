import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  buildFeedbackRequestBody,
  feedbackSendErrorMessage,
  FEEDBACK_TRIGGER_BOTTOM,
  FEEDBACK_TRIGGER_DISPLAY_CLASS,
  publicFeedbackSurface,
} from "./FeedbackWidget";
import { MOBILE_BOTTOM_CHROME_RESERVE } from "@/components/ui/MobileActionBar";

describe("FeedbackWidget bottom-chrome clearance", () => {
  it("uses the one shared reserve for either primary or contextual chrome", () => {
    expect(FEEDBACK_TRIGGER_BOTTOM).toContain(MOBILE_BOTTOM_CHROME_RESERVE);
    expect(FEEDBACK_TRIGGER_BOTTOM).toContain("safe-area-inset-bottom");
    expect(FEEDBACK_TRIGGER_BOTTOM).toContain("+ 12px");
  });

  it("shows the floating trigger only from the breakpoint where the desktop rail is present", () => {
    // The trigger sits at the foot of the rail, so both use the lg breakpoint.
    const rail = readFileSync("src/components/nav/SideRail.tsx", "utf8");
    expect(rail).toContain("hidden lg:flex");
    expect(FEEDBACK_TRIGGER_DISPLAY_CLASS).toBe("hidden lg:inline-flex");
  });

  it("has no per-route position or visibility rule", () => {
    const widget = readFileSync("src/components/feedback/FeedbackWidget.tsx", "utf8");
    expect(widget).not.toContain('pathname === "/map"');
    expect(widget).not.toContain("feedbackInMoreMenu");
    const helpers = readFileSync("src/lib/feedback-ui.ts", "utf8");
    expect(helpers).not.toContain("feedbackInMoreMenu");
  });
});

describe("FeedbackWidget public surfaces", () => {
  it("tells a visitor that an unsaved report remains available to retry", () => {
    expect(feedbackSendErrorMessage("feedback-storage-unavailable")).toBe(
      "We couldn't save your report, so your message is still here for you to try again in a moment.",
    );
  });

  it("names only the food-truck board as a surface with its own confirmation wording", () => {
    expect(publicFeedbackSurface("/food-trucks")).toBe("food-trucks");
    expect(publicFeedbackSurface("/today")).toBeNull();
    expect(publicFeedbackSurface("/fair")).toBeNull();
    expect(publicFeedbackSurface("/moments/great-frederick-fair-2026")).toBeNull();
  });

  it("sends only the note, an optional email, and the page", () => {
    expect(
      buildFeedbackRequestBody({
        message: "The stop moved.",
        email: "visitor@example.com",
        pathname: "/food-trucks",
      }),
    ).toEqual({
      message: "The stop moved.",
      email: "visitor@example.com",
      pathname: "/food-trucks",
    });

    expect(
      buildFeedbackRequestBody({ message: "A note.", email: "", pathname: null }),
    ).toEqual({ message: "A note." });
  });
});
