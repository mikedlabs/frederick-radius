// @vitest-environment jsdom

import { act, type AnchorHTMLAttributes } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const navigation = vi.hoisted(() => ({ pathname: "/events" }));
vi.mock("next/navigation", () => ({
  usePathname: () => navigation.pathname,
  useSearchParams: () => new URLSearchParams(window.location.search),
  useRouter: () => ({ push: vi.fn(), back: vi.fn(), prefetch: vi.fn() }),
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
vi.mock("@/components/today/TodayAsk", () => ({ default: () => null }));
vi.mock("@/components/today/TodayScopeStatus", () => ({ default: () => null }));
// Feedback does not open Find. Keep the workspace chunk out of this spec.
vi.mock("@/components/search/SearchOverlay", () => ({ default: () => null }));

import TopBar from "./TopBar";
import { OPEN_FEEDBACK_EVENT, PENDING_FEEDBACK_KEY } from "@/lib/feedback-ui";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;

async function mount(pathname: string) {
  navigation.pathname = pathname;
  window.history.replaceState({}, "", pathname);
  // The first act hydrates the header; the readiness microtask needs a second.
  await act(async () => { root.render(<TopBar />); });
  await act(async () => { await Promise.resolve(); });
}

beforeEach(() => {
  window.sessionStorage.clear();
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => { root.unmount(); });
  container.remove();
  window.history.replaceState({}, "", "/");
});

describe("Send feedback in More tools", () => {
  // Today and Parking had the row first. The floating trigger no longer
  // exists below the desktop rail, so every route needs this entry.
  it.each(["/today", "/parking", "/map", "/events", "/my-radius", "/ask", "/places/baker-park-frederick"])(
    "offers the row on %s, closes the menu and hands the sheet its return focus",
    async (pathname) => {
      await mount(pathname);
      const menu = container.querySelector<HTMLDetailsElement>('[data-today-header-disclosure="tools"]')!;
      const summary = menu.querySelector("summary")!;
      const row = [...menu.querySelectorAll<HTMLButtonElement>("button")]
        .find((button) => button.textContent?.trim() === "Send feedback");
      expect(row, pathname).toBeDefined();
      expect(row!.getAttribute("aria-haspopup")).toBe("dialog");
      expect(row!.disabled).toBe(false);

      const requests: Array<HTMLElement | null> = [];
      const listen = (event: Event) => requests.push((event as CustomEvent).detail?.returnFocusTo ?? null);
      window.addEventListener(OPEN_FEEDBACK_EVENT, listen);
      try {
        await act(async () => { summary.click(); });
        expect(menu.open).toBe(true);
        await act(async () => { row!.click(); });
      } finally {
        window.removeEventListener(OPEN_FEEDBACK_EVENT, listen);
      }
      expect(menu.open).toBe(false);
      // The row is inside the menu that just closed, so focus returns to the
      // still-visible summary.
      expect(requests).toEqual([summary]);
      expect(document.activeElement).toBe(summary);
      expect(window.sessionStorage.getItem(PENDING_FEEDBACK_KEY)).toBe("1");
    },
  );
});
