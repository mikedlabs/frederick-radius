// @vitest-environment jsdom
import { act, createElement, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

vi.mock("@/components/event/EventCard", () => ({
  default: ({ event }: { event: { title: string } }) => createElement("span", null, event.title),
}));
vi.mock("@/components/map/AppMapClient", () => ({ default: () => null }));
vi.mock("next/link", () => ({
  default: ({ children, ...props }: Record<string, unknown>) => createElement("a", props, children as ReactNode),
}));

import ItineraryClient from "./ItineraryClient";

const key = "fr:itinerary:v1";
const savedAt = "2026-09-01T12:00:00Z";
const untouchedAt = "2026-09-02T14:00:00Z";
const listing = {
  slug: "canonical-event", title: "Current public listing", starts_at: "2026-10-08T20:00:00Z",
  ends_at: "2026-10-08T22:00:00Z", venue_name: "Memorial Park", category: "music", description: "", audience: [],
};
let root: Root;
let container: HTMLDivElement;
let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  localStorage.clear();
  localStorage.setItem(key, JSON.stringify([{ id: "legacy-event", added_at: savedAt }]));
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  fetchMock = vi.fn((_url: string, init: RequestInit) => {
    const requested = (JSON.parse(String(init.body)) as { slugs: string[] }).slugs;
    const aliases: string[] = requested.filter((slug) => slug === "legacy-event" || slug === "second-alias");
    return Promise.resolve(new Response(JSON.stringify({
      events: aliases.length > 0 ? [listing] : [],
      resolvedSlugs: aliases.map((requestedSlug) => ({ requestedSlug, canonicalSlug: listing.slug })),
      unresolvedSlugs: requested.filter((slug) => !aliases.includes(slug)), missingSlugs: [],
      degraded: requested.some((slug) => !aliases.includes(slug)),
    })));
  });
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

async function mount() {
  await act(async () => root.render(createElement(ItineraryClient)));
}

function removeButton() {
  const button = container.querySelector<HTMLButtonElement>('button[aria-label="Remove Current public listing from Day Plan"]');
  expect(button).not.toBeNull();
  return button!;
}

it("does not re-add a displayed alias already removed from another tab's storage", async () => {
  await mount();
  const displayedRemove = removeButton();
  // Another document updates the same origin's storage without this hook's local listeners.
  localStorage.setItem(key, "[]");
  const write = vi.spyOn(Storage.prototype, "setItem");

  await act(async () => displayedRemove.click());

  expect(localStorage.getItem(key)).toBe("[]");
  expect(write).not.toHaveBeenCalled();
  expect(container.textContent).toContain("Your day plan is empty");
  expect(container.textContent).not.toContain(listing.title);
});

it("removes grouped aliases in one write and preserves a newer unrelated saved timestamp", async () => {
  localStorage.setItem(key, JSON.stringify([
    { id: "legacy-event", added_at: savedAt }, { id: "second-alias", added_at: savedAt },
  ]));
  await mount();
  // A concurrent tab adds a separate reference after this row was rendered.
  localStorage.setItem(key, JSON.stringify([
    { id: "legacy-event", added_at: savedAt }, { id: "second-alias", added_at: savedAt },
    { id: "untouched-event", added_at: untouchedAt },
  ]));
  const write = vi.spyOn(Storage.prototype, "setItem");

  await act(async () => removeButton().click());

  expect(JSON.parse(localStorage.getItem(key)!)).toEqual([{ id: "untouched-event", added_at: untouchedAt }]);
  expect(write).toHaveBeenCalledTimes(1);
  expect(container.textContent).toContain("1 saved event");
  expect(container.textContent).not.toContain(listing.title);
});

it("fails closed when the latest storage cannot be read instead of erasing an unrelated reference", async () => {
  await mount();
  const newer = JSON.stringify([
    { id: "legacy-event", added_at: savedAt }, { id: "untouched-event", added_at: untouchedAt },
  ]);
  localStorage.setItem(key, newer);
  const originalGet = Storage.prototype.getItem;
  const read = vi.spyOn(Storage.prototype, "getItem").mockImplementation(function (this: Storage, storageKey: string) {
    if (storageKey === key) throw new DOMException("Unavailable", "SecurityError");
    return originalGet.call(this, storageKey);
  });
  const write = vi.spyOn(Storage.prototype, "setItem");

  await act(async () => removeButton().click());

  expect(write).not.toHaveBeenCalled();
  expect(container.querySelector('[role="alert"]')?.textContent).toContain("could not remove");
  read.mockRestore();
  expect(localStorage.getItem(key)).toBe(newer);
});

it("keeps view controls disabled before hydration and usable after mounting", async () => {
  const serverView = document.createElement("div");
  serverView.innerHTML = renderToString(createElement(ItineraryClient));
  const serverControls = Array.from(serverView.querySelectorAll<HTMLButtonElement>("button"));

  expect(serverControls.map((button) => [button.textContent, button.disabled])).toEqual([["Timeline", true], ["Map", true]]);
  expect(serverView.textContent).toContain("Opening your saved events");
  expect(serverView.textContent).not.toContain("Check again");
  expect(fetchMock).not.toHaveBeenCalled();

  await mount();
  const map = Array.from(container.querySelectorAll<HTMLButtonElement>("button")).find((button) => button.textContent === "Map")!;
  expect(map.disabled).toBe(false);
  await act(async () => map.click());
  expect(map.getAttribute("aria-pressed")).toBe("true");
  const timeline = Array.from(container.querySelectorAll<HTMLButtonElement>("button")).find((button) => button.textContent === "Timeline")!;
  expect(timeline.disabled).toBe(false);
  await act(async () => timeline.click());
  expect(timeline.getAttribute("aria-pressed")).toBe("true");
  expect(fetchMock).toHaveBeenCalledTimes(1);
});

it.each(["{broken", '{"items":[]}', '[{"id":"legacy-event"}]'])(
  "does not overwrite a malformed latest collection from explicit Remove: %s", async (malformed) => {
    await mount();
    const displayedRemove = removeButton();
    localStorage.setItem(key, malformed);
    const write = vi.spyOn(Storage.prototype, "setItem");
    await act(async () => displayedRemove.click());
    expect(write).not.toHaveBeenCalled();
    expect(localStorage.getItem(key)).toBe(malformed);
    expect(container.querySelector('[role="alert"]')?.textContent).toContain("could not remove");
  },
);
