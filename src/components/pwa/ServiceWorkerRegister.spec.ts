// @vitest-environment jsdom
// @vitest-environment-options {"url":"https://frederickradius.app/today"}

import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { APP_UPDATE_ACCEPTED_EVENT } from "@/lib/pwa-display";
import ServiceWorkerRegister, {
  UPDATE_PROMPT_DURATION_MS,
  UPDATE_PROMPT_SNOOZE_MS,
  requestFairOfflineWarm,
  shouldReloadForAcceptedUpdate,
  shouldOfferUpdatePrompt,
  shouldWarmFairOffline,
  updatePromptPresentation,
} from "./ServiceWorkerRegister";

const { toastMock } = vi.hoisted(() => ({
  toastMock: Object.assign(vi.fn<(...args: unknown[]) => string>(() => "update"), {
    dismiss: vi.fn(),
  }),
}));

vi.mock("next/navigation", () => ({ usePathname: () => "/today" }));
vi.mock("sonner", () => ({ toast: toastMock }));

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

class MockWorker extends EventTarget {
  postMessage = vi.fn();

  constructor(public state: ServiceWorkerState = "activated") {
    super();
  }
}

class MockRegistration extends EventTarget {
  active: MockWorker | null = null;
  waiting: MockWorker | null = null;
  installing: MockWorker | null = null;
  update = vi.fn().mockResolvedValue(undefined);
}

