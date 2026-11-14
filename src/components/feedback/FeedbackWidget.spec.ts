import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  buildFeedbackRequestBody,
  feedbackSendErrorMessage,
  FEEDBACK_TRIGGER_BOTTOM,
  publicFeedbackSurface,
} from "./FeedbackWidget";
import { MOBILE_BOTTOM_CHROME_RESERVE } from "@/components/ui/MobileActionBar";

describe("FeedbackWidget bottom-chrome clearance", () => {
  it("uses the one shared reserve for either primary or contextual chrome", () => {
    expect(FEEDBACK_TRIGGER_BOTTOM).toContain(MOBILE_BOTTOM_CHROME_RESERVE);
    expect(FEEDBACK_TRIGGER_BOTTOM).toContain("safe-area-inset-bottom");
    expect(FEEDBACK_TRIGGER_BOTTOM).toContain("+ 12px");
  });
});

describe("FeedbackWidget public surfaces", () => {
  it("tells a visitor that an unsaved report remains available to retry", () => {
    expect(feedbackSendErrorMessage("feedback-storage-unavailable")).toBe(
      "We couldn't save your report, so your message is still here for you to try again in a moment.",
    );
  });

  it("reserves room below reading pages so the last content scrolls clear of the trigger", () => {
    const css = readFileSync("src/app/globals.css", "utf8");
    const bar = Number(/--app-bottomnav-reserve:\s*(\d+)px/.exec(css)?.[1]);
    const reserve = /\.app-main-reading\[data-bottom-nav-reserve="true"\]\s*\{\s*padding-bottom:\s*calc\((\d+(?:\.\d+)?)rem \+ env/.exec(css);
    // FEEDBACK_TRIGGER_BOTTOM puts the 44px trigger 12px above the bar.
    expect(Number(reserve?.[1]) * 16).toBeGreaterThanOrEqual(bar + 12 + 44);
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
