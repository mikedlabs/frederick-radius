import { describe, expect, it } from "vitest";
import { consumeInitialPlaceCameraFocus } from "./mapInitialSelection";

const slug = "schifferstadt-architectural-museum-frederick";
const barePlace = {
  selectedSlug: slug,
  liveSearch: `?place=${slug}`,
  hasEntryCamera: false,
  hasUserCameraIntent: false,
  hasOtherCameraOwner: false,
};

describe("cold place camera intent", () => {
  it("focuses the selected canonical place once even after the map writes its county c", () => {
    const pending = { current: slug as string | null };
    const settled = {
      ...barePlace,
      liveSearch: `?place=${slug}&c=-77.4100,39.4600,9.60`,
    };
    expect(consumeInitialPlaceCameraFocus(pending, settled)).toBe(true);
    // Card metadata and subsequent map renders must not repeat the focus.
    expect(consumeInitialPlaceCameraFocus(pending, settled)).toBe(false);
  });

  it("preserves an explicit saved entry camera", () => {
    const pending = { current: slug as string | null };
    expect(consumeInitialPlaceCameraFocus(pending, {
      ...barePlace,
      hasEntryCamera: true,
      liveSearch: `?place=${slug}&c=-77.5100,39.6600,11.00`,
    })).toBe(false);
    expect(pending.current).toBeNull();
  });

  it.each([
    ["newer place", { ...barePlace, selectedSlug: "baker-park-frederick", liveSearch: "?place=baker-park-frederick" }],
    ["newer event", { ...barePlace, selectedSlug: null, liveSearch: "?event=concert" }],
    ["closed URL", { ...barePlace, liveSearch: "" }],
    ["newer live URL before selection commits", { ...barePlace, liveSearch: "?place=baker-park-frederick" }],
    ["user pan before or during renderer load", { ...barePlace, hasUserCameraIntent: true }],
    ["Nearby or scene camera owner", { ...barePlace, hasOtherCameraOwner: true }],
  ])("consumes without moving for %s", (_label, context) => {
    const pending = { current: slug as string | null };
    expect(consumeInitialPlaceCameraFocus(pending, context)).toBe(false);
    // Returning to the original selection cannot revive the old request.
    expect(consumeInitialPlaceCameraFocus(pending, barePlace)).toBe(false);
  });

  it("does not create a focus for cold events or renderer fallback", () => {
    expect(consumeInitialPlaceCameraFocus({ current: null }, barePlace)).toBe(false);
  });
});