describe("service-worker update prompt lifecycle", () => {
  let root: Root;
  let element: HTMLDivElement;
  let registration: MockRegistration;
  let originalWindow: Window & typeof globalThis;
  let reload: ReturnType<typeof vi.fn>;
  type WorkerContainer = EventTarget & {
    controller: MockWorker | null;
    register: ReturnType<typeof vi.fn>;
    ready: Promise<MockRegistration>;
  };

  // Model each document's own controller, tab storage, and reload boundary.
  const useClient = (container: WorkerContainer, storage: Pick<Storage, "getItem" | "setItem" | "removeItem" | "clear">, refresh: ReturnType<typeof vi.fn>) => {
    vi.stubGlobal("navigator", { serviceWorker: container });
    vi.stubGlobal("window", new Proxy(originalWindow, {
      get(target, key) {
        if (key === "sessionStorage") return storage;
        if (key === "location") return {
          hostname: originalWindow.location.hostname,
          pathname: originalWindow.location.pathname,
          search: originalWindow.location.search,
          reload: refresh,
        };
        return Reflect.get(target, key, target);
      },
    }));
  };

  const options = (index = toastMock.mock.calls.length - 1) => toastMock.mock.calls[index][1] as {
    action: { onClick: () => void };
    cancel: { onClick: () => void };
  };
  let workers: EventTarget & {
    controller: MockWorker | null;
    register: ReturnType<typeof vi.fn>;
    ready: Promise<MockRegistration>;
  };

  beforeEach(() => {
    vi.clearAllMocks();
    window.sessionStorage.clear();
    vi.spyOn(document, "readyState", "get").mockReturnValue("complete");
    vi.spyOn(document, "visibilityState", "get").mockReturnValue("visible");
    originalWindow = window;
    reload = vi.fn();
    vi.stubGlobal("matchMedia", vi.fn(() => ({ matches: false })));
    registration = new MockRegistration();
    workers = Object.assign(new EventTarget(), {
      controller: null as MockWorker | null,
      register: vi.fn().mockResolvedValue(registration),
      ready: Promise.resolve(registration),
    });
    useClient(workers, originalWindow.sessionStorage, reload);
    element = document.createElement("div");
    root = createRoot(element);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    window.sessionStorage.clear();
  });

  const mount = async () => {
    await act(async () => root.render(createElement(ServiceWorkerRegister)));
    expect(workers.register).toHaveBeenCalledWith("/sw.js");
  };

  const install = (worker: MockWorker) => {
    registration.installing = worker;
    registration.dispatchEvent(new Event("updatefound"));
    registration.installing = null;
    registration.waiting = worker;
    worker.state = "installed";
    worker.dispatchEvent(new Event("statechange"));
  };

  it("keeps a fresh profile quiet when a controller appears during registration", async () => {
    const older = new MockWorker();
    registration.waiting = new MockWorker("installed");
    workers.register.mockImplementation(async () => {
      workers.controller = older;
      registration.active = older;
      return registration;
    });

    await mount();

    expect(toastMock).not.toHaveBeenCalled();
  });

  it("keeps the first installation quiet after another tab claims the page", async () => {
    await mount();
    const claimed = new MockWorker();
    workers.controller = claimed;
    registration.active = claimed;

    install(new MockWorker("installing"));

    expect(toastMock).not.toHaveBeenCalled();
  });

  it("does not promote a controller claim during the initial updatefound cycle into an update notice", async () => {
    await mount();
    const first = new MockWorker("installing");
    registration.installing = first;
    registration.dispatchEvent(new Event("updatefound"));
    const claimed = new MockWorker();
    registration.active = claimed;
    workers.controller = claimed;
    workers.dispatchEvent(new Event("controllerchange"));
    registration.installing = null;
    registration.waiting = first;
    first.state = "installed";
    first.dispatchEvent(new Event("statechange"));
    expect(toastMock).not.toHaveBeenCalled();
  });

  it.each(["activating", "activated"] as const)("offers a later update after the first install claims a long-lived page while %s", async (state) => {
    await mount();
    const first = new MockWorker("installing");
    install(first);
    expect(toastMock).not.toHaveBeenCalled();

    registration.waiting = null;
    registration.active = first;
    first.state = state;
    workers.controller = first;
    workers.dispatchEvent(new Event("controllerchange"));
    expect(toastMock).not.toHaveBeenCalled();

    first.state = "activated";
    install(new MockWorker("installing"));
    expect(toastMock).toHaveBeenCalledOnce();
  });

  it("keeps registration quiet but remembers an already settled first controller for later updates", async () => {
    const first = new MockWorker();
    workers.register.mockImplementation(async () => {
      workers.controller = first;
      registration.active = first;
      return registration;
    });
    await mount();
    expect(toastMock).not.toHaveBeenCalled();

    install(new MockWorker("installing"));
    expect(toastMock).toHaveBeenCalledOnce();
  });

  it("offers a distinct waiting update over the previously active controller", async () => {
    const older = new MockWorker();
    const newer = new MockWorker("installed");
    workers.controller = older;
    registration.active = older;
    registration.waiting = newer;

    await mount();

    expect(toastMock).toHaveBeenCalledOnce();
    expect(toastMock).toHaveBeenCalledWith(
      "A new version is ready",
      expect.objectContaining({
        action: expect.objectContaining({ label: "Refresh" }),
        cancel: expect.objectContaining({ label: "Later" }),
      }),
    );
    const options = toastMock.mock.calls[0][1] as {
      action: { onClick: () => void };
    };
    expect(newer.postMessage).not.toHaveBeenCalled();
    options.action.onClick();
    expect(newer.postMessage).toHaveBeenCalledWith({ type: "SKIP_WAITING" });
  });

  it("offers a newly installed update while the original controller remains active", async () => {
    const older = new MockWorker();
    workers.controller = older;
    registration.active = older;
    await mount();

    install(new MockWorker("installing"));

    expect(toastMock).toHaveBeenCalledOnce();
  });

  it("ignores installed workers that are no longer waiting", async () => {
    const older = new MockWorker();
    workers.controller = older;
    registration.active = older;
    await mount();
    const newer = new MockWorker("installing");
    registration.installing = newer;
    registration.dispatchEvent(new Event("updatefound"));
    registration.installing = null;
    newer.state = "installed";
    newer.dispatchEvent(new Event("statechange"));

    expect(toastMock).not.toHaveBeenCalled();
  });

  it("ignores an update once a different controller has already taken over", async () => {
    const older = new MockWorker();
    workers.controller = older;
    registration.active = older;
    await mount();
    const current = new MockWorker();
    workers.controller = current;
    registration.active = current;

    install(new MockWorker("installing"));

    expect(toastMock).not.toHaveBeenCalled();
  });

  it("requires the older controller to belong to this registration", async () => {
    workers.controller = new MockWorker();
    registration.active = new MockWorker();
    registration.waiting = new MockWorker("installed");

    await mount();

    expect(toastMock).not.toHaveBeenCalled();
  });

  it.each(["missed", "Later"])("reoffers the same waiting worker on return after %s", async (choice) => {
    const now = Date.now();
    const clock = vi.spyOn(Date, "now").mockReturnValue(now);
    const older = new MockWorker();
    const newer = new MockWorker("installed");
    workers.controller = older;
    registration.active = older;
    registration.waiting = newer;
    await mount();
    if (choice === "Later") options().cancel.onClick();

    clock.mockReturnValue(now + UPDATE_PROMPT_SNOOZE_MS - 1);
    await act(async () => window.dispatchEvent(new Event("focus")));
    expect(toastMock).toHaveBeenCalledOnce();

    clock.mockReturnValue(now + UPDATE_PROMPT_SNOOZE_MS);
    await act(async () => document.dispatchEvent(new Event("visibilitychange")));
    expect(toastMock).toHaveBeenCalledTimes(2);
    expect(registration.waiting).toBe(newer);
    expect(newer.postMessage).not.toHaveBeenCalled();
    await act(async () => window.dispatchEvent(new Event("focus")));
    expect(toastMock).toHaveBeenCalledTimes(2);
    options().action.onClick();
    expect(newer.postMessage).toHaveBeenCalledExactlyOnceWith({ type: "SKIP_WAITING" });
  });

  it("does not spend the reminder while hidden and offers it on visible return", async () => {
    vi.spyOn(document, "visibilityState", "get").mockReturnValue("hidden");
    const older = new MockWorker();
    workers.controller = older;
    registration.active = older;
    registration.waiting = new MockWorker("installed");
    await mount();
    await act(async () => window.dispatchEvent(new Event("focus")));
    expect(toastMock).not.toHaveBeenCalled();
    expect(registration.update).not.toHaveBeenCalled();
    expect(window.sessionStorage.getItem("fr.update-prompt-presented-at.v1")).toBeNull();

    vi.spyOn(document, "visibilityState", "get").mockReturnValue("visible");
    await act(async () => document.dispatchEvent(new Event("visibilitychange")));
    expect(toastMock).toHaveBeenCalledOnce();
    expect(registration.update).toHaveBeenCalledOnce();
  });

  it("keeps a second document's upgrade explicit after the first document accepts", async () => {
    const older = new MockWorker();
    const newer = new MockWorker("installed");
    workers.controller = older;
    registration.active = older;
    registration.waiting = newer;
    await mount();
    const firstAction = options().action.onClick;

    const secondRegistration = new MockRegistration();
    const secondOlder = new MockWorker();
    const secondNewer = new MockWorker("installed");
    secondRegistration.active = secondOlder;
    secondRegistration.waiting = secondNewer;
    const secondWorkers: WorkerContainer = Object.assign(new EventTarget(), {
      controller: secondOlder as MockWorker | null,
      register: vi.fn().mockResolvedValue(secondRegistration),
      ready: Promise.resolve(secondRegistration),
    });
    const values = new Map<string, string>();
    const secondStorage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => { values.set(key, value); },
      removeItem: (key: string) => { values.delete(key); },
      clear: () => { values.clear(); },
    };
    const secondReload = vi.fn();
    const secondRoot = createRoot(document.createElement("div"));
    useClient(secondWorkers, secondStorage, secondReload);
    try {
      await act(async () => secondRoot.render(createElement(ServiceWorkerRegister)));
      expect(toastMock).toHaveBeenCalledTimes(2);
      const secondWaitingAction = options().action.onClick;

      useClient(workers, originalWindow.sessionStorage, reload);
      firstAction();
      expect(newer.postMessage).toHaveBeenCalledExactlyOnceWith({ type: "SKIP_WAITING" });
      registration.active = newer;
      registration.waiting = null;
      workers.controller = newer;
      newer.state = "activated";
      workers.dispatchEvent(new Event("controllerchange"));
      expect(reload).toHaveBeenCalledOnce();

      useClient(secondWorkers, secondStorage, secondReload);
      secondRegistration.active = secondNewer;
      secondRegistration.waiting = null;
      secondWorkers.controller = secondNewer;
      secondNewer.state = "activated";
      secondWorkers.dispatchEvent(new Event("controllerchange"));
      expect(secondReload).not.toHaveBeenCalled();
      expect(toastMock).toHaveBeenCalledTimes(3);
      // Both the replaced notice and its replacement remain safe to activate.
      secondWaitingAction();
      options().action.onClick();
      secondWorkers.dispatchEvent(new Event("controllerchange"));
      expect(secondReload).toHaveBeenCalledOnce();
      expect(secondNewer.postMessage).not.toHaveBeenCalled();
    } finally {
      await act(async () => secondRoot.unmount());
      useClient(workers, originalWindow.sessionStorage, reload);
    }
  });

  it("honors Later when another tab activates and offers a document refresh after return", async () => {
    const now = Date.now();
    const clock = vi.spyOn(Date, "now").mockReturnValue(now);
    const older = new MockWorker();
    const newer = new MockWorker("installed");
    workers.controller = older;
    registration.active = older;
    registration.waiting = newer;
    await mount();
    options().cancel.onClick();
    registration.active = newer;
    registration.waiting = null;
    workers.controller = newer;
    newer.state = "activated";
    workers.dispatchEvent(new Event("controllerchange"));
    expect(toastMock).toHaveBeenCalledOnce();
    expect(reload).not.toHaveBeenCalled();
    clock.mockReturnValue(now + UPDATE_PROMPT_SNOOZE_MS);
    await act(async () => window.dispatchEvent(new Event("focus")));
    expect(toastMock).toHaveBeenCalledTimes(2);
    options().action.onClick();
    expect(reload).toHaveBeenCalledOnce();
    expect(newer.postMessage).not.toHaveBeenCalled();
  });

  it("defers another tab's document-refresh notice until this document is visible", async () => {
    const older = new MockWorker();
    workers.controller = older;
    registration.active = older;
    await mount();
    vi.spyOn(document, "visibilityState", "get").mockReturnValue("hidden");
    const newer = new MockWorker();
    workers.controller = newer;
    registration.active = newer;
    workers.dispatchEvent(new Event("controllerchange"));
    expect(toastMock).not.toHaveBeenCalled();
    expect(reload).not.toHaveBeenCalled();
    vi.spyOn(document, "visibilityState", "get").mockReturnValue("visible");
    await act(async () => document.dispatchEvent(new Event("visibilitychange")));
    expect(toastMock).toHaveBeenCalledOnce();
    options().action.onClick();
    expect(reload).toHaveBeenCalledOnce();
    expect(newer.postMessage).not.toHaveBeenCalled();
  });

  it("does not activate a waiting worker superseded after its notice appeared", async () => {
    const older = new MockWorker();
    const stale = new MockWorker("installed");
    workers.controller = older;
    registration.active = older;
    registration.waiting = stale;
    await mount();
    registration.waiting = new MockWorker("installed");
    stale.state = "redundant";
    options().action.onClick();
    expect(stale.postMessage).not.toHaveBeenCalled();
    expect(registration.waiting.postMessage).not.toHaveBeenCalled();
    expect(reload).not.toHaveBeenCalled();
  });

  it("removes registration and in-flight worker listeners when unmounted", async () => {
    const older = new MockWorker();
    workers.controller = older;
    registration.active = older;
    const removeRegistration = vi.spyOn(registration, "removeEventListener");
    await mount();
    const pending = new MockWorker("installing");
    const removeWorker = vi.spyOn(pending, "removeEventListener");
    registration.installing = pending;
    registration.dispatchEvent(new Event("updatefound"));
    await act(async () => root.unmount());
    root = createRoot(element);
    expect(removeRegistration).toHaveBeenCalledWith("updatefound", expect.any(Function));
    expect(removeWorker).toHaveBeenCalledWith("statechange", expect.any(Function));
    pending.state = "installed";
    registration.installing = null;
    registration.waiting = pending;
    pending.dispatchEvent(new Event("statechange"));
    await act(async () => {
      window.dispatchEvent(new Event("focus"));
      document.dispatchEvent(new Event("visibilitychange"));
      registration.dispatchEvent(new Event("updatefound"));
    });
    expect(toastMock).not.toHaveBeenCalled();
    expect(registration.update).not.toHaveBeenCalled();
  });


  it("ignores a registration that resolves after the registrar unmounts", async () => {
    const older = new MockWorker();
    workers.controller = older;
    registration.active = older;
    registration.waiting = new MockWorker("installed");
    let finish: (registration: MockRegistration) => void = () => {};
    workers.register.mockReturnValue(new Promise<MockRegistration>((resolve) => { finish = resolve; }));
    const listen = vi.spyOn(registration, "addEventListener");
    await mount();
    await act(async () => root.unmount());
    root = createRoot(element);
    await act(async () => finish(registration));
    expect(toastMock).not.toHaveBeenCalled();
    expect(listen).not.toHaveBeenCalled();
  });


  it("retains workspace state synchronously before one accepted reload and stays quiet on first install", async () => {
    const retained = vi.fn(() => window.sessionStorage.setItem("workspace-handoff-proof", "retained words"));
    originalWindow.addEventListener(APP_UPDATE_ACCEPTED_EVENT, retained);
    try {
      await mount();
      const first = new MockWorker("installing");
      install(first);
      registration.waiting = null;
      registration.active = first;
      workers.controller = first;
      first.state = "activated";
      workers.dispatchEvent(new Event("controllerchange"));
      expect(toastMock).not.toHaveBeenCalled();
      expect(reload).not.toHaveBeenCalled();
      expect(retained).not.toHaveBeenCalled();

      const newer = new MockWorker("installing");
      install(newer);
      expect(toastMock).toHaveBeenCalledOnce();
      options().action.onClick();
      expect(retained).not.toHaveBeenCalled();
      reload.mockImplementation(() => {
        expect(retained).toHaveBeenCalledOnce();
        expect(window.sessionStorage.getItem("workspace-handoff-proof")).toBe("retained words");
      });
      registration.waiting = null;
      registration.active = newer;
      workers.controller = newer;
      newer.state = "activated";
      workers.dispatchEvent(new Event("controllerchange"));
      workers.dispatchEvent(new Event("controllerchange"));
      expect(reload).toHaveBeenCalledOnce();
      expect(retained).toHaveBeenCalledOnce();
    } finally {
      originalWindow.removeEventListener(APP_UPDATE_ACCEPTED_EVENT, retained);
    }
  });


  it("replaces a previously presented waiting notice on visible return after hidden activation", async () => {
    const now = Date.now();
    const clock = vi.spyOn(Date, "now").mockReturnValue(now);
    const older = new MockWorker();
    const newer = new MockWorker("installed");
    workers.controller = older;
    registration.active = older;
    registration.waiting = newer;
    await mount();
    expect(toastMock).toHaveBeenCalledOnce();
    // The first notice has expired, but the visitor did not choose Later.
    clock.mockReturnValue(now + UPDATE_PROMPT_DURATION_MS + 1);
    vi.spyOn(document, "visibilityState", "get").mockReturnValue("hidden");
    registration.active = newer;
    registration.waiting = null;
    workers.controller = newer;
    newer.state = "activated";
    workers.dispatchEvent(new Event("controllerchange"));
    expect(toastMock).toHaveBeenCalledOnce();
    expect(reload).not.toHaveBeenCalled();
    vi.spyOn(document, "visibilityState", "get").mockReturnValue("visible");
    await act(async () => window.dispatchEvent(new Event("focus")));
    expect(toastMock).toHaveBeenCalledTimes(2);
    await act(async () => window.dispatchEvent(new Event("focus")));
    expect(toastMock).toHaveBeenCalledTimes(2);
    clock.mockReturnValue(now + UPDATE_PROMPT_DURATION_MS + 1 + UPDATE_PROMPT_SNOOZE_MS - 1);
    await act(async () => window.dispatchEvent(new Event("focus")));
    expect(toastMock).toHaveBeenCalledTimes(2);
    options().action.onClick();
    expect(reload).toHaveBeenCalledOnce();
    expect(newer.postMessage).not.toHaveBeenCalled();
  });

});

