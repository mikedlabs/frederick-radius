import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  mounted: false,
  been: false,
  toggle: vi.fn(),
}));

vi.mock("@/hooks/useBeenHere", () => ({
  useHasBeenThere: () => state.been,
  useToggleBeenThere: () => state.toggle,
}));

vi.mock("@/hooks/useSaved", () => ({
  useMounted: () => state.mounted,
}));

import BeenHereToggle from "./BeenHereToggle";

function buttonText(markup: string): string {
  return markup
    .replace(/<svg[\s\S]*?<\/svg>/g, "")
    .replace(/<[^>]+>/g, "")
    .trim();
}

describe("BeenHereToggle render stability", () => {
  beforeEach(() => {
    state.mounted = false;
    state.been = false;
    state.toggle.mockReset();
  });

  it("keeps the default label and presentation stable across mount", () => {
    const fallback = renderToStaticMarkup(
      <BeenHereToggle placeSlug="test-place" label="Test Place" />,
    );

    state.mounted = true;
    const mounted = renderToStaticMarkup(
      <BeenHereToggle placeSlug="test-place" label="Test Place" />,
    );

    expect(buttonText(fallback)).toBe("Mark as visited");
    expect(buttonText(mounted)).toBe("Mark as visited");
    for (const markup of [fallback, mounted]) {
      expect(markup).toContain("tap-44-y");
      expect(markup).toContain("background:var(--app-bg-elevated)");
      expect(markup).toContain("color:var(--app-ink-2)");
    }
  });
});
