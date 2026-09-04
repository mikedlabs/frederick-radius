// @vitest-environment jsdom

import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import {
  createFairPlan,
  writeFairPlan,
  type FairPlan,
} from "@/lib/fair/plan";
import { TODAY_FAIR_PROMOTION_HREF } from "@/lib/today/fair-promotion";

import TodayFairFeature from "./TodayFairFeature";

describe("TodayFairFeature", () => {
  it("makes the planning workspace the single photographic action", () => {
    const html = renderToStaticMarkup(
      createElement(TodayFairFeature, { phase: "planning" }),
    );

    expect(html).toContain("Your Fair Day planner is ready.");
    expect(html).toContain("tickets, parking, transit");
    expect(html).toContain("Plan your Fair day");
    expect(html).toContain(`href="${TODAY_FAIR_PROMOTION_HREF}"`);
    expect(html).toContain("fairgrounds-night-mike-d-960.jpg");
    expect(html).toContain("fairgrounds-night-mike-d-1920.jpg");
    expect(html).toContain('alt=""');
    expect(html).not.toContain("Photo: Mike D");
    expect(html).toContain('data-fair-feature-tone="light"');
    expect(html).toContain("data-fair-feature-art");
    expect(html).toContain("data-fair-feature-icon");
    expect(html).toContain('aria-hidden="true"');
    expect(html).not.toContain("bg-[var(--app-bedrock)]");
    expect(html.match(/<a\b/g)).toHaveLength(1);
    expect(html).not.toContain(String.fromCharCode(8212));
  });

  it("changes to useful same-day language once the Fair opens", () => {
    const html = renderToStaticMarkup(
      createElement(TodayFairFeature, { phase: "fair-day" }),
    );

    expect(html).toContain("Make today at the Fair easier.");
    expect(html).toContain("Through Sep 26");
    expect(html).toContain("find food and rides");
    expect(html).toContain("Open Fair Day");
  });

  it("continues the saved on-device plan with its one next action", async () => {
    const savedPlan: FairPlan = {
      ...createFairPlan({
        fairId: "great-frederick-fair-2026",
        packRevision: `sha256:${"b".repeat(64)}`,
        selectedDayId: "day-2026-09-18",
        now: "2026-09-02T12:00:00Z",
      }),
      arrivalChoice: "drive",
      party: {
        adults11Plus: 2,
        children10Under: 2,
        adultRiders: 1,
        childRiders: 1,
      },
      readyKeys: ["ticket"],
      steps: [
        {
          scheduleItemId: "schedule-2026-09-18-horse-pull",
          dayId: "day-2026-09-18",
          labelSnapshot: "Horse pull",
          timeLabelSnapshot: "7:00 PM",
          sourceState: "current",
        },
      ],
    };
    const storedValues = new Map<string, string>();
    const storage = {
      getItem: (key: string) => storedValues.get(key) ?? null,
      setItem: (key: string, value: string) =>
        void storedValues.set(key, value),
      removeItem: (key: string) => void storedValues.delete(key),
    };
    Object.defineProperty(window, "localStorage", {
      configurable: true,
      value: storage,
    });
    expect(writeFairPlan(storage, savedPlan)).toBe(true);
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(createElement(TodayFairFeature, { phase: "planning" }));
    });

    expect(container.textContent).toContain("Your Fair day is taking shape.");
    expect(container.textContent).toContain(
      "plan for 4 people has 1 saved stop",
    );
    expect(container.textContent).toContain("Finish travel plan");
    expect(container.querySelector("a")?.getAttribute("href")).toBe(
      "/moments/great-frederick-fair-2026#travel",
    );
    expect(
      container
        .querySelector("[data-today-fair-feature]")
        ?.getAttribute("data-today-fair-plan"),
    ).toBe("saved");

    await act(async () => root.unmount());
    container.remove();
  });

  it("keeps the default Fair action when browser storage is unavailable", async () => {
    const originalStorage = Object.getOwnPropertyDescriptor(
      window,
      "localStorage",
    );
    Object.defineProperty(window, "localStorage", {
      configurable: true,
      get() {
        throw new DOMException("Storage is disabled", "SecurityError");
      },
    });
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);

    try {
      await act(async () => {
        root.render(createElement(TodayFairFeature, { phase: "planning" }));
      });

      expect(container.textContent).toContain(
        "Your Fair Day planner is ready.",
      );
      expect(container.textContent).toContain("Plan your Fair day");
      expect(
        container
          .querySelector("[data-today-fair-feature]")
          ?.getAttribute("data-today-fair-plan"),
      ).toBe("new");
    } finally {
      await act(async () => root.unmount());
      container.remove();
      if (originalStorage) {
        Object.defineProperty(window, "localStorage", originalStorage);
      } else {
        Reflect.deleteProperty(window, "localStorage");
      }
    }
  });
});