describe("service-worker update prompt presentation", () => {
  it("moves the prompt away from the map's bottom controls", () => {
    expect(updatePromptPresentation("/map")).toEqual({
      duration: UPDATE_PROMPT_DURATION_MS,
      position: "top-center",
    });
  });

  it("stays above mobile navigation and always expires", () => {
    const presentation = updatePromptPresentation("/today", true);

    expect(presentation.position).toBe("bottom-center");
    expect(Number.isFinite(presentation.duration)).toBe(true);
    expect(presentation.duration).toBeGreaterThanOrEqual(8_000);
  });

  it("moves to a quiet corner on wider screens", () => {
    expect(updatePromptPresentation("/today", false).position).toBe("bottom-right");
  });
});

describe("service-worker controller changes", () => {
  it("never reloads for a fresh first install", () => {
    expect(shouldReloadForAcceptedUpdate(false, false)).toBe(false);
  });

  it("reloads once after the visitor accepts an update", () => {
    expect(shouldReloadForAcceptedUpdate(true, false)).toBe(true);
    expect(shouldReloadForAcceptedUpdate(true, true)).toBe(false);
  });
});

describe("service-worker update prompt snooze", () => {
  it("does not repeat the same waiting update after an in-app navigation", () => {
    const now = Date.parse("2026-08-13T18:00:00Z");
    expect(shouldOfferUpdatePrompt(now - 5_000, null, now)).toBe(false);
  });

  it("offers the waiting update again after the short snooze expires", () => {
    const now = Date.parse("2026-08-13T18:00:00Z");
    expect(
      shouldOfferUpdatePrompt(now - UPDATE_PROMPT_SNOOZE_MS, null, now),
    ).toBe(true);
    expect(shouldOfferUpdatePrompt(null, null, now)).toBe(true);
  });

  it("does not duplicate a prompt already shown for the waiting update", () => {
    const now = Date.parse("2026-08-13T18:00:00Z");
    expect(shouldOfferUpdatePrompt(null, now - 5_000, now)).toBe(false);
    expect(
      shouldOfferUpdatePrompt(null, now - UPDATE_PROMPT_SNOOZE_MS, now),
    ).toBe(true);
  });
});

