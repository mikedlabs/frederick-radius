// @vitest-environment jsdom
import { act, StrictMode, useEffect, useLayoutEffect, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { HISTORY_LAYER_URL_RESTORED, replaceHistoryLayerUrl, useReversibleHistoryLayer } from "./useReversibleHistoryLayer";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const initialUrl = "/events?in=thurmont&lens=weekend";
const editedUrl = `${initialUrl}&free=true`;
const nextState = { __NA: true, tree: ["", "events"], custom: "retained" };
let root: Root, host: HTMLDivElement;
let entries: { href: string; state: unknown }[], index: number;
let nativeReplace: History["replaceState"];
let frames: FrameRequestCallback[];
let observedUrls: string[];
let pendingBack: number;
let api: ReturnType<typeof useReversibleHistoryLayer>;

beforeEach(() => {
  nativeReplace = window.history.replaceState.bind(window.history);
  entries = [{ href: "/today", state: { __NA: true } }, { href: initialUrl, state: nextState }];
  index = 1; frames = []; observedUrls = []; pendingBack = 0;
  nativeReplace(nextState, "", initialUrl);
  vi.spyOn(window.history, "replaceState").mockImplementation((state, unused, url) => {
    entries[index] = { href: String(url ?? window.location.href), state };
    nativeReplace(state, unused, url);
  });
  vi.spyOn(window.history, "pushState").mockImplementation((state, unused, url) => {
    entries.splice(index + 1);
    entries.push({ href: String(url ?? window.location.href), state }); index++;
    nativeReplace(state, unused, url);
  });
  vi.spyOn(window.history, "back").mockImplementation(() => { pendingBack++; });
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => { frames.push(callback); return frames.length; });
  vi.stubGlobal("scrollTo", vi.fn());
  host = document.createElement("div"); document.body.append(host); root = createRoot(host);
});
afterEach(async () => {
  nativeReplace({}, "", "/today");
  await act(async () => root.unmount()); host.remove();
  vi.restoreAllMocks(); vi.unstubAllGlobals();
});

function Fixture({ preserve = true }: { preserve?: boolean }) {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const read = () => observedUrls.push(window.location.pathname + window.location.search);
    window.addEventListener("popstate", read);
    return () => window.removeEventListener("popstate", read);
  }, []);
  const layer = useReversibleHistoryLayer({ active: open, id: "filter-test", preserveUrlOnDismiss: preserve, onDismiss: () => setOpen(false) });
  useLayoutEffect(() => { api = layer; }, [layer]);
  return <><button onClick={() => { if (!layer.isDismissing()) setOpen(true); }}>Open</button>{open && <div role="dialog"><button onClick={layer.dismiss}>Done</button></div>}</>;
}
async function mount(options: { strict?: boolean; preserve?: boolean } = {}) {
  await act(async () => root.render(options.strict ? <StrictMode><Fixture preserve={options.preserve} /></StrictMode> : <Fixture preserve={options.preserve} />));
}
async function open() { await act(async () => host.querySelector<HTMLButtonElement>("button")!.click()); }
async function edit() { await act(async () => replaceHistoryLayerUrl(editedUrl)); }
async function back() {
  await act(async () => {
    pendingBack = Math.max(0, pendingBack - 1); index--;
    nativeReplace(entries[index].state, "", entries[index].href);
    window.dispatchEvent(new PopStateEvent("popstate", { state: entries[index].state }));
  });
}
async function paint() {
  await act(async () => { const callbacks = frames; frames = []; callbacks.forEach(callback => callback(performance.now())); });
}

