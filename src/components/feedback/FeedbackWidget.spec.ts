import { describe, expect, it } from "vitest";
import {
  buildFeedbackRequestBody,
  feedbackSendErrorMessage,
  FEEDBACK_TRIGGER_BOTTOM,
  publicFeedbackSurface,
  shouldShowFeedbackTrigger,
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

  it("opens feedback to Fair Day without exposing unrelated app pages", () => {
    expect(publicFeedbackSurface("/moments/great-frederick-fair-2026")).toBe(
      "fair",
    );
    expect(publicFeedbackSurface("/food-trucks")).toBe("food-trucks");
    expect(publicFeedbackSurface("/today")).toBeNull();
  });

  it("keeps Fair feedback in the Fair Help flow instead of floating over its navigation", () => {
    expect(shouldShowFeedbackTrigger("fair")).toBe(false);
    expect(shouldShowFeedbackTrigger("food-trucks")).toBe(true);
    expect(shouldShowFeedbackTrigger(null)).toBe(true);
  });

  it("adds structured metadata only to a Fair request", () => {
    expect(
      buildFeedbackRequestBody({
        message: "The entrance moved.",
        email: "",
        pathname: "/moments/great-frederick-fair-2026",
        fairIssue: "map_wrong",
        fairContext: "Gate 3",
      }),
    ).toEqual({
      message: "The entrance moved.",
      pathname: "/moments/great-frederick-fair-2026",
      fairIssue: "map_wrong",
      fairContext: "Gate 3",
    });

    expect(
      buildFeedbackRequestBody({
        message: "The stop moved.",
        email: "visitor@example.com",
        pathname: "/food-trucks",
        fairIssue: "map_wrong",
        fairContext: "Vendor row",
      }),
    ).toEqual({
      message: "The stop moved.",
      email: "visitor@example.com",
      pathname: "/food-trucks",
    });
  });
});
