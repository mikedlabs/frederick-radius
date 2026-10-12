// @vitest-environment jsdom
// @vitest-environment-options {"url":"https://frederickradius.app/ask"}

import { act, type AnchorHTMLAttributes } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { APP_UPDATE_ACCEPTED_EVENT } from "@/lib/pwa-display";
import {
  ASK_RETURN_TTL_MS,
  historyStateWithAskReturn,
  writeAskReturnSnapshot,
  writeAskUpdateDraft,
} from "@/lib/ask/return-state";

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
vi.mock("@/hooks/useFollows", () => ({ useFollowedSlugs: () => ({ slugs: harness.slugs }) }));
vi.mock("@/hooks/useGeolocation", () => ({
  readCachedPosition: () => null,
  useGeolocation: () => ({ state: harness.state, requestIfGranted: harness.requestIfGranted }),
}));
vi.mock("@/lib/track", () => ({ track: vi.fn() }));
vi.mock("@/lib/haptics", () => ({ haptic: vi.fn() }));
vi.mock("@/lib/motion", () => ({ prefersReducedMotion: () => true }));

import AskFrederick from "./AskFrederick";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const key = "fr:ask:update-draft:v1";
const fetchMock = vi.fn<typeof fetch>();
let root: Root;
let container: HTMLDivElement;

function answer(text: string) {
  return Response.json({ status: "matches", configured: true, usedModel: false, answer: text, sources: [] });
}
function field() {
  const input = container.querySelector<HTMLTextAreaElement>('textarea[aria-label="Ask Radius"]');
  if (!input) throw new Error("Ask composer is missing");
  return input;
}
async function type(words: string) {
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!.call(field(), words);
    field().dispatchEvent(new Event("input", { bubbles: true }));
  });
}
async function mount(question = "") {
  await act(async () => { root.render(<AskFrederick mode="workspace" initialQuery={question} initialScope="county" />); });
}
async function remount(question = "") {
  await act(async () => root.unmount());
  root = createRoot(container);
  await mount(question);
}