describe("in-place editor history ownership", () => {
  it("reconciles an earlier pop reader after restoring the editor's latest URL", async () => {
    let free = false;
    const read = () => { free = new URLSearchParams(window.location.search).get("free") === "true"; };
    // Both listeners capture: the earlier route reader necessarily runs first,
    // as the actual integrated Next/Explorer browser failure demonstrated.
    window.addEventListener("popstate", read, true);
    window.addEventListener(HISTORY_LAYER_URL_RESTORED, read);
    try {
      await mount(); await open(); await edit(); await back();
      expect(free).toBe(true);
      expect(window.location.pathname + window.location.search).toBe(editedUrl);
    } finally {
      window.removeEventListener("popstate", read, true);
      window.removeEventListener(HISTORY_LAYER_URL_RESTORED, read);
    }
  });
  it("native Back consumes only the filter entry and commits edits before route listeners read it", async () => {
    await mount(); await open(); await edit();
    expect(index).toBe(2); expect(window.history.state).toMatchObject(nextState);
    await back();
    expect(host.querySelector('[role="dialog"]')).toBeNull();
    expect(window.location.pathname + window.location.search).toBe(editedUrl);
    expect(observedUrls).toEqual([editedUrl]);
    expect(window.history.state).toEqual(nextState);
    expect(index).toBe(1); await back(); expect(window.location.pathname).toBe("/today");
  });

  it("Done retains new filters, dismisses exactly once and leaves no phantom Back stop", async () => {
    await mount(); await open(); await edit();
    await act(async () => { api.dismiss(); api.dismiss(); });
    expect(window.history.back).toHaveBeenCalledTimes(1); expect(pendingBack).toBe(1);
    expect(host.querySelector('[role="dialog"]')).toBeNull();
    await back(); expect(index).toBe(1); expect(observedUrls).toEqual([editedUrl]);
    await back(); expect(window.location.pathname).toBe("/today");
  });

  it("does not reopen onto an unfinished dismissal", async () => {
    await mount(); await open(); await act(async () => api.dismiss());
    await open(); expect(host.querySelector('[role="dialog"]')).toBeNull();
    await back(); await open(); expect(host.querySelector('[role="dialog"]')).not.toBeNull();
    expect(index).toBe(2);
  });

  it("keeps Strict Mode to one layer and removes an abandoned same-page layer once", async () => {
    await mount({ strict: true }); await open(); await edit();
    expect(index).toBe(2); expect(window.history.pushState).toHaveBeenCalledTimes(1);
    await act(async () => root.render(null));
    expect(window.history.back).toHaveBeenCalledTimes(1);
    await back(); expect(index).toBe(1); expect(window.location.search).toContain("free=true");
  });

  it("a dismissal continuation survives unmount without consuming a second entry", async () => {
    await mount(); await open(); await edit();
    await act(async () => { api.dismiss(); root.render(null); });
    expect(window.history.back).toHaveBeenCalledTimes(1);
    await back(); expect(window.location.pathname + window.location.search).toBe(editedUrl);
    expect(index).toBe(1);
  });

  it("does not rewrite different-path navigation or apply old scroll frames there", async () => {
    await mount(); await open(); await edit();
    // A different route wins before this editor's queued scroll restoration.
    await back(); window.history.replaceState({ __NA: true }, "", "/map?in=county");
    await paint(); await paint();
    expect(window.location.pathname + window.location.search).toBe("/map?in=county");
    expect(window.scrollTo).not.toHaveBeenCalled();
  });

  it("leaves explicit different-path native Back untouched", async () => {
    await mount(); await open();
    entries[1] = { href: "/map?in=county", state: { __NA: true } };
    await back(); expect(observedUrls).toEqual(["/map?in=county"]);
    expect(window.location.pathname).toBe("/map"); expect(host.querySelector('[role="dialog"]')).toBeNull();
  });

  it("does not navigate backwards when unmount follows a real route change", async () => {
    await mount(); await open(); window.history.pushState({ __NA: true }, "", "/check-a-date");
    await act(async () => root.render(null));
    expect(window.history.back).not.toHaveBeenCalled(); expect(window.location.pathname).toBe("/check-a-date");
  });

  it("an intentional exit consumes the layer before navigation and retains the edited return URL", async () => {
    await mount(); await open(); await edit();
    const navigate = vi.fn(() => window.history.pushState({ __NA: true }, "", "/check-a-date"));
    await act(async () => api.leave(navigate));
    expect(navigate).not.toHaveBeenCalled(); await back();
    await new Promise(resolve => window.setTimeout(resolve, 0));
    expect(navigate).toHaveBeenCalledOnce(); expect(index).toBe(2);
    await back(); expect(window.location.pathname + window.location.search).toBe(editedUrl);
  });

  it("preserves the default same-URL BottomSheet contract without committing URL edits", async () => {
    await mount({ preserve: false }); await open(); await edit(); await back();
    expect(window.location.pathname + window.location.search).toBe(initialUrl);
    expect(host.querySelector('[role="dialog"]')).toBeNull();
  });
});
