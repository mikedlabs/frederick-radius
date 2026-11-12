// @vitest-environment jsdom
// @vitest-environment-options {"url":"https://frederickradius.app/ask"}

import { act, type AnchorHTMLAttributes } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const harness = vi.hoisted(() => ({
  slugs: new Set<string>(),
  state: { status: "idle" },
  requestIfGranted: vi.fn().mockResolvedValue(false),
}));
vi.mock("next/link", () => ({
  default: ({ prefetch, ...props }: AnchorHTMLAttributes<HTMLAnchorElement> & { prefetch?: boolean }) => {
    void prefetch;
    return <a {...props} />;
  },
}));
vi.mock("next/image", () => ({
  // eslint-disable-next-line @next/next/no-img-element
  default: ({ src, alt }: { src: string; alt: string }) => <img src={src} alt={alt} />,
}));
vi.mock("@/hooks/useFollows", () => ({ useFollowedSlugs: () => ({ slugs: harness.slugs }) }));
vi.mock("@/hooks/useGeolocation", () => ({
  readCachedPosition: () => null,
  useGeolocation: () => ({ state: harness.state, requestIfGranted: harness.requestIfGranted }),
}));
vi.mock("@/lib/track", () => ({ track: vi.fn() }));
vi.mock("@/lib/haptics", () => ({ haptic: vi.fn() }));
vi.mock("@/lib/motion", () => ({ prefersReducedMotion: () => true }));
vi.mock("@/components/saved/SaveButton", () => ({ default: () => null }));

import AskFrederick from "./AskFrederick";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const fetchMock = vi.fn<typeof fetch>();
let root: Root;
let container: HTMLDivElement;

/** Radius values outside the 4/6/8/10 token scale, such as rounded-[13px]. */
const OFF_SCALE_RADIUS = /rounded-\[\d+px\]/;

function answerWithSources() {
  return Response.json({
    status: "matches",
    configured: true,
    usedModel: false,
    answer: "Two options fit the question.",
    context: "Frederick County",
    sources: [
      {
        slug: "lead-place",
        name: "Lead place",
        category: "coffee",
        href: "/places/lead-place",
        reason: "It matches the request.",
        isPrimaryRankedResult: true,
      },
      {
        slug: "second-place",
        name: "Second place",
        category: "coffee",
        href: "/places/second-place",
        reason: "It is also close.",
        photo_url: "/history-photos/carroll-creek-park.jpg",
      },
    ],
  });
}

async function mount(question = "") {
  await act(async () => {
    root.render(<AskFrederick mode="workspace" initialQuery={question} initialScope="county" />);
  });
}

function coralFields(): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>("[style]")).filter((node) =>
    /background:\s*var\(--app-brand(?:-press)?\)/.test(node.getAttribute("style") ?? ""),
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  window.localStorage.clear();
  window.sessionStorage.clear();
  window.history.replaceState({ __NA: true, tree: ["ask"] }, "", "/ask");
  fetchMock.mockReset().mockResolvedValue(answerWithSources());
  vi.stubGlobal("fetch", fetchMock);
  vi.stubGlobal("matchMedia", vi.fn(() => ({
    matches: false,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
  })));
  vi.spyOn(window, "scrollTo").mockImplementation(() => {});
  HTMLElement.prototype.scrollIntoView = vi.fn();
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("Ask workspace follows the plain tool direction", () => {
  it("sets the title in heavy system sans and keeps the question field a 6px control", async () => {
    await mount();

    const heading = container.querySelector("h1#ask-radius-heading");
    expect(heading?.textContent).toBe("Ask Radius.");
    expect(heading?.className).not.toMatch(/font-(?:editorial|display|brand|serif)/);
    expect(heading?.className).toContain("font-semibold");
    expect(container.innerHTML).not.toMatch(/font-(?:editorial|display|brand)\b/);

    const field = container.querySelector<HTMLElement>("[data-ask-composer]");
    expect(field?.className).toContain("rounded-[var(--app-radius-md)]");
    expect(field?.getAttribute("style")).toContain("var(--app-control-border)");
    expect(field?.getAttribute("style") ?? "").not.toMatch(/shadow/);

    const submit = container.querySelector<HTMLElement>('button[type="submit"]');
    expect(submit?.className).toContain("rounded-[var(--app-radius-md)]");
    expect(coralFields()).toEqual([submit]);
    expect(container.innerHTML).not.toMatch(OFF_SCALE_RADIUS);
  });

  it("lists the example prompts as ruled rows on the ground, not inside a panel", async () => {
    await mount();

    const group = container.querySelector<HTMLElement>('[role="group"][aria-label="Questions to try"]');
    expect(group).not.toBeNull();
    expect(group!.className).not.toMatch(/rounded|shadow|bg-/);
    const prompts = Array.from(group!.querySelectorAll("button"));
    expect(prompts).toHaveLength(3);
    for (const prompt of prompts) {
      expect(prompt.className).toContain("border-b");
      expect(prompt.className).toContain("min-h-14");
      expect(prompt.className).not.toMatch(/rounded/);
    }
  });

  it("renders sources as ruled rows with a plain glyph when no photo exists", async () => {
    await mount("Where is good coffee in Frederick County?");
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    const lead = container.querySelector<HTMLElement>('[data-ask-source-index="0"]');
    expect(lead).not.toBeNull();
    expect(lead!.className).toContain("border-b");
    expect(lead!.className).not.toMatch(/rounded|shadow/);
    expect(lead!.getAttribute("style") ?? "").not.toMatch(/background/);

    const glyph = lead!.querySelector<HTMLElement>("[data-ask-source-media]");
    expect(glyph?.querySelector("img")).toBeNull();
    expect(glyph?.getAttribute("style")).toContain("var(--app-ink-3)");
    expect(glyph?.className ?? "").not.toMatch(/bg-|rounded|border/);

    const title = lead!.querySelector<HTMLAnchorElement>('a[href="/places/lead-place"]');
    expect(title?.className).toContain("text-[17px]");
    expect(title?.className).toContain("font-semibold");

    const context = Array.from(container.querySelectorAll("span")).find(
      (node) => node.textContent === "Frederick County" && node.querySelector("svg"),
    );
    expect(context?.className ?? "").not.toMatch(/rounded|border/);

    expect(container.innerHTML).not.toMatch(OFF_SCALE_RADIUS);
    expect(container.innerHTML).not.toContain("color: var(--app-brand-press)");
    expect(container.innerHTML).not.toMatch(/color:\s*var\(--app-brand\)/);
    expect(coralFields()).toHaveLength(1);
  });
});
