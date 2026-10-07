// @vitest-environment jsdom

import { act, type AnchorHTMLAttributes } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const navigation = vi.hoisted(() => ({
  pathname: "/events",
  push: vi.fn(),
  back: vi.fn(),
  prefetch: vi.fn(),
}));
vi.mock("next/navigation", () => ({
  usePathname: () => navigation.pathname,
  useRouter: () => ({
    push: navigation.push,
    back: navigation.back,
    prefetch: navigation.prefetch,
  }),
}));
vi.mock("next/link", () => ({
  default: ({ prefetch, ...props }: AnchorHTMLAttributes<HTMLAnchorElement> & { prefetch?: boolean }) => {
    void prefetch;
    return <a {...props} />;
  },
}));
vi.mock("./LocationChip", () => ({ default: () => null }));
vi.mock("./PulseIndicator", () => ({ default: () => null }));
vi.mock("@/components/brand/RippleMark", () => ({ default: () => null }));
vi.mock("@/hooks/useGeolocation", () => ({ readCachedPosition: () => null }));
vi.mock("@/lib/track", () => ({ track: vi.fn() }));

import TopBar from "./TopBar";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;

async function renderAt(pathname: string) {
  navigation.pathname = pathname;
  await act(async () => { root.render(<TopBar />); });
}
function headerBack() {
  return container.querySelector<HTMLButtonElement>('header button[aria-label="Back"]');
}
function homeLink() {
  return container.querySelector<HTMLAnchorElement>('header a[href="/"]');
}

beforeEach(() => {
  vi.clearAllMocks();
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => { root.unmount(); });
  container.remove();
});

describe("TopBar Back on place, event, and town details", () => {
  it.each([
    ["/events/fall-festival-2026", "/events"],
    ["/places/gravel-and-grind", "/map"],
    ["/m/thurmont", "/map"],
  ])("shows Back on a cold arrival at %s and falls back to %s", async (pathname, section) => {
    await renderAt(pathname);

    const back = headerBack();
    expect(back).not.toBeNull();
    expect(homeLink()).toBeNull();

    await act(async () => { back!.click(); });
    expect(navigation.back).not.toHaveBeenCalled();
    expect(navigation.push).toHaveBeenCalledWith(section);
  });

  it("returns to the originating page with history Back after an in-app navigation", async () => {
    await renderAt("/map");
    expect(headerBack()).toBeNull();

    await renderAt("/places/gravel-and-grind");
    await act(async () => { headerBack()!.click(); });

    expect(navigation.back).toHaveBeenCalledTimes(1);
    expect(navigation.push).not.toHaveBeenCalled();
  });

  it.each(["/events", "/events/calendar", "/places", "/map"])(
    "keeps the home wordmark on the section page %s",
    async (pathname) => {
      await renderAt(pathname);

      expect(headerBack()).toBeNull();
      expect(homeLink()).not.toBeNull();
    },
  );

  it("still sends a cold Back on a page no tab claims to Today", async () => {
    await renderAt("/about");
    await act(async () => { headerBack()!.click(); });

    expect(navigation.push).toHaveBeenCalledWith("/today");
  });
});
