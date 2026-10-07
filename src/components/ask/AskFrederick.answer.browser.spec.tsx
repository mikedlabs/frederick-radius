// @vitest-environment jsdom

import { act, createElement, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AskResult, AskSource } from "@/lib/ask/contracts";
import { parseAskIntent } from "@/lib/ask/intent";
import { withAskResponsePresentation } from "@/lib/ask/presentation";

vi.mock("next/link", () => ({
  default: ({ href, children, ...props }: { href: string; children: ReactNode }) =>
    createElement("a", { href, ...props }, children),
}));
vi.mock("next/image", () => ({ default: () => null }));
// The MapLibre half of the results map is a lazy chunk; the pins and the
// placeholder are what this spec reads.
vi.mock("next/dynamic", () => ({
  default: () => () => createElement("div", { "data-test-canvas": "" }),
}));
vi.mock("@/hooks/useFollows", () => ({
  useFollowedSlugs: () => ({ slugs: new Set<string>() }),
}));
vi.mock("@/hooks/useGeolocation", () => ({
  readCachedPosition: () => null,
  useGeolocation: () => ({
    state: { status: "idle" },
    request: () => {},
    requestIfGranted: async () => {},
  }),
}));
vi.mock("@/components/saved/SaveButton", () => ({ default: () => null }));
vi.mock("@/components/ask/AskCorrectionControl", () => ({ default: () => null }));
vi.mock("@/components/ui/Sheet", () => ({ default: () => null }));
vi.mock("@/lib/track", () => ({ track: () => {} }));
vi.mock("@/lib/haptics", () => ({ haptic: () => false }));

import AskFrederick from "./AskFrederick";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

const COFFEE_QUERY = "quiet coffee shop to work downtown";

function place(
  slug: string,
  name: string,
  geom: { lng: number; lat: number },
  extra: Partial<AskSource> = {},
): AskSource {
  return {
    slug,
    name,
    category: "coffee",
    city: "Frederick",
    href: `/places/${slug}`,
    eyebrow: "Coffee",
    status: "Hours not confirmed",
    geom,
    ...extra,
  };
}

/** The answer the server gives for the audit's "quiet coffee" question. */
function coffeeAnswer(): AskResult {
  return withAskResponsePresentation(
    {
      status: "matches",
      configured: true,
      usedModel: false,
      answer:
        "Ibiza Cafe in Frederick is the best match for coffee. Frederick Coffee Company is another option near downtown, with 2 more matches. Radius does not have verified noise-level data for these places, so I can’t confirm that they will be quiet.",
      sources: [
        place("ibiza-cafe-frederick", "Ibiza Cafe", { lng: -77.4109474, lat: 39.4189606 }),
        place("frederick-coffee-company-frederick", "Frederick Coffee Company", {
          lng: -77.405065,
          lat: 39.415299,
        }),
        place("gravel-and-grind-frederick", "Gravel & Grind", {
          lng: -77.409217,
          lat: 39.4216984,
        }),
        place(
          "north-market-pop-shop-frederick",
          "North Market Pop Shop",
          { lng: -77.4107529, lat: 39.4176334 },
          { category: "ice-cream", eyebrow: "Alternative · Ice cream & treats" },
        ),
      ],
      actions: [
        { label: "See all 12 coffee shops", kind: "open", href: "/nearby?c=coffee" },
        {
          label: "Make it a plan",
          kind: "refine",
          query: `Plan a 3 hour outing based on: ${COFFEE_QUERY}`,
        },
        { label: "Open now", kind: "refine", query: `${COFFEE_QUERY} open now` },
      ],
    },
    COFFEE_QUERY,
  );
}

