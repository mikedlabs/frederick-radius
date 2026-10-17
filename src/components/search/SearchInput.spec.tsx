// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const navigation = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => navigation }));
import SearchInput from "./SearchInput";
import { installNativeReturnOwner, NATIVE_REQUEST_ENTRY_KEY } from "./native-request-return";

let root: Root;
let host: HTMLDivElement;
let release: () => void;
let nativeReplace: History["replaceState"];
(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
beforeEach(() => {
  vi.useFakeTimers(); navigation.push.mockReset();
  nativeReplace = window.history.replaceState;
  nativeReplace.call(window.history, { __NA: true, unrelated: "kept" }, "", "/search?in=brunswick");
  release = installNativeReturnOwner();
  host = document.createElement("div"); document.body.append(host); root = createRoot(host);
});
afterEach(async () => { await act(async () => root.unmount()); host.remove(); release(); vi.useRealTimers(); vi.restoreAllMocks(); });
async function render(query = "") { await act(async () => root.render(<SearchInput key={query} defaultValue={query} scope="brunswick" returnTo="/today?in=brunswick" />)); }
function input() { return host.querySelector<HTMLInputElement>("input")!; }
async function type(words: string) {
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input(), words);
    input().dispatchEvent(new Event("input", { bubbles: true }));
  });
}
async function pop(state: unknown, href: string) {
  await act(async () => { nativeReplace.call(window.history, state, "", href); window.dispatchEvent(new PopStateEvent("popstate", { state })); });
}
async function frames() { await act(async () => vi.advanceTimersByTimeAsync(50)); }

describe("native Search editing returns", () => {
  it("keeps the original words on actual Back without replaying the URL or submitting", async () => {
    await render(); await type("  coffee & tea  ");
    await act(async () => host.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })));
    expect(navigation.push).toHaveBeenCalledWith("/search?q=coffee+%26+tea&returnTo=%2Ftoday%3Fin%3Dbrunswick&in=brunswick");
    const composer = window.history.state;
    await act(async () => window.history.pushState({ ...composer }, "", "/search?q=coffee+%26+tea&in=brunswick"));
    await render("coffee & tea");
    await pop(composer, "/search?in=brunswick"); await render(); await frames();
    expect(input().value).toBe("  coffee & tea  "); expect(document.activeElement).toBe(input());
    expect(window.location.search).toBe("?in=brunswick"); expect(navigation.push).toHaveBeenCalledTimes(1);
    expect(window.history.state.unrelated).toBe("kept");
  });
  it("uses URL defaults for a new copied-state entry, including the same URL", async () => {
    await render(); await type("private older words"); const composer = window.history.state;
    await act(async () => window.history.pushState(composer, "", window.location.href));
    await act(async () => root.unmount()); root = createRoot(host); await render("new URL words"); await frames();
    expect(input().value).toBe("new URL words"); expect(window.history.state[NATIVE_REQUEST_ENTRY_KEY]).toBeUndefined();
    expect(navigation.push).not.toHaveBeenCalled();
  });
  it("clears its owned draft so Back cannot resurrect the old request", async () => {
    await render(); await type("coffee");
    await act(async () => host.querySelector<HTMLButtonElement>("button")!.click());
    const cleared = window.history.state;
    expect(cleared[NATIVE_REQUEST_ENTRY_KEY].draft.query).toBe("");
    await act(async () => window.history.pushState(cleared, "", "/search?q=other")); await render("other");
    await pop(cleared, "/search?in=brunswick"); await render(); await frames();
    expect(input().value).toBe(""); expect(navigation.push).toHaveBeenCalledTimes(1);
  });
  it("keeps oversized editing and submission intact while optional history omits it", async () => {
    await render(); const words = "x".repeat(4097); await type(words);
    expect(input().value).toBe(words); expect(window.history.state[NATIVE_REQUEST_ENTRY_KEY].draft).toBeUndefined();
    await act(async () => host.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })));
    expect(new URL(navigation.push.mock.calls[0][0], "https://example.test").searchParams.get("q")).toBe(words);
  });
});


describe("Search before hydration", () => {
  it("encodes the edited native GET query with explicit area, result type and return destination from the server markup", () => {
    document.cookie = "fr_scope=town:thurmont; path=/";
    try {
      host.innerHTML = renderToStaticMarkup(<SearchInput defaultValue="old request" scope="county" kind="place" returnTo="/map?q=coffee&in=brunswick" />);
      const form = host.querySelector("form")!;
      expect(form.getAttribute("action")).toBe("/search");
      expect(form.method).toBe("get");
      // No React mount, hydration or submit handler: native successful controls
      // must retain context even when the person edits the visible field first.
      input().value = "  coffee & tea  ";
      const data = new FormData(form);
      expect(Array.from(data.entries())).toEqual([
        ["q", "  coffee & tea  "], ["returnTo", "/map?q=coffee&in=brunswick"], ["in", "county"], ["kind", "place"],
      ]);
      const destination = new URL(form.action);
      destination.search = new URLSearchParams(Array.from(data, ([name, value]) => [name, String(value)])).toString();
      expect(destination.pathname).toBe("/search");
      expect(destination.searchParams.get("q")).toBe("  coffee & tea  ");
      expect(destination.searchParams.get("in")).toBe("county");
      expect(destination.searchParams.get("kind")).toBe("place");
      expect(destination.searchParams.get("returnTo")).toBe("/map?q=coffee&in=brunswick");
      expect(navigation.push).not.toHaveBeenCalled();
    } finally { document.cookie = "fr_scope=; path=/; max-age=0"; }
  });

  it("omits absent context instead of borrowing the current URL or a saved town", () => {
    document.cookie = "fr_scope=town:thurmont; path=/";
    try {
      host.innerHTML = renderToStaticMarkup(<SearchInput defaultValue="events" />);
      expect(Array.from(new FormData(host.querySelector("form")!).entries())).toEqual([["q", "events"]]);
      expect(navigation.push).not.toHaveBeenCalled();
    } finally { document.cookie = "fr_scope=; path=/; max-age=0"; }
  });

  it("keeps hydrated submission trimming and the existing native-request draft while preserving all context", async () => {
    await act(async () => root.render(<SearchInput defaultValue="  coffee & tea  " scope="county" kind="event" returnTo="/map?q=coffee&in=brunswick" />));
    const submit = new Event("submit", { bubbles: true, cancelable: true });
    await act(async () => host.querySelector("form")!.dispatchEvent(submit));
    expect(submit.defaultPrevented).toBe(true);
    expect(navigation.push).toHaveBeenCalledExactlyOnceWith("/search?q=coffee+%26+tea&returnTo=%2Fmap%3Fq%3Dcoffee%26in%3Dbrunswick&in=county&kind=event");
    expect(window.history.state[NATIVE_REQUEST_ENTRY_KEY].draft).toEqual({ kind: "search", query: "  coffee & tea  " });
    expect(window.history.state.unrelated).toBe("kept");
  });
});
