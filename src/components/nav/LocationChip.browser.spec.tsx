// @vitest-environment jsdom

import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import LocationChip from "./LocationChip";
import { NEAR_ME_BENEFIT, setScope } from "@/lib/scope";

const router = { replace: vi.fn(), refresh: vi.fn() };

vi.mock("next/navigation", () => ({
  useRouter: () => router,
  useSearchParams: () => new URLSearchParams(window.location.search),
}));

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

describe("LocationChip scope wording", () => {
  let root: Root;
  let container: HTMLDivElement;

  beforeEach(() => {
    // vitest's jsdom exposes window.localStorage without working methods, so
    // stand up an in-memory store the scope helpers can reach.
    const store = new Map<string, string>();
    Object.defineProperty(window, "localStorage", {
      configurable: true,
      value: {
        getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
        setItem: (k: string, v: string) => store.set(k, String(v)),
        removeItem: (k: string) => store.delete(k),
        clear: () => store.clear(),
      },
    });
    document.cookie = "fr_scope=; path=/; max-age=0";
    window.sessionStorage.clear();
    window.history.replaceState(null, "", "/events");
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    vi.restoreAllMocks();
    router.replace.mockReset();
    router.refresh.mockReset();
    window.sessionStorage.clear();
  });

  const render = async (compact = false) => {
    await act(async () => {
      root.render(createElement(LocationChip, { compact }));
    });
  };
  const chip = () =>
    container.querySelector<HTMLButtonElement>("[data-location-chip]")!;
  const slot = (name: "compact" | "full") =>
    chip().querySelector<HTMLElement>(`[data-location-scope-label="${name}"]`)!;
  const openMenu = async () => {
    await act(async () => chip().click());
  };
  const nearMeButton = () =>
    container
      .querySelector("#location-near-me-label")
      ?.closest("button") as HTMLButtonElement;

  it("labels an unset scope Whole county and keeps County for the narrow slot only", async () => {
    await render();

    expect(chip().getAttribute("aria-label")).toBe(
      "Change town or location scope. Current scope: Whole county",
    );
    expect(slot("full").textContent).toBe("Whole county");
    expect(slot("compact").textContent).toBe("County");
    expect(chip().textContent).not.toMatch(/Frederick/);
    // Measured against the phone header, "Whole county" clears the Tools
    // label and a visible county status from 448px. Below that the complete
    // short word stays; from 448px the full label takes over.
    expect(slot("compact").className).toContain("min-[390px]:block");
    expect(slot("compact").className).toContain("min-[448px]:hidden");
    expect(slot("full").className).toContain("min-[448px]:block");
    expect(chip().className).toContain("min-[448px]:max-w-[140px]");
  });

  it("reads the explicit county lens the same way as an unset one", async () => {
    setScope("county");
    await render();

    expect(slot("full").textContent).toBe("Whole county");
    expect(slot("compact").textContent).toBe("County");
  });

  it("gives the map's compact chip the same full label", async () => {
    await render(true);

    expect(slot("full").textContent).toBe("Whole county");
    expect(slot("compact").textContent).toBe("County");
    expect(chip().textContent).not.toContain("Frederick County");
  });

  it("keeps town and Near me names on the existing breakpoints", async () => {
    setScope("town:brunswick");
    await render();

    expect(slot("compact").textContent).toBe("Brunswick");
    expect(slot("full").textContent).toBe("Brunswick");
    expect(slot("compact").className).toContain("sm:hidden");
    expect(slot("full").className).toContain("sm:block");
  });

  it("explains what Near me is for before the browser can ask", async () => {
    let describedWhenAsked: string | null | undefined;
    const getCurrentPosition = vi.fn(() => {
      // Capture the menu as it stood at the moment the browser would prompt.
      const id = nearMeButton()?.getAttribute("aria-describedby");
      describedWhenAsked = id ? document.getElementById(id)?.textContent : null;
    });
    Object.defineProperty(navigator, "geolocation", {
      configurable: true,
      value: { getCurrentPosition },
    });
    await render();
    await openMenu();

    const button = nearMeButton();
    const labelId = button.getAttribute("aria-labelledby")!;
    const benefitId = button.getAttribute("aria-describedby")!;
    expect(document.getElementById(labelId)?.textContent).toBe("Near me");
    expect(document.getElementById(benefitId)?.textContent).toBe(NEAR_ME_BENEFIT);
    // The sentence lives inside the row, so the whole row stays the target.
    expect(button.contains(document.getElementById(benefitId))).toBe(true);
    expect(button.className).toContain("min-h-[44px]");

    await act(async () => button.click());

    expect(getCurrentPosition).toHaveBeenCalledOnce();
    expect(describedWhenAsked).toBe(NEAR_ME_BENEFIT);
  });

  it("drops the sentence once a fix is in hand and no prompt can follow", async () => {
    window.sessionStorage.setItem(
      "fr_geo_v1",
      JSON.stringify({
        lng: -77.4105,
        lat: 39.4143,
        accuracy: 18,
        timestamp: Date.now(),
      }),
    );
    await render();
    await openMenu();

    expect(nearMeButton().hasAttribute("aria-describedby")).toBe(false);
    expect(container.querySelector("[data-near-me-benefit]")).toBeNull();
  });
});
