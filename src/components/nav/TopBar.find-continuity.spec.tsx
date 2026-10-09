// @vitest-environment jsdom

import { act, type AnchorHTMLAttributes } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const navigation = vi.hoisted(() => ({ pathname: "/events", push: vi.fn(), back: vi.fn(), leaveTo: vi.fn() }));
vi.mock("next/navigation", () => ({
  usePathname: () => navigation.pathname,
  useRouter: () => ({ push: navigation.push, back: navigation.back }),
}));
vi.mock("next/link", () => ({
  default: ({ prefetch, ...props }: AnchorHTMLAttributes<HTMLAnchorElement> & { prefetch?: boolean }) => {
    void prefetch;
    return <a {...props} />;
  },
}));
vi.mock("@/hooks/useReversibleHistoryLayer", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/hooks/useReversibleHistoryLayer")>();
  return {
    ...actual,
    useReversibleHistoryLayer: (options: Parameters<typeof actual.useReversibleHistoryLayer>[0]) => ({
      ...actual.useReversibleHistoryLayer(options),
      // Observe the exact native-navigation boundary without navigating jsdom.
      leaveTo: navigation.leaveTo,
    }),
  };
});
vi.mock("./LocationChip", () => ({ default: () => null }));
vi.mock("./PulseIndicator", () => ({ default: () => null }));
vi.mock("@/components/brand/RippleMark", () => ({ default: () => null }));
vi.mock("@/hooks/useGeolocation", () => ({ readCachedPosition: () => null }));
vi.mock("@/lib/track", () => ({ track: vi.fn() }));

import TopBar from "./TopBar";
import { track } from "@/lib/track";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const DRAFT_KEY = "fr:find-draft:v1";
const fetchMock = vi.fn<typeof fetch>();
let container: HTMLDivElement;
let root: Root;

function payload(title: string, area = "Whole county") {
  return {
    results: [{ type: "place", id: title, title, subtitle: "Component test fixture", href: "/places/fixture" }],
    meta: { qualifiers: { constrained: true, categoryLabel: "Coffee" }, contextLabel: area },
  };
}
function response(title: string, area?: string) {
  return Response.json(payload(title, area));
}
async function settle(ms = 180) {
  await act(async () => { await new Promise((resolve) => setTimeout(resolve, ms)); });
}
function input() {
  const field = container.querySelector<HTMLInputElement>('[role="searchbox"]');
  if (!field) throw new Error("Find input is missing");
  return field;
}
function button(label: string) {
  const found = [...container.querySelectorAll<HTMLButtonElement>("button")]
    .find((node) => node.getAttribute("aria-label") === label || node.textContent?.trim() === label);
  if (!found) throw new Error(`Missing button: ${label}`);
  return found;
}
async function mount() {
  await act(async () => { root.render(<TopBar />); });
}
async function open() {
  const opener = button("Ask or find across Frederick County");
  await act(async () => {
    opener.focus();
    opener.click();
    await vi.dynamicImportSettled();
  });
  await settle(60);
  expect(container.querySelectorAll('[role="dialog"]')).toHaveLength(1);
  return opener;
}
async function type(value: string) {
  await act(async () => {
    // Use the native setter so React observes the same input event as typing.
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input(), value);
    input().dispatchEvent(new Event("input", { bubbles: true }));
  });
}
async function close() {
  await act(async () => { button("Close Find").click(); });
  await settle(30); // Let the real history-layer Back event settle.
  expect(container.querySelector('[role="dialog"]')).toBeNull();
}
async function remount() {
  await act(async () => { root.unmount(); });
  root = createRoot(container);
  await mount();
}

beforeEach(async () => {
  navigation.pathname = "/events";
  vi.clearAllMocks();
  fetchMock.mockReset().mockResolvedValue(response("Fresh fixture result"));
  vi.stubGlobal("fetch", fetchMock);
  vi.spyOn(window, "scrollTo").mockImplementation(() => {});
  window.localStorage.clear();
  window.sessionStorage.clear();
  document.cookie = "fr_scope=county; path=/";
  window.history.replaceState({}, "", "/events");
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  await mount();
});

afterEach(async () => {
  await act(async () => { root.unmount(); });
  await settle(240); // Drain the existing delayed scroll restoration.
  container.remove();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  window.history.replaceState({}, "", "/");
});

