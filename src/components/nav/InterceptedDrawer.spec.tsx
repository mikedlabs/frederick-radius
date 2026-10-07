import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import InterceptedDrawer from "./InterceptedDrawer";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ back: vi.fn() }),
}));

// Record what the route drawer asks of the shared primitive without pulling
// Vaul's portal into a server render.
vi.mock("@/components/ui/BottomDrawer", () => ({
  default: ({
    children,
    surface,
    title,
  }: {
    children: ReactNode;
    surface?: string;
    title: string;
  }) =>
    createElement(
      "section",
      { "data-surface": surface ?? "default", "aria-label": title },
      children,
    ),
}));

describe("InterceptedDrawer", () => {
  it("opens route drawers on the opaque surface so the page behind cannot read through", () => {
    const html = renderToStaticMarkup(
      <InterceptedDrawer title="All tools" bareHeader>
        <p>What do you need?</p>
      </InterceptedDrawer>,
    );

    expect(html).toContain('data-surface="solid"');
    expect(html).toContain('aria-label="All tools"');
    expect(html).toContain("What do you need?");
  });
});
