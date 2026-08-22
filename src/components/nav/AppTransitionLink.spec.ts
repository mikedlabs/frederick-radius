// @vitest-environment jsdom

import {
  act,
  createElement,
  type ComponentProps,
  type MouseEvent as ReactMouseEvent,
} from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ push: vi.fn() }));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mocks.push }),
}));

vi.mock("next/link", async () => {
  const { createElement: makeElement } = await import("react");
  return {
    default: ({ href, children, ...props }: ComponentProps<"a">) =>
      makeElement("a", { href, ...props }, children),
  };
});

import AppTransitionLink from "./AppTransitionLink";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

describe("AppTransitionLink", () => {
  let root: Root;
  let container: HTMLDivElement;
  let reducedMotion = false;
  let startViewTransition: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mocks.push.mockReset();
    reducedMotion = false;
    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      value: vi.fn(() => ({
        matches: reducedMotion,
        media: "(prefers-reduced-motion: reduce)",
        onchange: null,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        addListener: vi.fn(),
        removeListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
    });
    startViewTransition = vi.fn((callback: () => void) => {
      callback();
      return {};
    });
    Object.defineProperty(document, "startViewTransition", {
      configurable: true,
      value: startViewTransition,
    });
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    vi.restoreAllMocks();
  });

  async function renderLink(
    props: Partial<ComponentProps<typeof AppTransitionLink>> = {},
  ) {
    await act(async () => {
      root.render(
        createElement(
          AppTransitionLink,
          { href: "/pulse?open=weather", ...props },
          "Open weather details",
        ),
      );
    });
    return container.querySelector("a") as HTMLAnchorElement;
  }

  it("hands an ordinary in-app click to the shared view transition", async () => {
    const link = await renderLink();
    const click = new MouseEvent("click", {
      bubbles: true,
      cancelable: true,
      button: 0,
    });

    await act(async () => link.dispatchEvent(click));

    expect(click.defaultPrevented).toBe(true);
    expect(startViewTransition).toHaveBeenCalledOnce();
    expect(mocks.push).toHaveBeenCalledWith("/pulse?open=weather");
  });

  it("leaves navigation native when reduced motion is requested", async () => {
    reducedMotion = true;
    const link = await renderLink({ href: "#weather" });
    const click = new MouseEvent("click", {
      bubbles: true,
      cancelable: true,
      button: 0,
      ctrlKey: false,
    });

    await act(async () => link.dispatchEvent(click));

    expect(startViewTransition).not.toHaveBeenCalled();
    expect(mocks.push).not.toHaveBeenCalled();
  });

  it("respects a caller that cancels the click", async () => {
    const onClick = vi.fn((event: ReactMouseEvent<HTMLAnchorElement>) => {
      event.preventDefault();
    });
    const link = await renderLink({ onClick });

    await act(async () => link.click());

    expect(onClick).toHaveBeenCalledOnce();
    expect(startViewTransition).not.toHaveBeenCalled();
    expect(mocks.push).not.toHaveBeenCalled();
  });
});
