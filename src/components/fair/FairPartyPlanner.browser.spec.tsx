// @vitest-environment jsdom

import { act, createElement, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type { FairParty } from "@/lib/fair/party-plan";

import FairPartyPlanner from "./FairPartyPlanner";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

const TEST_DATE = "2026-09-20";
const TEST_AS_OF = "2026-09-01T20:00:00Z";

function PartyHarness({ initialParty }: { initialParty: FairParty }) {
  const [party, setParty] = useState(initialParty);
  return createElement(FairPartyPlanner, {
    party,
    date: TEST_DATE,
    asOf: TEST_AS_OF,
    offers: [],
    onPartyChange: setParty,
  });
}

describe("FairPartyPlanner accessible count adjustments", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
  });

  async function renderPlanner(initialParty: FairParty) {
    await act(async () => {
      root.render(createElement(PartyHarness, { initialParty }));
    });
  }

  async function changeCount(label: string, value: string) {
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
      valueSetter.call(input, value);
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
  }

  function adjustmentStatus(): HTMLParagraphElement {
    const status = container.querySelector<HTMLParagraphElement>(
      "#fair-party-adjustment-status",
    );
    if (!status) throw new Error("Missing the party adjustment status.");
    return status;
  }

  it("keeps one polite status mounted and announces dependent rider reductions", async () => {
    await renderPlanner({
      adults11Plus: 3,
      children10Under: 4,
      adultRiders: 3,
      childRiders: 4,
    });
    const persistentStatus = adjustmentStatus();
    expect(persistentStatus.textContent).toBe("");
    expect(persistentStatus.getAttribute("role")).toBe("status");
    expect(persistentStatus.getAttribute("aria-live")).toBe("polite");
    expect(persistentStatus.getAttribute("aria-atomic")).toBe("true");

    await changeCount("Adults 11+", "2");
    expect(adjustmentStatus()).toBe(persistentStatus);
    expect(adjustmentStatus().textContent).toBe(
      "The adult rider count was reduced from 3 to 2 because rider counts cannot exceed their matching age total.",
    );
    expect(
      container.querySelector<HTMLInputElement>(
        'input[aria-label="Adult riders"]',
      )?.value,
    ).toBe("2");

    await changeCount("Children 10 and under", "1");
    expect(adjustmentStatus()).toBe(persistentStatus);
    expect(adjustmentStatus().textContent).toBe(
      "The child rider count was reduced from 4 to 1 because rider counts cannot exceed their matching age total.",
    );
    expect(
      container.querySelector<HTMLInputElement>(
        'input[aria-label="Child riders"]',
      )?.value,
    ).toBe("1");
  });

  it("announces direct rider and party-limit clamps, then clears stale copy", async () => {
    await renderPlanner({
      adults11Plus: 1,
      children10Under: 39,
      adultRiders: 0,
      childRiders: 0,
    });

    await changeCount("Adult riders", "9");
    expect(adjustmentStatus().textContent).toBe(
      "The adult rider count was limited to 1 because rider counts cannot exceed their matching age total.",
    );
    expect(
      container.querySelector<HTMLInputElement>(
        'input[aria-label="Adult riders"]',
      )?.value,
    ).toBe("1");

    await changeCount("Adults 11+", "5");
    expect(adjustmentStatus().textContent).toBe(
      "The adult guest count was limited to 1 because one plan can include up to 40 people.",
    );
    expect(
      container.querySelector<HTMLInputElement>(
        'input[aria-label="Adults 11+"]',
      )?.value,
    ).toBe("1");

    await changeCount("Adult riders", "0");
    expect(adjustmentStatus().textContent).toBe("");
  });
});
