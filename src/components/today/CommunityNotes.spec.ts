// @vitest-environment jsdom

import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import CommunityNotes from "./CommunityNotes";

const preferences = vi.hoisted(() => ({
  getCommunityNotes: vi.fn(() => true),
  setCommunityNotes: vi.fn(),
}));

vi.mock("@/lib/personalize", () => preferences);

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

describe("CommunityNotes", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-23T12:00:00-04:00"));
    preferences.getCommunityNotes.mockReturnValue(true);
    preferences.setCommunityNotes.mockClear();
  });

  afterEach(() => {
    vi.useRealTimers();
    document.body.replaceChildren();
  });

  it("uses real 44px boxes for the Sunday action and dismiss control", async () => {
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(createElement(CommunityNotes));
    });

    const action = container.querySelector<HTMLAnchorElement>(
      'a[href="/category/worship"]',
    );
    const dismiss = container.querySelector<HTMLButtonElement>(
      'button[aria-label="Hide community notes"]',
    );

    expect(action?.className).toContain("min-h-11");
    expect(action?.className).not.toContain("tap-44-y");
    expect(dismiss?.className).toContain("h-11");
    expect(dismiss?.className).toContain("w-11");
    expect(dismiss?.className).not.toContain("tap-44");

    await act(async () => dismiss?.click());
    expect(preferences.setCommunityNotes).toHaveBeenCalledWith(false);
    expect(container.textContent).not.toContain("Places of worship");

    await act(async () => root.unmount());
  });
});
