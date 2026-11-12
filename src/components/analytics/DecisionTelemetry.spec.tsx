// @vitest-environment jsdom

import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { trackDecision } = vi.hoisted(() => ({ trackDecision: vi.fn() }));

let pathname = "/today";

vi.mock("next/navigation", () => ({
  usePathname: () => pathname,
}));

vi.mock("@/lib/decision/telemetry", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/decision/telemetry")>()),
  trackDecision,
}));

import DecisionTelemetryObserver from "./DecisionTelemetry";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

/**
 * A minimal IntersectionObserver that only reports elements it is currently
 * observing, so an unobserved card stays invisible to telemetry exactly as it
 * does in a browser.
 */
class FakeIntersectionObserver {
  static instances: FakeIntersectionObserver[] = [];
  readonly targets = new Set<Element>();

  constructor(private readonly callback: IntersectionObserverCallback) {
    FakeIntersectionObserver.instances.push(this);
  }

  observe(target: Element) {
    this.targets.add(target);
  }

  unobserve(target: Element) {
    this.targets.delete(target);
  }

  disconnect() {
    this.targets.clear();
  }

  takeRecords(): IntersectionObserverEntry[] {
    return [];
  }

  static showAll(element: Element) {
    for (const instance of FakeIntersectionObserver.instances) {
      if (!instance.targets.has(element)) continue;
      instance.callback(
        [
          {
            target: element,
            isIntersecting: true,
            intersectionRatio: 1,
          } as unknown as IntersectionObserverEntry,
        ],
        instance as unknown as IntersectionObserver,
      );
    }
  }
}

describe("DecisionTelemetryObserver", () => {
  let container: HTMLDivElement;
  let card: HTMLDivElement;
  let root: Root;

  beforeEach(async () => {
    trackDecision.mockClear();
    FakeIntersectionObserver.instances = [];
    vi.stubGlobal("IntersectionObserver", FakeIntersectionObserver);
    pathname = "/today";
    window.history.replaceState(null, "", "/today");

    // The card lives outside the React tree, like a card a shared layout keeps
    // mounted across a client navigation.
    card = document.createElement("div");
    card.dataset.decisionImpression = "true";
    card.dataset.decisionSurface = "today";
    card.dataset.decisionEntity = "place";
    card.dataset.decisionId = "baker-park";
    card.dataset.decisionPosition = "result";
    document.body.append(card);

    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    await act(async () => {
      root.render(createElement(DecisionTelemetryObserver));
    });
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    card.remove();
    vi.unstubAllGlobals();
  });

  it("counts a card that stays mounted again on the next page", async () => {
    FakeIntersectionObserver.showAll(card);
    expect(trackDecision).toHaveBeenCalledTimes(1);

    // Seen again on the same page: still one impression.
    FakeIntersectionObserver.showAll(card);
    expect(trackDecision).toHaveBeenCalledTimes(1);

    pathname = "/events";
    window.history.pushState(null, "", "/events");
    await act(async () => {
      root.render(createElement(DecisionTelemetryObserver));
    });

    FakeIntersectionObserver.showAll(card);
    expect(trackDecision).toHaveBeenCalledTimes(2);
    expect(trackDecision).toHaveBeenLastCalledWith(
      expect.objectContaining({
        stage: "impression",
        surface: "today",
        entityKind: "place",
        entityId: "baker-park",
        position: "result",
      }),
    );
  });
});
