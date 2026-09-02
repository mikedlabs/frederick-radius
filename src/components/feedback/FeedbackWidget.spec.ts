import { describe, expect, it } from "vitest";
import {
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
  it("opens feedback to Fair Day without exposing unrelated app pages", () => {
    expect(publicFeedbackSurface("/moments/great-frederick-fair-2026")).toBe(
      "fair",
    );
    expect(publicFeedbackSurface("/food-trucks")).toBe("food-trucks");
    expect(publicFeedbackSurface("/today")).toBeNull();
  });
});