describe("Ask answer layout", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    window.localStorage.clear();
    window.sessionStorage.clear();
    window.history.replaceState(null, "", "/ask");
    vi.stubGlobal(
      "matchMedia",
      (query: string) =>
        ({
          matches: false,
          media: query,
          addEventListener: () => {},
          removeEventListener: () => {},
          addListener: () => {},
          removeListener: () => {},
        }) as unknown as MediaQueryList,
    );
    vi.stubGlobal(
      "IntersectionObserver",
      class {
        observe() {}
        disconnect() {}
        unobserve() {}
        takeRecords() {
          return [];
        }
      },
    );
    Element.prototype.scrollIntoView = () => {};
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    vi.unstubAllGlobals();
  });

  async function renderAnswer(query: string, result: AskResult) {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(JSON.stringify(result), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
      ),
    );
    await act(async () => {
      root.render(
        <AskFrederick
          mode="workspace"
          initialQuery={query}
          initialScope="town:frederick"
        />,
      );
    });
    // Let the request resolve and the answer render.
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
  }

  const heading = () => container.querySelector("#ask-answer-heading");
  const rows = () =>
    [...container.querySelectorAll("[data-ask-results-list] > li")];
  const button = (name: string) =>
    [...container.querySelectorAll("button")].find(
      (candidate) => candidate.textContent?.trim() === name,
    );

  it("answers in the heading and says the caveat directly under it", async () => {
    await renderAnswer(COFFEE_QUERY, coffeeAnswer());

    expect(heading()?.tagName).toBe("H2");
    expect(heading()?.textContent).toBe(
      "Ibiza Cafe in Frederick is the best match for coffee.",
    );
    const supplement = container.querySelector('[data-ask-section="supplement"]');
    expect(supplement?.textContent).toContain("can’t confirm that they will be quiet");
    // The caveat is the first thing after the heading, not a closing block.
    expect(heading()?.nextElementSibling).toBe(supplement);

    const text = container.textContent ?? "";
    for (const eyebrow of [
      "Best match",
      "Next step",
      "Other next steps",
      "More context",
      "Sources behind this answer",
      "Other options and sources",
    ]) {
      expect(text).not.toContain(eyebrow);
    }
  });

  it("ranks places as one flat list of three with Show 1 more", async () => {
    await renderAnswer(COFFEE_QUERY, coffeeAnswer());

    expect(container.querySelector("details")).toBeNull();
    expect(rows().map((row) => row.querySelector("a")?.textContent)).toEqual([
      "Ibiza Cafe",
      "Frederick Coffee Company",
      "Gravel & Grind",
    ]);
    const more = button("Show 1 more");
    expect(more).toBeDefined();
    await act(async () => more!.click());
    expect(rows()).toHaveLength(4);
    expect(rows()[3].textContent).toContain("Alternative · Ice cream & treats");
    expect(button("Show fewer")).toBeDefined();
  });

  it("leads the list with a results map whose numbered pins match the rows", async () => {
    await renderAnswer(COFFEE_QUERY, coffeeAnswer());

    const map = container.querySelector("[data-ask-results-map]");
    const list = container.querySelector("[data-ask-results-list]");
    expect(map).not.toBeNull();
    expect(
      map!.compareDocumentPosition(list!) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    const pins = [...map!.querySelectorAll("[data-mini-map-pin]")]
      .map((pin) => pin.getAttribute("data-mini-map-pin"))
      .sort();
    expect(pins).toEqual(["1", "2", "3", "4"]);
    expect(
      rows().map((row) => row.querySelector("[data-ask-source-rank]")?.textContent),
    ).toEqual(["1", "2", "3"]);
  });

  it("offers one primary action with a countable label after the list", async () => {
    await renderAnswer(COFFEE_QUERY, coffeeAnswer());

    const primary = container.querySelectorAll('[data-ask-action="primary"]');
    expect(primary).toHaveLength(1);
    expect(primary[0].textContent).toBe("See all 12 coffee shops");
    expect(primary[0].getAttribute("href")).toBe("/nearby?c=coffee");
    const list = container.querySelector("[data-ask-results-list]");
    expect(
      list!.compareDocumentPosition(primary[0]) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(
      [...container.querySelectorAll('[data-ask-action="secondary"]')].map(
        (action) => action.textContent,
      ),
    ).toEqual(["Make it a plan", "Open now"]);
  });

  it("keeps an unconfirmed-hours caveat in the paragraph instead of a boxed label", async () => {
    const query = "Where should I eat tonight?";
    await renderAnswer(query, {
      status: "matches",
      configured: true,
      usedModel: false,
      answer: "Source 1 is the best match for dinner tonight.",
      intent: parseAskIntent(query),
      sources: [
        {
          slug: "source-1",
          name: "Source 1",
          category: "restaurant",
          href: "/places/source-1",
          status: "Hours not posted",
          isPrimaryRankedResult: true,
        },
      ],
    });

    expect(heading()?.textContent).toBe(
      "Source 1 is a possible match for dinner tonight.",
    );
    expect(
      container.querySelector('[data-ask-section="supplement"]')?.textContent,
    ).toBe("Radius has not confirmed this place's hours for tonight. Check before you go.");
    expect(container.querySelector("[data-ask-hours-limitation]")).toBeNull();
    expect(container.textContent).not.toContain("Possible match");
    // No precise point, so no map pretends to know where it is.
    expect(container.querySelector("[data-ask-results-map]")).toBeNull();
  });
});
