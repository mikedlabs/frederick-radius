// @vitest-environment jsdom

import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  greatFrederickFair2026Pack,
  greatFrederickFair2026PackPointer,
} from "@/data/fair/great-frederick-fair-2026-pack";
import {
  FAIR_PLAN_STORAGE_KEY,
  setFairPlanParty,
} from "@/lib/fair/plan";

import FairDayWorkspace from "./FairDayWorkspace";
import { buildFairDayWorkspaceData } from "./buildFairDayWorkspaceData";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

describe("FairDayWorkspace live ticket cutoffs", () => {
  let container: HTMLDivElement;
  let root: Root;
  let storedValues: Map<string, string>;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-18T20:59:00Z"));
    storedValues = new Map<string, string>();
    Object.defineProperty(window, "localStorage", {
      configurable: true,
      value: {
        getItem: (key: string) => storedValues.get(key) ?? null,
        setItem: (key: string, value: string) =>
          void storedValues.set(key, value),
        removeItem: (key: string) => void storedValues.delete(key),
      },
    });
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    vi.useRealTimers();
  });

  it("replaces the $8 tier when an open tab crosses its known cutoff", async () => {
    const data = buildFairDayWorkspaceData(
      greatFrederickFair2026Pack,
      greatFrederickFair2026PackPointer,
      new Date("2026-09-18T20:59:00Z"),
    );
    const partyPlan = setFairPlanParty(
      data.initialPlan,
      {
        adults11Plus: 1,
        children10Under: 0,
        adultRiders: 0,
        childRiders: 0,
      },
      "2026-09-18T20:59:00Z",
    );

    await act(async () => {
      root.render(
        createElement(FairDayWorkspace, {
          data: { ...data, initialPlan: partyPlan },
        }),
      );
    });

    const combination = () =>
      container.querySelector('[aria-label="Reviewed party ticket combination"]')
        ?.textContent ?? "";
    const offerChoices = () =>
      container.querySelector('[aria-label="Official ticket and deal options"]')
        ?.textContent ?? "";
    expect(combination()).toContain("1 × First Friday advance admission$8");
    expect(offerChoices()).toContain("First Friday advance admission");

    await act(async () => {
      await vi.advanceTimersByTimeAsync(61_000);
    });

    expect(combination()).not.toContain("First Friday advance admission");
    expect(combination()).toContain("1 × Adult admission online$10");
    expect(offerChoices()).not.toContain("First Friday advance admission");
    expect(offerChoices()).not.toContain("$35 Jack Pass");
  });

  it("withdraws the conditional Carload result at its known cutoff", async () => {
    vi.setSystemTime(new Date("2026-09-22T22:59:00Z"));
    const data = buildFairDayWorkspaceData(
      greatFrederickFair2026Pack,
      greatFrederickFair2026PackPointer,
      new Date("2026-09-22T22:59:00Z"),
    );
    const partyPlan = setFairPlanParty(
      data.initialPlan,
      {
        adults11Plus: 2,
        children10Under: 0,
        adultRiders: 2,
        childRiders: 0,
      },
      "2026-09-22T22:59:00Z",
    );

    await act(async () => {
      root.render(
        createElement(FairDayWorkspace, {
          data: { ...data, initialPlan: partyPlan },
        }),
      );
    });

    expect(container.textContent).toContain(
      "Conditional lowest reviewed listed subtotal",
    );
    expect(container.textContent).toContain("$60");

    await act(async () => {
      await vi.advanceTimersByTimeAsync(61_000);
    });

    expect(container.textContent).toContain(
      "No reviewed option fully covers this party for the selected date.",
    );
    expect(container.textContent).not.toContain(
      "Conditional lowest reviewed listed subtotal",
    );
  });

  it("persists all four counts and restores them after a remount", async () => {
    const data = buildFairDayWorkspaceData(
      greatFrederickFair2026Pack,
      greatFrederickFair2026PackPointer,
      new Date("2026-09-18T20:59:00Z"),
    );
    await act(async () => {
      root.render(createElement(FairDayWorkspace, { data }));
    });

    const compareTickets = Array.from(
      container.querySelectorAll<HTMLButtonElement>("button"),
    ).find((candidate) => candidate.textContent?.includes("Compare ticket options"));
    if (!compareTickets) throw new Error("Missing Compare ticket options button.");
    await act(async () => compareTickets.click());

    const changeCount = async (label: string, value: number) => {
      const input = container.querySelector<HTMLInputElement>(
        `input[aria-label="${label}"]`,
      );
      if (!input) throw new Error(`Missing ${label} input.`);
      const valueSetter = Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype,
        "value",
      )?.set;
      if (!valueSetter) throw new Error("Missing the native input value setter.");
      await act(async () => {
        valueSetter.call(input, String(value));
        input.dispatchEvent(new Event("input", { bubbles: true }));
      });
    };
    await changeCount("Adults 11+", 3);
    await changeCount("Children 10 and under", 2);
    await changeCount("Adult riders", 2);
    await changeCount("Child riders", 1);

    expect(
      JSON.parse(storedValues.get(FAIR_PLAN_STORAGE_KEY) ?? "{}").party,
    ).toEqual({
      adults11Plus: 3,
      children10Under: 2,
      adultRiders: 2,
      childRiders: 1,
    });

    await act(async () => root.unmount());
    root = createRoot(container);
    await act(async () => {
      root.render(createElement(FairDayWorkspace, { data }));
    });

    expect(
      container.querySelector<HTMLInputElement>('input[aria-label="Adults 11+"]')
        ?.value,
    ).toBe("3");
    expect(
      container.querySelector<HTMLInputElement>(
        'input[aria-label="Children 10 and under"]',
      )?.value,
    ).toBe("2");
    expect(
      container.querySelector<HTMLInputElement>(
        'input[aria-label="Adult riders"]',
      )?.value,
    ).toBe("2");
    expect(
      container.querySelector<HTMLInputElement>(
        'input[aria-label="Child riders"]',
      )?.value,
    ).toBe("1");
  });

  it("persists readiness and advances to the next useful step", async () => {
    const data = buildFairDayWorkspaceData(
      greatFrederickFair2026Pack,
      greatFrederickFair2026PackPointer,
      new Date("2026-09-18T20:59:00Z"),
    );
    await act(async () => {
      root.render(createElement(FairDayWorkspace, { data }));
    });

    const ticketsHandled = Array.from(
      container.querySelectorAll<HTMLButtonElement>("button"),
    ).find((candidate) => candidate.textContent?.includes("Tickets are handled"));
    if (!ticketsHandled) throw new Error("Missing Tickets are handled button.");

    await act(async () => ticketsHandled.click());

    expect(container.textContent).toContain("Choose how you plan to arrive.");
    expect(
      JSON.parse(storedValues.get(FAIR_PLAN_STORAGE_KEY) ?? "{}").readyKeys,
    ).toEqual(["ticket"]);

    await act(async () => root.unmount());
    root = createRoot(container);
    await act(async () => {
      root.render(createElement(FairDayWorkspace, { data }));
    });

    expect(container.textContent).toContain("1 of 4 ready");
    expect(
      container.querySelector<HTMLButtonElement>(
        'button[aria-label="1. Ticket or deal, ready"]',
      ),
    ).not.toBeNull();
  });

  it("moves keyboard focus to the section heading from the mobile dock", async () => {
    const data = buildFairDayWorkspaceData(
      greatFrederickFair2026Pack,
      greatFrederickFair2026PackPointer,
      new Date("2026-09-18T20:59:00Z"),
    );
    await act(async () => {
      root.render(createElement(FairDayWorkspace, { data }));
    });

    const destinations = [
      ["now", "fair-ready-heading"],
      ["find", "fair-find-heading"],
      ["plan", "fair-plan-heading"],
      ["leave", "fair-leave-heading"],
    ] as const;
    for (const [sectionId, headingId] of destinations) {
      const link = container.querySelector<HTMLAnchorElement>(
        `[data-mobile-action-bar] a[href="#${sectionId}"]`,
      );
      if (!link) throw new Error(`Missing the ${sectionId} dock link.`);
      await act(async () => link.click());
      await act(async () => {
        await vi.advanceTimersByTimeAsync(20);
      });
      expect(document.activeElement?.id).toBe(headingId);
      expect(container.querySelector(`#${headingId}`)?.getAttribute("tabindex")).toBe(
        "-1",
      );
    }
  });
});
