// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
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
