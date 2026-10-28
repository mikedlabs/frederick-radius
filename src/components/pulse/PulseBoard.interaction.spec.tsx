// @vitest-environment jsdom
import { act, createElement, type RefObject } from "react";
import { hydrateRoot, type Root } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import PulseBoard, { type PulseHero, type PulseHeroChip, type PulseTile } from "./PulseBoard";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("@/lib/track", () => ({ track: vi.fn() }));
// The canonical Sheet has real browser focus/Back coverage. This controlled
// double observes whether this board opens exactly one requested detail.
vi.mock("@/components/ui/Sheet", () => ({
  default: ({ open, title, focusReturnHref, returnFocusRef }: { open: boolean; title: string; focusReturnHref?: string; returnFocusRef?: RefObject<HTMLElement | null> }) => open
    ? createElement("section", { role: "dialog", "aria-label": title, "data-focus-return": focusReturnHref, "data-focus-opener": returnFocusRef?.current?.id }, title)
    : null,
}));
(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

const base: PulseTile = {
  key: "weather", label: "Weather", iconName: "CloudSun",
  sourceLabel: "NWS · weather.gov", countLabel: "Partly cloudy",
  accent: "var(--app-cool)", active: false, attention: false,
  reading: true, kind: "feature",
  feature: { temp: 72, condition: "Partly cloudy" }, body: null,
};
const hero: PulseHero = {
  allClear: false, tone: "danger", leadKey: "alerts",
  line: "A warning is in effect.", sub: "Open the official warning for details.",
  renderedAt: Date.now(), actionLabel: "Read the warning",
};
const chips: PulseHeroChip[] = [{ tone: "warning", key: "river-alert", label: "River advisory" }];
const tiles: PulseTile[] = [
  base,
  { ...base, key: "alerts", label: "Official alerts", kind: "status", feature: undefined, reading: false, active: true, attention: true },
  { ...base, key: "river-alert", label: "River advisory", kind: "status", feature: undefined, reading: false, active: true, attention: true },
  { ...base, key: "traffic", label: "Traffic", kind: "status", feature: undefined, reading: false, attention: true },
  { ...base, key: "roadwork", label: "Roadwork", kind: "status", feature: undefined, reading: false, active: true },
  { ...base, key: "power", label: "Power", kind: "status", feature: undefined, reading: false, degraded: true, availability: "unavailable" },
];
let container: HTMLDivElement;
let root: Root | undefined;
function element() { return createElement(PulseBoard, { hero, chips, tiles }); }
function serverMarkup() { container.innerHTML = renderToString(element()); }
async function hydrate() {
  await act(async () => { root = hydrateRoot(container, element()); });
}
beforeEach(() => {
  window.history.replaceState({}, "", "/pulse?in=county");
  window.localStorage.clear();
  container = document.createElement("div");
  document.body.append(container);
});
afterEach(async () => {
  if (root) await act(async () => root?.unmount());
  root = undefined;
  container.remove();
  window.history.replaceState({}, "", "/");
});

describe("Pulse cold-hydration readiness", () => {
  it("keeps every detail trigger disabled until mount and initial URL synchronization", async () => {
    serverMarkup();
    expect(container.querySelector("[data-pulse-briefing]")?.getAttribute("data-pulse-interaction-ready")).toBe("false");
    const buttons = [...container.querySelectorAll("button")];
    expect(buttons).toHaveLength(6);
    expect(buttons.every((button) => button.disabled)).toBe(true);
    // A pre-hydration click cannot imply a navigation which never happened.
    container.querySelector<HTMLButtonElement>('[data-pulse-key="weather"]')?.click();
    expect(window.location.search).toBe("?in=county");
    await hydrate();
    expect(container.querySelector("[data-pulse-briefing]")?.getAttribute("data-pulse-interaction-ready")).toBe("true");
    expect([...container.querySelectorAll("button")].every((button) => !button.disabled)).toBe(true);
  });

  it("opens the intended detail after readiness and consumes Back without losing scope", async () => {
    serverMarkup();
    await hydrate();
    await act(async () => {
      container.querySelector<HTMLButtonElement>('[data-pulse-key="weather"]')?.click();
    });
    expect(window.location.search).toBe("?in=county&open=weather");
    expect(container.querySelectorAll('[role="dialog"]')).toHaveLength(1);
    expect(container.querySelector('[role="dialog"]')?.getAttribute("aria-label")).toBe("Weather");
    expect(container.querySelector('[role="dialog"]')?.getAttribute("data-focus-return")).toBe("/pulse?in=county");
    await act(async () => {
      // Match the location and popstate delivered by native browser Back.
      window.history.replaceState({}, "", "/pulse?in=county");
      window.dispatchEvent(new PopStateEvent("popstate"));
    });
    expect(container.querySelector('[role="dialog"]')).toBeNull();
    expect(window.location.search).toBe("?in=county");
  });

  it("honors a direct detail URL during initialization instead of replacing its scope", async () => {
    window.history.replaceState({}, "", "/pulse?in=brunswick&open=weather");
    serverMarkup();
    expect(container.querySelector('[role="dialog"]')).toBeNull();
    await hydrate();
    expect(container.querySelectorAll('[role="dialog"]')).toHaveLength(1);
    expect(container.querySelector('[role="dialog"]')?.getAttribute("aria-label")).toBe("Weather");
    expect(window.location.search).toBe("?in=brunswick&open=weather");
    expect(container.querySelector('[role="dialog"]')?.getAttribute("data-focus-return")).toBe("/pulse?in=brunswick");
  });

  it("freezes the exact ordinary origin across tile switches while preserving every query and hash", async () => {
    const origin = "/pulse?in=brunswick&view=morning&query=parks%20nearby#source-status";
    window.history.replaceState({}, "", origin);
    serverMarkup(); await hydrate();
    await act(async () => { container.querySelector<HTMLButtonElement>('[data-pulse-key="weather"]')?.click(); });
    expect(container.querySelector('[role="dialog"]')?.getAttribute("data-focus-return")).toBe(origin);
    await act(async () => { root?.render(createElement(PulseBoard, { hero, chips, tiles: [...tiles] })); });
    expect(container.querySelector('[role="dialog"]')?.getAttribute("data-focus-return")).toBe(origin);
    await act(async () => { container.querySelector<HTMLButtonElement>('[data-pulse-key="power"]')?.click(); });
    expect(new URL(window.location.href).searchParams.get("open")).toBe("power");
    expect(container.querySelector('[role="dialog"]')?.getAttribute("data-focus-return")).toBe(origin);
  });

  it("deletes only its owned parameter for a direct detail link", async () => {
    window.history.replaceState({}, "", "/pulse?in=brunswick&view=morning&open=weather&query=parks%20nearby#source-status");
    serverMarkup(); await hydrate();
    expect(container.querySelector('[role="dialog"]')?.getAttribute("data-focus-return")).toBe(
      "/pulse?in=brunswick&view=morning&query=parks+nearby#source-status",
    );
    expect(container.querySelector('[role="dialog"]')?.getAttribute("data-focus-opener")).toBeNull();
  });

  it("retains each actual pointer launcher even when clicking does not move browser focus", async () => {
    serverMarkup(); await hydrate();
    const prior = document.createElement("a"); prior.href = "/today"; document.body.append(prior);
    try {
      const launchers = [...container.querySelectorAll<HTMLButtonElement>("button")];
      expect(launchers).toHaveLength(6);
      for (const [index, launcher] of launchers.entries()) {
        launcher.id = `pulse-pointer-${index}`;
        prior.focus(); expect(document.activeElement).toBe(prior);
        // HTMLElement.click, like WebKit's pointer button click, does not
        // move focus. The launcher identity must come from currentTarget.
        await act(async () => launcher.click());
        expect(document.activeElement).toBe(prior);
        expect(container.querySelector('[role="dialog"]')?.getAttribute("data-focus-opener")).toBe(launcher.id);
      }
    } finally { prior.remove(); }
  });
});