describe("Fair offline warm-up", () => {
  it.each([
    "/fair",
    "/moments/great-frederick-fair-2026",
  ])("allows the exact query-free Fair route %s", (pathname) => {
    expect(shouldWarmFairOffline(pathname, "")).toBe(true);
  });

  it.each([
    ["/fair", "?day=1"],
    ["/fair/", ""],
    ["/moments/great-frederick-fair-2026/", ""],
    ["/moments/great-frederick-fair-2026/tickets", ""],
    ["/today", ""],
  ])("rejects non-canonical route %s%s", (pathname, search) => {
    expect(shouldWarmFairOffline(pathname, search)).toBe(false);
  });

  it("messages an already-active worker after registration", async () => {
    const postMessage = vi.fn();
    const ready = Promise.resolve({ active: null });

    await expect(
      requestFairOfflineWarm(
        "/fair",
        "",
        { active: { postMessage } },
        { ready },
      ),
    ).resolves.toBe(true);
    expect(postMessage).toHaveBeenCalledWith({ type: "CACHE_FAIR" });
  });

  it("waits for the ready worker on a first install", async () => {
    const postMessage = vi.fn();

    await expect(
      requestFairOfflineWarm(
        "/moments/great-frederick-fair-2026",
        "",
        { active: null },
        { ready: Promise.resolve({ active: { postMessage } }) },
      ),
    ).resolves.toBe(true);
    expect(postMessage).toHaveBeenCalledWith({ type: "CACHE_FAIR" });
  });
});