describe("Find continuity through the real lazy header and overlay", () => {
  it.each(["header", "bridge", "shortcut"])("keeps an active non-inert modal in charge of the %s Find entry", async (entry) => {
    const modal = document.createElement("div");
    modal.setAttribute("role", "dialog");
    modal.setAttribute("aria-modal", "true");
    const owner = document.createElement("button");
    owner.textContent = "Done";
    modal.append(owner);
    document.body.append(modal);
    try {
      owner.focus();
      await act(async () => {
        if (entry === "header") button("Ask or find across Frederick County").click();
        if (entry === "bridge") window.dispatchEvent(new CustomEvent("fr:open-search"));
        if (entry === "shortcut") owner.dispatchEvent(new KeyboardEvent("keydown", { key: "/", bubbles: true }));
        await vi.dynamicImportSettled();
      });
      expect(container.querySelector("#radius-find-dialog")).toBeNull();
      expect(document.activeElement).toBe(owner);
    } finally { modal.remove(); }
    await open();
    expect(input()).toBeDefined();
  });

  it.each(["inert", "hidden", "aria-hidden"])("ignores an inactive %s modal when opening Find", async (attribute) => {
    const modal = document.createElement("div");
    modal.setAttribute("role", "dialog");
    modal.setAttribute("aria-modal", "true");
    modal.setAttribute(attribute, attribute === "aria-hidden" ? "true" : "");
    document.body.append(modal);
    try { await open(); } finally { modal.remove(); }
  });

  it("restores the query after Escape and fetches new results instead of retaining the old answer", async () => {
    fetchMock.mockResolvedValueOnce(response("Earlier fixture result"))
      .mockResolvedValueOnce(response("Updated fixture result"));
    const opener = await open();
    await type("coffee");
    await settle();
    expect(container.textContent).toContain("Earlier fixture result");
    await act(async () => { window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" })); });
    await settle(30);
    expect(container.querySelector('[role="dialog"]')).toBeNull();
    expect(document.activeElement).toBe(opener);
    await open();
    expect(input().value).toBe("coffee");
    expect(container.textContent).not.toContain("Earlier fixture result");
    expect(container.textContent).toContain("Searching");
    await settle();
    expect(container.textContent).toContain("Updated fixture result");
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(window.sessionStorage.getItem(DRAFT_KEY)).toBe("coffee");
  });

  it.each(["click", "Enter"])("unmounts Find before %s starts native result navigation", async (method) => {
    const opener = await open();
    await type("coffee");
    await settle();
    const signal = fetchMock.mock.calls[0][1]?.signal;
    const layerId = window.history.state.__frederickRadiusLayer;
    const scrollCount = vi.mocked(window.scrollTo).mock.calls.length;
    let atNavigation: unknown;
    navigation.leaveTo.mockImplementationOnce((href: string) => {
      atNavigation = {
        href,
        dialogPresent: Boolean(container.querySelector('[role="dialog"]')),
        requestAborted: signal?.aborted,
        restoredOpenerFocus: document.activeElement === opener,
        scrollCount: vi.mocked(window.scrollTo).mock.calls.length,
        layerId: window.history.state.__frederickRadiusLayer,
      };
    });
    await act(async () => {
      if (method === "Enter") {
        input().dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
      } else {
        const link = [...container.querySelectorAll<HTMLAnchorElement>("a")]
          .find((node) => node.textContent?.trim() === "Open");
        if (!link) throw new Error("The result action is missing");
        link.click();
      }
    });
    expect(navigation.leaveTo).toHaveBeenCalledOnce();
    expect(atNavigation).toEqual({
      href: method === "Enter" ? "/nearby?c=coffee" : "/places/fixture",
      dialogPresent: false,
      requestAborted: true,
      restoredOpenerFocus: false,
      scrollCount,
      layerId,
    });
    expect(window.sessionStorage.getItem(DRAFT_KEY)).toBe("coffee");
  });

  it("keeps the tab's query through a fresh shell mount but clearing starts a new search", async () => {
    await open();
    await type("coffee");
    await close();
    await remount(); // Result navigation uses a full same-tab navigation.
    await open();
    expect(input().value).toBe("coffee");
    await act(async () => { button("Clear search").click(); });
    expect(window.sessionStorage.getItem(DRAFT_KEY)).toBeNull();
    await close();
    await remount();
    await open();
    expect(input().value).toBe("");
    expect(container.textContent).toContain("Useful now");
  });

  it("repeats a recent phrase and then resumes it without persisting result data", async () => {
    fetchMock.mockImplementation(async () => response("Fresh fixture result"));
    await open();
    await type("coffee");
    await settle();
    await act(async () => {
      input().dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    });
    expect(navigation.leaveTo).toHaveBeenCalledOnce();
    await open();
    await act(async () => { button("Clear search").click(); });
    await act(async () => { button("coffee").click(); });
    await settle();
    expect(container.textContent).toContain("Fresh fixture result");
    await close();
    await open();
    expect(input().value).toBe("coffee");
    expect(window.sessionStorage.length).toBe(1);
    expect(window.sessionStorage.getItem(DRAFT_KEY)).toBe("coffee");
  });

  it.each(["throws", "silently refuses"])("explains a Clear write that %s while retaining the confirmed history", async (failure) => {
    const key = "fr:recent-search:v2";
    const raw = JSON.stringify({ source: "submitted-on-device", queries: ["coffee"] });
    window.localStorage.setItem(key, raw);
    await open();
    expect(button("coffee")).toBeDefined();
    const originalSet = Storage.prototype.setItem;
    const writeSpy = vi.spyOn(Storage.prototype, "setItem").mockImplementation(function (this: Storage, name: string, value: string) {
      if (name === key) {
        if (failure === "throws") throw new DOMException("Storage full", "QuotaExceededError");
        return;
      }
      originalSet.call(this, name, value);
    });
    await act(async () => { button("Clear recent searches").click(); });
    expect(container.textContent).toContain("Could not clear recent searches. Please try again.");
    expect(container.textContent).not.toContain("No recent searches on this device.");
    expect(button("coffee")).toBeDefined();
    expect(window.localStorage.getItem(key)).toBe(raw);
    await close();
    await remount();
    await open();
    expect(button("coffee")).toBeDefined();
    expect(window.localStorage.getItem(key)).toBe(raw);
    writeSpy.mockRestore();
    await type("new actual phrase");
    await settle();
    await act(async () => {
      input().dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    });
    expect(navigation.leaveTo).toHaveBeenCalledWith("/places/fixture");
    await open();
    await act(async () => { button("Clear search").click(); });
    expect(button("coffee")).toBeDefined();
    expect(button("new actual phrase")).toBeDefined();
    expect(container.textContent).toContain("Could not clear recent searches. Please try again.");
    await act(async () => { button("Clear recent searches").click(); });
    expect(container.textContent).not.toContain("Could not clear recent searches. Please try again.");
    expect(container.textContent).toContain("No recent searches on this device.");
  });

  it("shows unavailable recent history instead of claiming absence when storage cannot be read", async () => {
    const key = "fr:recent-search:v2";
    window.localStorage.setItem(key, JSON.stringify({ source: "submitted-on-device", queries: ["private previously submitted phrase"] }));
    await open();
    expect(button("private previously submitted phrase")).toBeDefined();
    await close();
    const originalRead = Storage.prototype.getItem;
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(function (this: Storage, name: string) {
      if (name === key) throw new DOMException("Storage blocked", "SecurityError");
      return originalRead.call(this, name);
    });
    await open();
    expect(container.textContent).toContain("Recent searches are unavailable on this device.");
    expect(container.textContent).not.toContain("No recent searches on this device.");
    expect(container.textContent).not.toContain("private previously submitted phrase");
    expect([...container.querySelectorAll("button")].some((node) => node.getAttribute("aria-label") === "Clear recent searches")).toBe(false);
  });

  it("still opens the submitted destination when optional history cannot be written", async () => {
    const originalSet = Storage.prototype.setItem;
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(function (this: Storage, name: string, value: string) {
      if (name === "fr:recent-search:v2") throw new DOMException("Storage full", "QuotaExceededError");
      originalSet.call(this, name, value);
    });
    await open();
    await type("xqzvwmblorp");
    await settle();
    await act(async () => { input().dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true })); });
    expect(navigation.leaveTo).toHaveBeenCalledWith("/places/fixture");
    expect(container.querySelector('[role="dialog"]')).toBeNull();
    expect(window.localStorage.getItem("fr:recent-search:v2")).toBeNull();
  });

  it("refetches the same words using the current area cookie after scope changes", async () => {
    const scopes: string[] = [];
    fetchMock.mockImplementation(async () => {
      const brunswick = document.cookie.includes("fr_scope=town%3Abrunswick");
      scopes.push(brunswick ? "Brunswick" : "Whole county");
      return response(brunswick ? "Brunswick fixture result" : "County fixture result", scopes.at(-1));
    });
    await open();
    await type("coffee");
    await settle();
    expect(container.textContent).toContain("County fixture result");
    await close();
    document.cookie = "fr_scope=town%3Abrunswick; path=/";
    await open();
    expect(input().value).toBe("coffee");
    expect(container.textContent).not.toContain("County fixture result");
    await settle();
    expect(scopes).toEqual(["Whole county", "Brunswick"]);
    expect(container.textContent).toContain("Brunswick fixture result");
    expect(container.textContent).toContain("Coffee · Brunswick");
  });

  it("keeps a restored failed request recoverable without showing the previous results as current", async () => {
    fetchMock.mockResolvedValueOnce(response("Earlier fixture result"))
      .mockResolvedValueOnce(new Response("Unavailable", { status: 503 }))
      .mockResolvedValueOnce(response("Recovered fixture result"));
    await open();
    await type("coffee");
    await settle();
    await close();
    await open();
    await settle();
    expect(input().value).toBe("coffee");
    expect(container.textContent).toContain("Search is unavailable right now.");
    expect(container.textContent).not.toContain("Earlier fixture result");
    await act(async () => { button("Try again").click(); });
    await settle();
    expect(container.textContent).toContain("Recovered fixture result");
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it.each(["success", "failure"])("ignores a superseded body that finishes with %s after cancellation", async (outcome) => {
    let finish!: (value: ReturnType<typeof payload>) => void;
    let fail!: (reason: Error) => void;
    const body = new Promise<ReturnType<typeof payload>>((resolve, reject) => { finish = resolve; fail = reject; });
    fetchMock.mockResolvedValueOnce({ ok: true, json: () => body } as Response)
      .mockResolvedValueOnce(response("New query fixture result"));
    await open();
    await type("coffee");
    await settle();
    const oldSignal = fetchMock.mock.calls[0][1]?.signal;
    await type("pizza");
    await settle();
    expect(oldSignal?.aborted).toBe(true);
    expect(container.textContent).toContain("New query fixture result");
    await act(async () => {
      if (outcome === "success") finish(payload("Old query fixture result"));
      else fail(new Error("Delayed body failure"));
    });
    expect(container.textContent).toContain("New query fixture result");
    expect(container.textContent).not.toContain("Old query fixture result");
    expect(container.textContent).not.toContain("Search is unavailable right now.");
  });

  it("aborts a dismissed request and leaves the reopened search to its new response", async () => {
    let finish!: (value: ReturnType<typeof payload>) => void;
    const body = new Promise<ReturnType<typeof payload>>((resolve) => { finish = resolve; });
    fetchMock.mockResolvedValueOnce({ ok: true, json: () => body } as Response)
      .mockResolvedValueOnce(response("Reopened fixture result"));
    await open();
    await type("coffee");
    await settle();
    const oldSignal = fetchMock.mock.calls[0][1]?.signal;
    await close();
    expect(oldSignal?.aborted).toBe(true);
    await open();
    await settle();
    await act(async () => { finish(payload("Dismissed fixture result")); });
    expect(container.querySelectorAll('[role="dialog"]')).toHaveLength(1);
    expect(container.textContent).toContain("Reopened fixture result");
    expect(container.textContent).not.toContain("Dismissed fixture result");
  });

  it("restores a question for editing without submitting it or starting a search request", async () => {
    window.sessionStorage.setItem(DRAFT_KEY, "What can I do with my family tonight?");
    await open();
    await settle();
    expect(input().value).toBe("What can I do with my family tonight?");
    expect(container.textContent).toContain("Get an answer");
    expect(fetchMock).not.toHaveBeenCalled();
    expect(track).not.toHaveBeenCalledWith("command_submit", expect.anything());
    expect(navigation.push).not.toHaveBeenCalled();
    expect(window.location.pathname).toBe("/events");
  });

  it.each(["pizza", ""])("reads the tab's newer draft '%s' when a preserved header reopens Find", async (latest) => {
    await open();
    await type("coffee");
    await close();
    // Model returning to a BFCache-preserved header after another document
    // in this same tab changes its shared session storage. Do not remount.
    if (latest) window.sessionStorage.setItem(DRAFT_KEY, latest);
    else window.sessionStorage.removeItem(DRAFT_KEY);
    await open();
    expect(input().value).toBe(latest);
    if (!latest) expect(container.textContent).toContain("Useful now");
  });

  it("keeps a newer memory draft when a quota failure leaves older storage readable", async () => {
    window.sessionStorage.setItem(DRAFT_KEY, "coffee");
    await open();
    expect(input().value).toBe("coffee");
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("Storage full", "QuotaExceededError");
    });
    await type("pizza");
    await close();
    expect(window.sessionStorage.getItem(DRAFT_KEY)).toBe("coffee");
    await open();
    expect(input().value).toBe("pizza");
    // A successful remove also clears the dirty state and the older value.
    await act(async () => { button("Clear search").click(); });
    await close();
    await open();
    expect(input().value).toBe("");
    expect(window.sessionStorage.getItem(DRAFT_KEY)).toBeNull();
  });

  it("preserves editing, close and clear in memory when session storage is blocked", async () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => { throw new Error("Storage blocked"); });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("Storage blocked"); });
    vi.spyOn(Storage.prototype, "removeItem").mockImplementation(() => { throw new Error("Storage blocked"); });
    await open();
    await type("coffee");
    await close();
    await open();
    expect(input().value).toBe("coffee");
    await act(async () => { button("Clear search").click(); });
    await close();
    await open();
    expect(input().value).toBe("");
  });
});
