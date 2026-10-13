// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { consumeNativeReturnFocus, getNativeReturn, installNativeReturnOwner, NATIVE_REQUEST_ENTRY_KEY, rememberNativeRequest, replaceNativeWorkspaceScope } from "./native-request-return";

let release: () => void;
let nativeReplace: History["replaceState"];
const base = { __NA: true, __PRIVATE_NEXTJS_INTERNALS_TREE: { exact: "Next tree" }, custom: { keep: true }, frToolDeck: true };
function pop(state: unknown, url: string) {
  nativeReplace.call(window.history, state, "", url);
  window.dispatchEvent(new PopStateEvent("popstate", { state }));
}
beforeEach(() => {
  nativeReplace = window.history.replaceState;
  nativeReplace.call(window.history, base, "", "/search?in=brunswick#results");
  release = installNativeReturnOwner();
});
afterEach(() => { release(); vi.restoreAllMocks(); });

describe("owned native history entries", () => {
  it("preserves all other fields and restores full editing words only on a matching pop", () => {
    const words = "  coffee & tea / near the creek  ";
    rememberNativeRequest({ draft: { kind: "search", query: words }, target: "search-input" });
    const saved = window.history.state;
    expect(saved).toMatchObject(base);
    expect(getNativeReturn()).toBeNull();
    window.history.pushState({ ...saved }, "", "/search?q=coffee&in=brunswick");
    expect(window.history.state[NATIVE_REQUEST_ENTRY_KEY]).toBeUndefined();
    pop(saved, "/search?in=brunswick#results");
    expect(getNativeReturn()?.entry.draft?.query).toBe(words);
    expect(getNativeReturn()?.entry.target).toBe("search-input");
    consumeNativeReturnFocus(getNativeReturn()!);
    expect(window.history.state).toMatchObject(base);
    expect(window.history.state[NATIVE_REQUEST_ENTRY_KEY].target).toBeUndefined();
    expect(window.history.state[NATIVE_REQUEST_ENTRY_KEY].draft.query).toBe(words);
  });
  it.each(["/search?in=brunswick#results", "/search?q=other"])('does not inherit copied metadata on a new push to %s', (url) => {
    rememberNativeRequest({ draft: { kind: "search", query: "private draft" }, target: "search-input" });
    const saved = window.history.state;
    pop(saved, "/search?in=brunswick#results");
    expect(getNativeReturn()).not.toBeNull();
    window.history.pushState(saved, "", url);
    expect(getNativeReturn()).toBeNull();
    expect(window.history.state[NATIVE_REQUEST_ENTRY_KEY]).toBeUndefined();
    expect(window.history.state).toMatchObject(base);
    pop(window.history.state, url);
    expect(getNativeReturn()).toBeNull();
  });
  it.each(["/search?in=county#results", "/search?in=brunswick#other", "/compass?in=brunswick#results"])('rejects an entry copied to different path/query/hash %s', (url) => {
    rememberNativeRequest({ draft: { kind: "search", query: "coffee" } });
    pop(window.history.state, url);
    expect(getNativeReturn()).toBeNull();
  });
  it("leaves cold arrival metadata inert and honors an explicitly cleared draft", () => {
    rememberNativeRequest({ draft: { kind: "search", query: "coffee" } });
    release(); release = installNativeReturnOwner();
    expect(getNativeReturn()).toBeNull();
    rememberNativeRequest({ draft: { kind: "search", query: "" } });
    const cleared = window.history.state;
    window.history.pushState({}, "", "/search?q=other");
    pop(cleared, "/search?in=brunswick#results");
    expect(getNativeReturn()?.entry.draft?.query).toBe("");
  });
  it.each(["pointerdown", "keydown", "wheel", "touchstart"])('cancels a pending return when a new %s intent arrives', (name) => {
    rememberNativeRequest({ target: "tools-opener" });
    pop(window.history.state, "/search?in=brunswick#results");
    window.dispatchEvent(new Event(name));
    expect(getNativeReturn()).toBeNull();
  });
  it("leaves existing reversible Find layer dismissal in charge of focus", () => {
    rememberNativeRequest({ target: "tools-opener" });
    const destination = window.history.state;
    window.history.pushState({ ...destination, __frederickRadiusLayer: "existing-find" }, "", window.location.href);
    pop(destination, "/search?in=brunswick#results");
    expect(getNativeReturn()).toBeNull();
  });
  it("observes layer dismissal before an earlier Next-like bubble listener replaces state", () => {
    release();
    const frameworkPop = (event: PopStateEvent) => window.history.replaceState(event.state, "", window.location.href);
    window.addEventListener("popstate", frameworkPop);
    release = installNativeReturnOwner();
    try {
      rememberNativeRequest({ target: "tools-opener" });
      const destination = window.history.state;
      window.history.pushState({ ...destination, __frederickRadiusLayer: "existing-find" }, "", window.location.href);
      pop(destination, "/search?in=brunswick#results");
      expect(getNativeReturn()).toBeNull();
    } finally { window.removeEventListener("popstate", frameworkPop); }
  });
  it("bounds optional metadata without truncating the supplied input or reviving old words", () => {
    rememberNativeRequest({ draft: { kind: "search", query: "old" } });
    const draft = { kind: "search" as const, query: "x".repeat(4097) };
    rememberNativeRequest({ draft, target: "search-input" });
    expect(draft.query).toHaveLength(4097);
    expect(window.history.state[NATIVE_REQUEST_ENTRY_KEY].draft).toBeUndefined();
    expect(window.history.state[NATIVE_REQUEST_ENTRY_KEY].target).toBe("search-input");
  });
  it("makes optional history failure harmless to callers", () => {
    vi.spyOn(window.history, "replaceState").mockImplementation(() => { throw new DOMException("Blocked", "SecurityError"); });
    expect(() => rememberNativeRequest({ draft: { kind: "search", query: "coffee" } })).not.toThrow();
  });
  it("preserves same-workspace identity and custom state while permitting Next to sync scope", () => {
    rememberNativeRequest({ draft: { kind: "tools", query: "coffee & tea" }, target: "tool-filter" });
    const id = window.history.state[NATIVE_REQUEST_ENTRY_KEY].id;
    // The real Next adapter reattaches these internals; the caller must not
    // supply its loop marker or it will suppress useSearchParams updates.
    const current = window.history.state;
    const nextAdapter = vi.spyOn(window.history, "replaceState").mockImplementation((data, unused, url) => {
      expect(data.__NA).toBeUndefined(); expect(data._N).toBeUndefined();
      nativeReplace.call(window.history, { ...data, __NA: current.__NA, __PRIVATE_NEXTJS_INTERNALS_TREE: current.__PRIVATE_NEXTJS_INTERNALS_TREE }, unused, url);
    });
    replaceNativeWorkspaceScope("/search?in=thurmont#results");
    expect(nextAdapter).toHaveBeenCalledOnce();
    expect(window.history.state).toMatchObject(base);
    expect(window.history.state[NATIVE_REQUEST_ENTRY_KEY]).toMatchObject({ id, href: "/search?in=thurmont#results", draft: { query: "coffee & tea" } });
  });
});
