// @vitest-environment jsdom
// @vitest-environment-options {"url":"https://frederickradius.app/today"}

import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
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
  let workers: EventTarget & {
    controller: MockWorker | null;
    register: ReturnType<typeof vi.fn>;
    ready: Promise<MockRegistration>;
  };

  beforeEach(() => {
    vi.clearAllMocks();
    window.sessionStorage.clear();
    vi.spyOn(document, "readyState", "get").mockReturnValue("complete");
    vi.stubGlobal("matchMedia", vi.fn(() => ({ matches: false })));
    registration = new MockRegistration();
    workers = Object.assign(new EventTarget(), {
      controller: null as MockWorker | null,
      register: vi.fn().mockResolvedValue(registration),
      ready: Promise.resolve(registration),
    });
    vi.stubGlobal("navigator", { serviceWorker: workers });
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
