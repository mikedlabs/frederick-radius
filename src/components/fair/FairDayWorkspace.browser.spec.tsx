// @vitest-environment jsdom

import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const feedbackMocks = vi.hoisted(() => ({
  haptic: vi.fn(),
  toast: vi.fn(),
  toastSuccess: vi.fn(),
}));

vi.mock("@/lib/haptics", () => ({ haptic: feedbackMocks.haptic }));
vi.mock("sonner", () => ({
  toast: Object.assign(feedbackMocks.toast, {
    success: feedbackMocks.toastSuccess,
  }),
}));

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

function buttonWithText(
  root: ParentNode,
  text: string,
): HTMLButtonElement {
  const button = Array.from(root.querySelectorAll<HTMLButtonElement>("button")).find(
    (candidate) => candidate.textContent?.includes(text),
  );
  if (!button) throw new Error(`Missing button containing “${text}”.`);
  return button;
}

describe("FairDayWorkspace app journey", () => {
  let container: HTMLDivElement;
  let root: Root;
  let storedValues: Map<string, string>;
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-18T20:59:00Z"));
    vi.stubGlobal(
      "requestAnimationFrame",
      (callback: FrameRequestCallback) =>
        window.setTimeout(() => callback(Date.now()), 0),
    );
    vi.stubGlobal("cancelAnimationFrame", (handle: number) =>
      window.clearTimeout(handle),
    );
    feedbackMocks.haptic.mockReset();
    feedbackMocks.toast.mockReset();
    feedbackMocks.toastSuccess.mockReset();
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
    Object.defineProperty(window, "scrollTo", {
      configurable: true,
      value: vi.fn(),
    });
    fetchMock = vi.fn(async () =>
      new Response(
        JSON.stringify({
          schemaVersion: 1,
          generatedAt: "2026-09-18T20:59:00.000Z",
          state: "no-current-update",
          coverage: "configured-sources-current",
          headline:
            "No major arrival update is published in the feeds Radius checked.",
          summary:
            "This describes only the official feeds Radius checked. It is not an all-clear.",
          signals: [],
          hiddenSignalCount: 0,
          sources: [],
          transit: null,
          limitsLabel:
            "Official feeds do not measure Fair attendance, parking-space availability, or gate waits.",
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);
    window.history.replaceState(
      {},
      "",
      "/moments/great-frederick-fair-2026#now",
    );
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    document.body.querySelectorAll("[data-vaul-drawer]").forEach((node) => node.remove());
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  async function renderFair(
    data = buildFairDayWorkspaceData(
      greatFrederickFair2026Pack,
      greatFrederickFair2026PackPointer,
      new Date("2026-09-18T20:59:00Z"),
    ),
  ) {
    await act(async () => {
      root.render(createElement(FairDayWorkspace, { data }));
    });
    return data;
  }

  async function openMode(label: "Home" | "Program" | "Map" | "My Day") {
    const button = container.querySelector<HTMLButtonElement>(
      `[data-mobile-action-bar] button[aria-label^="${label}"]`,
    );
    if (!button) throw new Error(`Missing ${label} mode button.`);
    await act(async () => button.click());
    await act(async () => vi.advanceTimersByTimeAsync(20));
  }

  async function openFullProgram() {
    await openMode("Program");
    await act(async () => vi.advanceTimersByTimeAsync(20));
  }

  async function openTravel() {
    await openMode("My Day");
    await act(async () =>
      buttonWithText(container, "Getting there").click(),
    );
    await act(async () => vi.advanceTimersByTimeAsync(20));
  }

  function openDialogs(): HTMLElement[] {
    return Array.from(
      document.body.querySelectorAll<HTMLElement>(
        '[role="dialog"][data-state="open"]',
      ),
    );
  }

  async function replayHistoryDestination(hash: string) {
    window.history.replaceState(
      {},
      "",
      `/moments/great-frederick-fair-2026${hash}`,
    );
    await act(async () => window.dispatchEvent(new Event("popstate")));
    await act(async () => vi.advanceTimersByTimeAsync(20));
  }

  async function chooseDate(value: string) {
    const picker = container.querySelector<HTMLSelectElement>("select");
    if (!picker) throw new Error("Missing Fair day picker.");
    const valueSetter = Object.getOwnPropertyDescriptor(
      window.HTMLSelectElement.prototype,
      "value",
    )?.set;
    if (!valueSetter) throw new Error("Missing native select value setter.");
    await act(async () => {
      valueSetter.call(picker, value);
      picker.dispatchEvent(new Event("change", { bubbles: true }));
    });
  }

  it("keeps Fair header navigation visually quiet and accessibly named", async () => {
    await renderFair();

    const radiusBack = container.querySelector<HTMLAnchorElement>(
      'a[aria-label="Back to Frederick Radius"]',
    );
    const heroHelp = container.querySelector<HTMLButtonElement>(
      'button[aria-label="Help & access"]',
    );
    expect(radiusBack?.textContent?.trim()).toBe("");
    expect(heroHelp?.textContent?.trim()).toBe("");

    await openMode("Program");
    const fairBack = container.querySelector<HTMLButtonElement>(
      'button[aria-label="Back to Fair Today"]',
    );
    expect(fairBack?.textContent?.trim()).toBe("");

    await openMode("Map");
    const mapBack = container.querySelector<HTMLButtonElement>(
      'button[aria-label="Back to Fair Today"]',
    );
    const mapHelp = container.querySelector<HTMLButtonElement>(
      'button[aria-label="Help & access"]',
    );
    expect(mapBack?.textContent?.trim()).toBe("");
    expect(mapHelp?.textContent?.trim()).toBe("");
  });

  it("keeps live and scheduled Fair essentials truthful as the selected day changes", async () => {
    await renderFair();

    const board = container.querySelector<HTMLElement>(
      "[data-fair-at-a-glance]",
    );
    expect(board).not.toBeNull();
    expect(
      board?.querySelectorAll("[data-fair-glance-tile]").length,
    ).toBe(3);
    expect(
      board?.querySelector('[data-fair-glance-tile="gate"]')?.textContent,
    ).toContain("Open now");
    expect(
      board?.querySelector('[data-fair-glance-tile="gate"]')?.textContent,
    ).toContain("Closes 10 p.m.");
    expect(
      board?.querySelector('[data-fair-glance-tile="admission"]')?.textContent,
    ).toContain("$10 online · $15 gate");
    expect(
      board?.querySelector('[data-fair-glance-tile="parking"]')?.textContent,
    ).toContain("$10 cash lots");

    await chooseDate("2026-09-19");

    expect(board?.textContent).toContain("Saturday at a glance");
    expect(
      board?.querySelector('[data-fair-glance-tile="gate"]')?.textContent,
    ).toContain("9 a.m.–10 p.m.");
    expect(
      board?.querySelector('[data-fair-glance-tile="admission"]')?.textContent,
    ).toContain("$10 online · $15 gate");
    expect(board?.textContent).not.toContain("$8 first Friday");
  });

  it("switches real panels, updates the URL, and focuses the new heading", async () => {
    await renderFair();

    expect(container.querySelector("#fair-now-heading")).not.toBeNull();
    expect(container.querySelector("#fair-find-heading")).toBeNull();

    await openMode("Program");

    expect(window.location.hash).toBe("#program");
    expect(container.querySelector("#fair-now-heading")).toBeNull();
    expect(container.querySelector("#fair-find-heading")).not.toBeNull();
    expect(document.activeElement?.id).toBe("fair-find-heading");
    expect(window.scrollTo).toHaveBeenCalledWith({ top: 0, behavior: "auto" });

    await openMode("My Day");
    expect(container.querySelector("#fair-find-heading")).toBeNull();
    expect(document.activeElement?.id).toBe("fair-my-day-heading");

    await openMode("Map");
    expect(container.querySelector("#fair-my-day-heading")).toBeNull();
    expect(document.activeElement?.id).toBe("fair-grounds-map-heading");
  });

  it("restores Fair modes through browser history", async () => {
    await renderFair();
    await openMode("Program");
    await openMode("My Day");

    expect(window.location.hash).toBe("#my-day");
    await act(async () => {
      window.history.back();
      await vi.advanceTimersByTimeAsync(20);
    });
    expect(window.location.hash).toBe("#program");
    expect(container.querySelector("#fair-find-heading")).not.toBeNull();

    await act(async () => {
      window.history.forward();
      await vi.advanceTimersByTimeAsync(20);
    });
    expect(window.location.hash).toBe("#my-day");
    expect(container.querySelector("#fair-my-day-heading")).not.toBeNull();
  });

  it("waits for Travel before checking live sources and defers transit until selected", async () => {
    await renderFair();

    expect(fetchMock).not.toHaveBeenCalled();
    await openTravel();
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/fair/arrival-status?date=2026-09-18&mode=overview",
      expect.objectContaining({ cache: "no-store" }),
    );

    fetchMock.mockClear();
    const transit = container.querySelector<HTMLInputElement>(
      'input[value="arrival-transit-context"]',
    );
    if (!transit) throw new Error("Missing County Transit option.");
    await act(async () => transit.click());
    await act(async () => vi.advanceTimersByTimeAsync(0));

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/fair/arrival-status?date=2026-09-18&mode=transit",
      expect.objectContaining({ cache: "no-store" }),
    );
  });

  it("opens an original #plan link in My Day and replaces it with the canonical hash", async () => {
    window.history.replaceState(
      {},
      "",
      "/moments/great-frederick-fair-2026#plan",
    );

    await renderFair();
    await act(async () => vi.advanceTimersByTimeAsync(20));

    expect(container.querySelector("#fair-my-day-heading")).not.toBeNull();
    expect(container.querySelector("#fair-now-heading")).toBeNull();
    expect(window.location.hash).toBe("#my-day");
  });

  it("sorts program rows by time, removes ticket utility rows, and exposes EventHub in Program", async () => {
    const data = await renderFair();
    await openFullProgram();

    const results = container.querySelectorAll<HTMLOListElement>(
      "[data-fair-program-trail]",
    );
    if (results.length === 0) throw new Error("Missing Fair program results.");
    const text = Array.from(results)
      .map((result) => result.textContent ?? "")
      .join(" ");

    expect(
      container.querySelectorAll("[data-fair-program-daypart]").length,
    ).toBeGreaterThan(1);
    expect(text).not.toContain("DEADLINE to purchase");
    expect(text.indexOf("Daughtry")).toBeLessThan(
      text.indexOf("2026 Agricultural Awards Ceremony"),
    );
    const vendorSearch = container.querySelector<HTMLAnchorElement>(
      '[data-fair-vendor-search]',
    );
    expect(vendorSearch?.href).toBe(data.externalGuide.url);
    expect(vendorSearch?.target).toBe("_blank");
    expect(vendorSearch?.rel).toBe("noopener noreferrer");
    expect(container.textContent).toContain("sorted by time");

    await openMode("Map");
    expect(container.querySelector<HTMLAnchorElement>(`a[href="${data.externalGuide.url}"]`)).not.toBeNull();
  });

  it("hands an unmatched Fair search to the live official vendor directory", async () => {
    await renderFair();
    await openFullProgram();

    const search = container.querySelector<HTMLInputElement>(
      "#fair-unified-search",
    );
    if (!search) throw new Error("Missing Fair program search.");
    const valueSetter = Object.getOwnPropertyDescriptor(
      window.HTMLInputElement.prototype,
      "value",
    )?.set;
    if (!valueSetter) throw new Error("Missing native input value setter.");
    await act(async () => {
      valueSetter.call(search, "Rad Pies");
      search.dispatchEvent(new Event("input", { bubbles: true }));
    });

    const handoff = container.querySelector<HTMLAnchorElement>(
      "[data-fair-program-vendor-result]",
    );
    expect(handoff?.href).toBe(
      "https://mobile.eventhub-floorplan.net/exhibitors-g2app.php?Show_ID=18209&q=Rad+Pies",
    );
    expect(handoff?.target).toBe("_blank");
    expect(handoff?.rel).toBe("noopener noreferrer");
    expect(container.textContent).toContain(
      "Radius does not guess a temporary booth pin or route.",
    );
  });

  it("shows the full day immediately with one consistent category system", async () => {
    const data = await renderFair();
    await openMode("Program");
    expect(container.querySelector("[data-fair-program-trail]")).not.toBeNull();
    expect(container.textContent).not.toContain("Browse full program");
    expect(container.textContent).not.toContain("More filters");
    expect(container.querySelectorAll("[data-fair-program-filter]")).toHaveLength(8);
    expect(container.querySelector('[aria-label="Search official vendor booths"]')).not.toBeNull();

    await act(async () => buttonWithText(container, "Animals").click());
    const results = container.querySelector('[aria-label="Fair program results"]');
    expect(results).not.toBeNull();
    for (const item of data.scheduleItems.filter((item) => item.date === "2026-09-18" && item.kind === "animal")) {
      expect(results?.textContent).toContain(item.title);
    }
    expect(results?.textContent).not.toContain("2026 Agricultural Awards Ceremony");
    expect(container.querySelector('[data-fair-program-filter="animals"]')?.getAttribute("aria-pressed")).toBe("true");
    await openMode("My Day");
    await openMode("Program");
    expect(container.querySelector('[data-fair-program-filter="animals"]')?.getAttribute("aria-pressed")).toBe("true");
    await chooseDate("2026-09-20");
    expect(container.querySelector('[data-fair-program-filter="animals"]')?.getAttribute("aria-pressed")).toBe("true");

    await act(async () => buttonWithText(container, "Clear filters").click());
    expect(container.querySelector('[data-fair-program-filter="all"]')?.getAttribute("aria-pressed")).toBe("true");
    await act(async () => buttonWithText(container, "Food & drink").click());
    expect(container.textContent).toContain("not food stands");
    expect(container.querySelector('[aria-label="Fair program results"]')?.textContent).toContain("Homegrown Wineries");
  });

  it("opens the selected day's visual Grandstand spotlight in the existing detail flow", async () => {
    await renderFair();
    await openMode("Program");

    const spotlight = container.querySelector<HTMLButtonElement>(
      "[data-fair-grandstand-spotlight]",
    );
    if (!spotlight) throw new Error("Missing Grandstand spotlight.");
    expect(spotlight.textContent).toContain("Daughtry");
    expect(spotlight.getAttribute("aria-label")).toContain(
      "Open details for Daughtry",
    );

    await act(async () => spotlight.click());
    await act(async () => vi.advanceTimersByTimeAsync(20));

    expect(openDialogs()).toHaveLength(1);
    expect(openDialogs()[0]?.textContent).toContain("Daughtry");
    const close = document.body.querySelector<HTMLButtonElement>(
      'button[aria-label="Close Daughtry"]',
    );
    if (!close) throw new Error("Missing Daughtry close control.");
    await act(async () => close.click());
    await act(async () => vi.advanceTimersByTimeAsync(600));
    expect(openDialogs()).toHaveLength(0);
  });

  it("switches between visual discovery and the grounds map without leaving the Fair plan", async () => {
    await renderFair();
    await openMode("Program");

    expect(container.querySelector("[data-fair-program-filters]")).not.toBeNull();
    await openMode("Map");
    vi.useRealTimers();
    await act(async () => vi.dynamicImportSettled());
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-18T20:59:00Z"));

    expect(window.location.hash).toBe("#fair-map");
    expect(container.querySelector("[data-fair-program-filters]")).toBeNull();
    expect(container.textContent).toContain("The grounds map could not open.");

    await openMode("Program");
    expect(window.location.hash).toBe("#program");
    expect(container.querySelector("[data-fair-program-filters]")).not.toBeNull();
  });

  it("keeps program details honest and allows only one Fair drawer", async () => {
    await renderFair();
    await openFullProgram();

    const details = container.querySelector<HTMLButtonElement>(
      'button[aria-label^="Open details for"]',
    );
    if (!details) throw new Error("Missing a program details control.");
    await act(async () => details.click());
    await act(async () => vi.advanceTimersByTimeAsync(20));

    const add = buttonWithText(document.body, "Add to My Day");
    expect(add.getAttribute("aria-pressed")).toBe("false");
    await act(async () => add.click());
    expect(document.body.textContent).toContain("Remove from My Day");
    const remove = buttonWithText(document.body, "Remove from My Day");
    expect(remove.getAttribute("aria-pressed")).toBe("true");
    await act(async () => remove.click());
    expect(document.body.textContent).toContain("Add to My Day");

    window.history.replaceState(
      {},
      "",
      "/moments/great-frederick-fair-2026#answers",
    );
    await act(async () => window.dispatchEvent(new Event("hashchange")));
    await act(async () => vi.advanceTimersByTimeAsync(20));

    expect(
      document.body.querySelectorAll('[role="dialog"][data-state="open"]'),
    ).toHaveLength(1);
    expect(document.body.textContent).toContain("Fair help");
  });

  it.each([
    ["#answers", "Fair help"],
    ["#fair-ready-ticket", "Tickets"],
    ["#fair-ready-entry", "Entry"],
  ])(
    "keeps the %s drawer route intact across a direct load and reload",
    async (hash, title) => {
      window.history.replaceState(
        {},
        "",
        `/moments/great-frederick-fair-2026${hash}`,
      );
      const data = await renderFair();
      await act(async () => vi.advanceTimersByTimeAsync(20));

      expect(window.location.hash).toBe(hash);
      expect(openDialogs()).toHaveLength(1);
      expect(openDialogs()[0]?.textContent).toContain(title);

      await act(async () => root.unmount());
      document.body
        .querySelectorAll("[data-vaul-drawer]")
        .forEach((node) => node.remove());
      root = createRoot(container);
      await act(async () => {
        root.render(createElement(FairDayWorkspace, { data }));
      });
      await act(async () => vi.advanceTimersByTimeAsync(20));

      expect(window.location.hash).toBe(hash);
      expect(openDialogs()).toHaveLength(1);
      expect(openDialogs()[0]?.textContent).toContain(title);

      const close = document.body.querySelector<HTMLButtonElement>(
        `button[aria-label="Close ${title}"]`,
      );
      if (!close) throw new Error(`Missing close control for ${title}.`);
      await act(async () => close.click());
      await act(async () => vi.advanceTimersByTimeAsync(400));
      expect(window.location.hash).toBe("#now");
      expect(openDialogs()).toHaveLength(0);
    },
  );

  it("matches the open drawer to each browser back and forward destination", async () => {
    await renderFair();

    await replayHistoryDestination("#answers");
    expect(openDialogs()).toHaveLength(1);
    expect(openDialogs()[0]?.textContent).toContain("Fair help");

    await replayHistoryDestination("#fair-ready-ticket");
    expect(openDialogs()).toHaveLength(1);
    expect(openDialogs()[0]?.textContent).toContain("Tickets");
    expect(openDialogs()[0]?.textContent).not.toContain("Fair help");

    await replayHistoryDestination("#fair-ready-entry");
    expect(openDialogs()).toHaveLength(1);
    expect(openDialogs()[0]?.textContent).toContain("Entry");
    expect(openDialogs()[0]?.textContent).not.toContain("Tickets");

    await replayHistoryDestination("#program");
    expect(openDialogs()).toHaveLength(0);
    expect(container.querySelector("[data-fair-program-filters]")).not.toBeNull();

    await replayHistoryDestination("#fair-ready-entry");
    expect(openDialogs()).toHaveLength(1);
    expect(openDialogs()[0]?.textContent).toContain("Entry");
  });

  it("moves a mapped program event into the Fair map without offering a false action", async () => {
    await renderFair();
    await openFullProgram();

    const kidZoneDetails = container.querySelector<HTMLButtonElement>(
      'button[aria-label="Open details for Kid Zone"]',
    );
    if (!kidZoneDetails) throw new Error("Missing Kid Zone details control.");
    await act(async () => kidZoneDetails.click());
    await act(async () => vi.advanceTimersByTimeAsync(20));
    expect(
      Array.from(document.body.querySelectorAll("button, a")).some(
        (control) => control.textContent?.trim() === "Show on map",
      ),
    ).toBe(false);

    const daughtryDetails = container.querySelector<HTMLButtonElement>(
      'button[aria-label="Open details for Daughtry"]',
    );
    if (!daughtryDetails) throw new Error("Missing Daughtry details control.");
    await act(async () => daughtryDetails.click());
    await act(async () => vi.advanceTimersByTimeAsync(20));

    const showOnMap = buttonWithText(document.body, "Show on map");
    await act(async () => showOnMap.click());
    expect(window.location.hash).toBe("#fair-map");
  });

  it("refreshes the program clock at the next minute boundary", async () => {
    await renderFair();
    await openFullProgram();

    expect(container.textContent).toContain("Up next in 1 min");
    await act(async () => vi.advanceTimersByTimeAsync(61_000));
    expect(container.textContent).not.toContain("Up next in 1 min");
    expect(container.textContent).toContain("Happening now");
  });

  it("reopens the same family essential with its reviewed answer after closing Help", async () => {
    await renderFair();

    const openFamilyCare = async () => {
      const help = container.querySelector<HTMLButtonElement>(
        'button[aria-label="Help & access"]',
      );
      if (!help) throw new Error("Missing Fair help control.");
      await act(async () => help.click());
      await act(async () => vi.advanceTimersByTimeAsync(20));
      await act(async () =>
        buttonWithText(document.body, "Family Care + changing").click(),
      );
      await act(async () => vi.advanceTimersByTimeAsync(20));
      expect(document.body.textContent).toContain(
        "Where can a family handle nursing or diaper changes?",
      );
      expect(document.body.textContent).toContain(
        "every restroom also has a diaper-changing station",
      );
    };

    await openFamilyCare();
    const close = document.body.querySelector<HTMLButtonElement>(
      'button[aria-label="Close Fair help"]',
    );
    if (!close) throw new Error("Missing Fair help close button.");
    await act(async () => close.click());
    await act(async () => vi.advanceTimersByTimeAsync(400));

    await openFamilyCare();
    expect(document.body.textContent).not.toMatch(/first aid/i);
  });

  it("acknowledges a saved program result and opens My Day from the toast", async () => {
    const data = await renderFair();
    await openFullProgram();

    const addDaughtry = container.querySelector<HTMLButtonElement>(
      'button[aria-label^="Add Daughtry to My Day"]',
    );
    if (!addDaughtry) throw new Error("Missing Add Daughtry control.");
    const daughtry = data.scheduleItems.find((item) =>
      item.title.startsWith("Daughtry"),
    );
    if (!daughtry) throw new Error("Missing Daughtry schedule item.");
    expect(addDaughtry.getAttribute("aria-pressed")).toBe("false");
    await act(async () => addDaughtry.click());

    const removeDaughtry = container.querySelector<HTMLButtonElement>(
      'button[aria-label^="Remove Daughtry from My Day"]',
    );
    expect(removeDaughtry?.getAttribute("aria-pressed")).toBe("true");
    expect(feedbackMocks.haptic).toHaveBeenLastCalledWith("medium");
    expect(feedbackMocks.toastSuccess).toHaveBeenCalledWith(
      "Added to My Day",
      expect.objectContaining({
        id: "fair-plan-feedback",
        description: daughtry.title,
        duration: 5_000,
        action: expect.objectContaining({ label: "My Day" }),
        cancel: expect.objectContaining({ label: "Undo" }),
      }),
    );

    const saveOptions = feedbackMocks.toastSuccess.mock.calls[0]?.[1] as {
      action: { onClick: () => void };
    };
    await act(async () => saveOptions.action.onClick());
    await act(async () => vi.advanceTimersByTimeAsync(20));

    expect(window.location.hash).toBe("#my-day");
    expect(container.textContent).toContain("Daughtry");
    expect(
      container.querySelector('[data-mobile-action-bar] button[aria-label="My Day, 1 saved"]'),
    ).not.toBeNull();
    expect(
      JSON.parse(storedValues.get(FAIR_PLAN_STORAGE_KEY) ?? "{}").steps,
    ).toHaveLength(1);
  });

  it("keeps a blocked-storage plan usable without claiming it is saved", async () => {
    Object.defineProperty(window, "localStorage", {
      configurable: true,
      value: {
        getItem: () => null,
        setItem: () => {
          throw new DOMException("Storage is blocked", "SecurityError");
        },
        removeItem: () => undefined,
      },
    });

    await renderFair();
    await act(async () => vi.advanceTimersByTimeAsync(0));

    expect(
      container.querySelector('[data-fair-plan-storage="unavailable"]'),
    ).not.toBeNull();
    expect(container.querySelector("[data-fair-storage-warning]")?.textContent).toContain(
      "This plan is not being saved.",
    );
    expect(container.textContent).toContain(
      "reloading or closing it will clear My Day",
    );

    await openFullProgram();
    const addDaughtry = container.querySelector<HTMLButtonElement>(
      'button[aria-label^="Add Daughtry to My Day"]',
    );
    if (!addDaughtry) throw new Error("Missing Add Daughtry control.");
    await act(async () => addDaughtry.click());
    await openMode("My Day");

    expect(container.textContent).toContain("Daughtry");
    expect(container.textContent).toContain(
      "Temporary plan · keep this page open",
    );
    expect(container.textContent).not.toContain("kept on this device");
  });

  it("marks a removed saved stop as needing review and clears the warning when removed", async () => {
    const data = buildFairDayWorkspaceData(
      greatFrederickFair2026Pack,
      greatFrederickFair2026PackPointer,
      new Date("2026-09-18T20:59:00Z"),
    );
    storedValues.set(
      FAIR_PLAN_STORAGE_KEY,
      JSON.stringify({
        ...data.initialPlan,
        arrivalChoice: "drive",
        readyKeys: ["ticket", "travel", "entry"],
        steps: [
          {
            scheduleItemId: "schedule-2026-09-18-removed-show",
            dayId: "day-2026-09-18",
            labelSnapshot: "Removed show",
            timeLabelSnapshot: "7 p.m.",
            sourceState: "current",
          },
        ],
      }),
    );

    await renderFair(data);
    await act(async () => vi.advanceTimersByTimeAsync(20));

    expect(container.textContent).toContain(
      "1 saved stop needs review. Add a current Fair stop.",
    );
    await openMode("My Day");
    expect(
      container.querySelector('[aria-label="First stop: needs attention"]'),
    ).not.toBeNull();
    expect(
      container.querySelector('[data-fair-plan-source-state="needs-review"]')
        ?.textContent,
    ).toContain("Needs review");
    expect(container.textContent).toContain(
      "1 saved stop has changed in the official program",
    );

    await act(async () => buttonWithText(container, "Edit").click());
    const remove = container.querySelector<HTMLButtonElement>(
      '[aria-label="Remove Removed show from My Day"]',
    );
    if (!remove) throw new Error("Missing stale-stop remove control.");
    await act(async () => remove.click());

    expect(
      container.querySelector('[data-fair-plan-source-state="needs-review"]'),
    ).toBeNull();
    expect(container.textContent).not.toContain(
      "saved stop has changed in the official program",
    );
  });

  it("repairs an unavailable restored day so visible and saved planning stay aligned", async () => {
    const data = buildFairDayWorkspaceData(
      greatFrederickFair2026Pack,
      greatFrederickFair2026PackPointer,
      new Date("2026-09-18T20:59:00Z"),
    );
    storedValues.set(
      FAIR_PLAN_STORAGE_KEY,
      JSON.stringify({
        ...data.initialPlan,
        selectedDayId: "day-2099-01-01",
      }),
    );

    await renderFair(data);
    await act(async () => vi.advanceTimersByTimeAsync(20));

    expect(container.querySelector<HTMLSelectElement>("select")?.value).toBe(
      data.initialDate,
    );
    expect(
      JSON.parse(storedValues.get(FAIR_PLAN_STORAGE_KEY) ?? "{}").selectedDayId,
    ).toBe(`day-${data.initialDate}`);
  });

  it("undoes a save without opening another surface", async () => {
    await renderFair();
    await openFullProgram();

    const addDaughtry = container.querySelector<HTMLButtonElement>(
      'button[aria-label^="Add Daughtry to My Day"]',
    );
    if (!addDaughtry) throw new Error("Missing Add Daughtry control.");
    await act(async () => addDaughtry.click());

    const saveOptions = feedbackMocks.toastSuccess.mock.calls[0]?.[1] as {
      cancel: { onClick: () => void };
    };
    await act(async () => saveOptions.cancel.onClick());

    expect(window.location.hash).toBe("#program");
    expect(
      container.querySelector(
        'button[aria-label^="Add Daughtry to My Day"][aria-pressed="false"]',
      ),
    ).not.toBeNull();
    expect(feedbackMocks.haptic).toHaveBeenLastCalledWith("light");
    expect(
      JSON.parse(storedValues.get(FAIR_PLAN_STORAGE_KEY) ?? "{}").steps,
    ).toHaveLength(0);
  });

  it("removes a saved result in Find and restores it with Undo", async () => {
    const data = await renderFair();
    await openFullProgram();

    const addDaughtry = container.querySelector<HTMLButtonElement>(
      'button[aria-label^="Add Daughtry to My Day"]',
    );
    if (!addDaughtry) throw new Error("Missing Add Daughtry control.");
    const daughtry = data.scheduleItems.find((item) =>
      item.title.startsWith("Daughtry"),
    );
    if (!daughtry) throw new Error("Missing Daughtry schedule item.");
    await act(async () => addDaughtry.click());

    const addAwards = container.querySelector<HTMLButtonElement>(
      'button[aria-label^="Add 2026 Agricultural Awards Ceremony to My Day"]',
    );
    if (!addAwards) throw new Error("Missing Add agricultural awards control.");
    await act(async () => addAwards.click());
    const originalOrder = JSON.parse(
      storedValues.get(FAIR_PLAN_STORAGE_KEY) ?? "{}",
    ).steps.map((step: { scheduleItemId: string }) => step.scheduleItemId);
    feedbackMocks.toast.mockClear();

    const removeDaughtry = container.querySelector<HTMLButtonElement>(
      'button[aria-label^="Remove Daughtry from My Day"]',
    );
    if (!removeDaughtry) throw new Error("Missing Remove Daughtry control.");
    await act(async () => removeDaughtry.click());

    expect(feedbackMocks.toast).toHaveBeenCalledWith(
      "Removed from My Day",
      expect.objectContaining({
        id: "fair-plan-feedback",
        description: daughtry.title,
        duration: 5_000,
        action: expect.objectContaining({ label: "Undo" }),
      }),
    );
    expect(
      container.querySelector(
        'button[aria-label^="Add Daughtry to My Day"][aria-pressed="false"]',
      ),
    ).not.toBeNull();

    const removeOptions = feedbackMocks.toast.mock.calls[0]?.[1] as {
      action: { onClick: () => void };
    };
    await act(async () => removeOptions.action.onClick());

    expect(
      container.querySelector(
        'button[aria-label^="Remove Daughtry from My Day"][aria-pressed="true"]',
      ),
    ).not.toBeNull();
    expect(feedbackMocks.haptic).toHaveBeenLastCalledWith("light");
    const restoredSteps = JSON.parse(
      storedValues.get(FAIR_PLAN_STORAGE_KEY) ?? "{}",
    ).steps as Array<{ scheduleItemId: string }>;
    expect(restoredSteps).toHaveLength(2);
    expect(restoredSteps.map((step) => step.scheduleItemId)).toEqual(
      originalOrder,
    );
  });

  it("shows only the selected day's stops while keeping other days saved", async () => {
    await renderFair();
    await openFullProgram();

    const addDaughtry = container.querySelector<HTMLButtonElement>(
      'button[aria-label^="Add Daughtry to My Day"]',
    );
    if (!addDaughtry) throw new Error("Missing Add Daughtry control.");
    await act(async () => addDaughtry.click());

    const fridaySavedOption = container.querySelector<HTMLOptionElement>(
      'option[value="2026-09-18"]',
    );
    expect(fridaySavedOption?.textContent).toContain("1 saved");

    await chooseDate("2026-09-20");
    await openMode("My Day");
    expect(container.textContent).not.toContain("Daughtry");
    expect(container.textContent).not.toContain("Your timeline starts with one choice.");
    expect(container.querySelector("[data-fair-journey]")).not.toBeNull();
    expect(
      container.querySelector(
        '[data-mobile-action-bar] button[aria-label="My Day"]',
      ),
    ).not.toBeNull();

    await openMode("Home");
    await chooseDate("2026-09-18");
    await openMode("My Day");
    expect(container.textContent).toContain("Daughtry");
    expect(
      JSON.parse(storedValues.get(FAIR_PLAN_STORAGE_KEY) ?? "{}").steps,
    ).toHaveLength(1);
  });

  it("places the selected-day highlights immediately below the dates", async () => {
    await renderFair();

    expect(container.querySelector("[data-fair-access-highlight]")).toBeNull();
    await chooseDate("2026-09-20");

    const highlight = container.querySelector<HTMLElement>(
      "[data-fair-access-highlight]",
    );
    expect(highlight?.textContent).toContain(
      "Sensory-friendly carnival · noon–2 p.m.",
    );
    expect(highlight?.textContent).toContain(
      "whole-ground low-sensory period",
    );

    const dates = container.querySelector('[role="tablist"][aria-label="Select Fair day"]');
    const highlights = container.querySelector("[data-fair-day-highlights]");
    const grandstand = container.querySelector("[data-fair-grandstand-highlight]");
    expect(dates?.nextElementSibling).toBe(highlights);
    expect(highlights?.firstElementChild).toBe(grandstand);
    expect(grandstand?.nextElementSibling).toBe(highlight);
    expect(highlights?.nextElementSibling?.querySelector("#fair-at-a-glance-heading"))
      .not.toBeNull();
    expect(container.querySelectorAll("[data-fair-grandstand-highlight]")).toHaveLength(1);
    expect(container.querySelectorAll("[data-fair-access-highlight]")).toHaveLength(1);

    await act(async () =>
      buttonWithText(container, "Read more in Q&A").click(),
    );
    await act(async () => vi.advanceTimersByTimeAsync(20));
    expect(document.body.textContent).toContain(
      "When is the sensory-friendly carnival period?",
    );
  });

  it("offers official admission before optional party inputs and keeps ticket readiness independent", async () => {
    await renderFair();
    await act(async () => buttonWithText(container, "Review tickets").click());

    const directAdmission = document.body.querySelector("[data-fair-direct-admission]");
    const purchaseLink = directAdmission?.querySelector("a");
    expect(purchaseLink?.textContent).toContain("Buy admission on Etix");
    expect(purchaseLink?.getAttribute("href")).toContain("etix.com/ticket/p/61602326/");
    expect(directAdmission?.textContent).not.toContain("$8");
    expect(purchaseLink?.getAttribute("target")).toBe("_blank");
    expect(directAdmission?.textContent).toContain("$10");
    const alternatives = document.body.querySelector("[data-fair-admission-alternatives]");
    expect(alternatives?.textContent).toContain("Blue Ribbon Bundle: $80");
    expect(alternatives?.textContent).toContain("10 Fair admissions");
    expect(alternatives?.querySelector("a")?.getAttribute("href")).toContain("etix.com/ticket/p/65356930/");
    expect(document.body.textContent).toContain("Single admission at the gate is $15.");
    const calculator = document.body.querySelector<HTMLDetailsElement>("[data-fair-ticket-calculator]");
    expect(calculator?.open).toBe(false);
    expect(calculator?.querySelector("summary")?.textContent).toContain("Estimate for my group");

    await act(async () => buttonWithText(document.body, "I already have tickets").click());
    expect(JSON.parse(storedValues.get(FAIR_PLAN_STORAGE_KEY) ?? "{}").readyKeys).toContain("ticket");
    expect(JSON.parse(storedValues.get(FAIR_PLAN_STORAGE_KEY) ?? "{}").party.adults11Plus).toBe(0);
  });

  it("keeps single admission at $10 on both sides of the withdrawn Friday cutoff", async () => {
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
    await renderFair({ ...data, initialPlan: partyPlan });

    const admissionGlance = () =>
      container.querySelector('[data-fair-glance-tile="admission"]')
        ?.textContent ?? "";
    expect(admissionGlance()).toContain("$10 online · $15 gate");

    await act(async () => buttonWithText(container, "Review tickets").click());
    const combination = () =>
      document.body.querySelector(
        '[aria-label="Reviewed party ticket combination"]',
      )?.textContent ?? "";

    expect(combination()).toContain("1 × Adult admission online$10");
    expect(combination()).not.toContain("First Friday advance admission");
    expect(document.body.querySelector("[data-fair-direct-admission]")?.textContent).toContain("$10");

    await act(async () => vi.advanceTimersByTimeAsync(61_000));

    expect(combination()).not.toContain("First Friday advance admission");
    expect(combination()).toContain("1 × Adult admission online$10");
    expect(document.body.querySelector("[data-fair-direct-admission]")?.textContent).not.toContain("$8");
    expect(document.body.querySelector("[data-fair-direct-admission]")?.textContent).toContain("$10");
    expect(admissionGlance()).not.toContain("$8 first Friday");
    expect(admissionGlance()).toContain("$10 online · $15 gate");
  });

  it("persists party counts and turns the next action into the next useful task", async () => {
    await renderFair();
    await act(async () => buttonWithText(container, "Review tickets").click());

    const changeCount = async (label: string, value: number) => {
      const input = document.body.querySelector<HTMLInputElement>(
        `input[aria-label="${label}"]`,
      );
      if (!input) throw new Error(`Missing ${label} input.`);
      const valueSetter = Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype,
        "value",
      )?.set;
      if (!valueSetter) throw new Error("Missing native value setter.");
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

    await act(async () =>
      buttonWithText(document.body, "I already have tickets").click(),
    );
    expect(container.textContent).toContain("1 of 3 ready");
    expect(
      container.querySelector("[data-fair-plan-announcement]")?.textContent,
    ).toContain("1 of 3 preparation steps is ready");
    expect(container.textContent).toContain("Choose how you will get there.");
    expect(container.textContent).toContain("Choose travel");
  });

  it("does not mark arrival and return ready until the chosen plan is confirmed", async () => {
    await renderFair();
    await openTravel();

    const drive = container.querySelector<HTMLInputElement>(
      'input[value="arrival-drive"]',
    );
    if (!drive) throw new Error("Missing Drive / Park option.");
    await act(async () => drive.click());

    const selectedPlan = JSON.parse(
      storedValues.get(FAIR_PLAN_STORAGE_KEY) ?? "{}",
    );
    expect(selectedPlan.arrivalChoice).toBe("drive");
    expect(selectedPlan.readyKeys).not.toContain("travel");
    expect(selectedPlan.readyKeys).not.toContain("arrival");
    expect(selectedPlan.readyKeys).not.toContain("return");
    expect(container.textContent).toContain("Use this driving plan");

    await act(async () =>
      buttonWithText(container, "Use this driving plan").click(),
    );

    const confirmedPlan = JSON.parse(
      storedValues.get(FAIR_PLAN_STORAGE_KEY) ?? "{}",
    );
    expect(confirmedPlan.readyKeys).toContain("travel");
    expect(confirmedPlan.readyKeys).not.toContain("arrival");
    expect(confirmedPlan.readyKeys).not.toContain("return");

    await chooseDate("2026-09-18");
    expect(
      JSON.parse(storedValues.get(FAIR_PLAN_STORAGE_KEY) ?? "{}").readyKeys,
    ).toContain("travel");

    await chooseDate("2026-09-19");
    const nextDayPlan = JSON.parse(
      storedValues.get(FAIR_PLAN_STORAGE_KEY) ?? "{}",
    );
    expect(nextDayPlan.selectedDayId).toBe("day-2026-09-19");
    expect(nextDayPlan.readyKeys).not.toContain("travel");
    expect(container.textContent).toContain("Use this driving plan");

    await openMode("My Day");
    expect(container.textContent).toContain("Drive and park");
    expect(container.textContent).toContain(
      "Give the middle of your day a place to start.",
    );
    expect(container.textContent).toContain("Head back");
    expect(container.textContent).toContain("Return to your saved parking lot");
    expect(container.textContent).not.toContain("Return plan set");
  });
});