beforeEach(() => {
  vi.clearAllMocks();
  window.localStorage.clear();
  window.sessionStorage.clear();
  window.history.replaceState({ __NA: true, tree: ["ask"] }, "", "/ask");
  document.cookie = "fr_scope=county; path=/";
  fetchMock.mockReset().mockResolvedValue(answer("Initial answer."));
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

describe("Ask draft handoff through the mounted workspace", () => {
  it("restores unsubmitted words without submitting them or saving extra state", async () => {
    await mount();
    const words = "What can we do together this weekend?";
    await type(words);
    expect(window.sessionStorage.getItem(key)).toBeNull();
    const history = window.history.state;
    await act(async () => window.dispatchEvent(new Event(APP_UPDATE_ACCEPTED_EVENT)));
    const retained = JSON.parse(window.sessionStorage.getItem(key)!);
    expect(retained).toEqual({ version: 1, savedAt: expect.any(Number), question: "", draft: words });
    expect(window.history.state).toEqual(history);
    await remount();
    expect(field().value).toBe(words);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(window.sessionStorage.getItem(key)).toBeNull();
    await remount();
    expect(field().value).toBe("");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each(["edited", "cleared"])("keeps %s words after the submitted answer rehydrates from the network", async (kind) => {
    const question = `What events are happening tonight? ${kind}`;
    const words = kind === "edited" ? "Can you find something indoors instead?" : "";
    window.history.replaceState(window.history.state, "", `/ask?q=${encodeURIComponent(question)}`);
    await mount(question);
    expect(container.textContent).toContain("Initial answer.");
    await type(words);
    await act(async () => window.dispatchEvent(new Event(APP_UPDATE_ACCEPTED_EVENT)));
    expect(JSON.parse(window.sessionStorage.getItem(key)!)).toEqual({
      version: 1, savedAt: expect.any(Number), question, draft: words,
    });

    // A real reload loses the module cache. Expire it here and hold the new
    // response so both the loading state and settled answer exercise restore.
    vi.spyOn(Date, "now").mockReturnValue(Date.now() + 60_000);
    let complete: (response: Response) => void = () => {};
    fetchMock.mockReturnValueOnce(new Promise<Response>((resolve) => { complete = resolve; }));
    await remount(question);
    expect(field().value).toBe(words);
    expect(field().readOnly).toBe(true);
    await act(async () => complete(answer("Rehydrated answer after the update.")));
    expect(field().value).toBe(words);
    expect(field().readOnly).toBe(false);
    expect(container.textContent).toContain("Rehydrated answer after the update.");
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const posted = JSON.parse(fetchMock.mock.calls[1][1]!.body as string);
    expect(posted.query).toBe(question);
    expect(window.sessionStorage.getItem(key)).toBeNull();
    expect(new URLSearchParams(window.location.search).get("q")).toBe(question);
  });

  it.each(["malformed", "stale", "mismatched"])("ignores %s retained words in the real workspace", async (kind) => {
    const question = `What events are happening tonight? ${kind}`;
    window.history.replaceState(window.history.state, "", `/ask?q=${encodeURIComponent(question)}`);
    if (kind === "malformed") window.sessionStorage.setItem(key, "not json");
    else writeAskUpdateDraft(
      window.sessionStorage,
      "Words that must not restore",
      kind === "mismatched" ? "Another question" : question,
      kind === "stale" ? Date.now() - ASK_RETURN_TTL_MS - 1 : Date.now(),
    );
    await mount(question);
    expect(field().value).toBe(question);
    expect(container.textContent).toContain("Initial answer.");
    expect(window.sessionStorage.getItem(key)).toBeNull();
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("keeps the update usable when tab storage writes and reads are blocked", async () => {
    await mount();
    await type("Words in a private tab");
    const write = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("blocked write"); });
    await act(async () => {
      expect(() => window.dispatchEvent(new Event(APP_UPDATE_ACCEPTED_EVENT))).not.toThrow();
    });
    expect(field().value).toBe("Words in a private tab");
    write.mockRestore();
    expect(window.sessionStorage.getItem(key)).toBeNull();
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => { throw new Error("blocked read"); });
    await remount();
    expect(field().value).toBe("");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("removes the handoff listener with the workspace", async () => {
    await mount();
    await type("Unsubmitted words");
    await act(async () => root.unmount());
    root = createRoot(container);
    window.dispatchEvent(new Event(APP_UPDATE_ACCEPTED_EVENT));
    expect(window.sessionStorage.getItem(key)).toBeNull();
  });

  it("keeps newer words when an earlier source-return answer is restored", async () => {
    const question = "What events are happening tonight? source return";
    const sourceKey = "fr:ask:return:v1:update-source-return";
    writeAskReturnSnapshot(window.sessionStorage, {
      version: 1,
      id: "update-source-return",
      savedAt: Date.now(),
      query: question,
      draft: question,
      submittedQuery: question,
      permalinkQuery: question,
      result: { status: "matches", configured: true, usedModel: false, answer: "Existing source-return answer.", sources: [] },
      requestFailure: null,
      showAllSources: false,
      scope: "county",
      scrollY: 0,
      clickedSourceIndex: null,
    });
    window.history.replaceState(historyStateWithAskReturn(window.history.state, "update-source-return"), "", `/ask?q=${encodeURIComponent(question)}`);
    await mount(question);
    expect(container.textContent).toContain("Existing source-return answer.");
    const oldSnapshot = window.sessionStorage.getItem(sourceKey);
    await type("Could you include something indoors?");
    await act(async () => window.dispatchEvent(new Event(APP_UPDATE_ACCEPTED_EVENT)));
    expect(window.sessionStorage.getItem(sourceKey)).toBe(oldSnapshot);
    await remount(question);
    expect(field().value).toBe("Could you include something indoors?");
    expect(container.textContent).toContain("Existing source-return answer.");
    expect(fetchMock).not.toHaveBeenCalled();
    expect(window.sessionStorage.getItem(sourceKey)).toBe(oldSnapshot);
    expect(window.sessionStorage.getItem(key)).toBeNull();
  });

});
