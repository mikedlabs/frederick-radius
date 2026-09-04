// @vitest-environment jsdom

import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getHomeMuni: vi.fn(() => "frederick"),
}));

vi.mock("@/lib/track", () => ({ track: vi.fn() }));
vi.mock("@/lib/personalize", () => ({ getHomeMuni: mocks.getHomeMuni }));
vi.mock("@/lib/pwa-display", () => ({
  isIos: () => false,
  isStandalone: () => false,
}));
vi.mock("@/lib/return-bridge", () => ({ openReturnBridge: vi.fn() }));
vi.mock("@/lib/haptics", () => ({
  haptic: vi.fn(() => false),
  isPhoneFeedbackEnabled: () => true,
  PHONE_FEEDBACK_CHANGE_EVENT: "fr:phone-feedback",
  PHONE_FEEDBACK_STORAGE_KEY: "fr.phone-feedback",
  phoneFeedbackSupport: () => "none",
  setPhoneFeedbackEnabled: vi.fn(),
}));

import NotificationsCard from "./NotificationsCard";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

const unsubscribeExisting = vi.fn(async () => true);

const existingSubscription = {
  endpoint: "https://web.push.apple.com/existing-device",
  toJSON: () => ({
    endpoint: "https://web.push.apple.com/existing-device",
    expirationTime: null,
    keys: { auth: "auth-key", p256dh: "public-key" },
  }),
  unsubscribe: unsubscribeExisting,
};

describe("NotificationsCard existing subscription recovery", () => {
  let container: HTMLDivElement;
  let root: Root;
  let storedValues: Map<string, string>;

  beforeEach(() => {
    unsubscribeExisting.mockClear();
    storedValues = new Map([["fr-device-id", "device-123"]]);
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);

    Object.defineProperty(window, "PushManager", {
      configurable: true,
      value: class PushManager {},
    });
    Object.defineProperty(window, "Notification", {
      configurable: true,
      value: { permission: "granted", requestPermission: vi.fn() },
    });
    Object.defineProperty(navigator, "serviceWorker", {
      configurable: true,
      value: {
        ready: Promise.resolve({
          pushManager: {
            getSubscription: vi.fn(async () => existingSubscription),
          },
        }),
      },
    });
    Object.defineProperty(window, "localStorage", {
      configurable: true,
      value: {
        getItem: (key: string) => storedValues.get(key) ?? null,
        setItem: (key: string, value: string) =>
          void storedValues.set(key, value),
        removeItem: (key: string) => void storedValues.delete(key),
      },
    });
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    vi.unstubAllGlobals();
  });

  async function renderAndSettle() {
    await act(async () => {
      root.render(createElement(NotificationsCard));
      for (let turn = 0; turn < 6; turn += 1) await Promise.resolve();
    });
  }

  it("preserves the browser setup when a missing server row cannot be repaired", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === "/api/push/public-key") {
        return Response.json({ enabled: true, key: "AQID" });
      }
      if (url.startsWith("/api/push/topics?")) {
        return Response.json({ registered: false, topics: [] });
      }
      if (url === "/api/push/subscribe") {
        return Response.json({}, { status: 503 });
      }
      throw new Error(`Unexpected request: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    await renderAndSettle();

    expect(container.textContent).toContain("Retry");
    expect(container.textContent).toContain(
      "Retry without changing your existing alert choices.",
    );
    expect(container.textContent).not.toContain("Turn on");
    expect(container.textContent).not.toContain("Turn off");
    expect(unsubscribeExisting).not.toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/push/subscribe",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("renders alerts on only after the missing server row is restored", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === "/api/push/public-key") {
        return Response.json({ enabled: true, key: "AQID" });
      }
      if (url.startsWith("/api/push/topics?")) {
        return Response.json({ registered: false, topics: [] });
      }
      if (url === "/api/push/subscribe") {
        return Response.json({ ok: true });
      }
      if (url.startsWith("/api/push/prefs?")) {
        return Response.json({ quiet_start: null, quiet_end: null });
      }
      throw new Error(`Unexpected request: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    await renderAndSettle();

    expect(container.textContent).toContain("Turn off");
    expect(container.textContent).toContain(
      "You’re connected. Pick at least one alert below.",
    );
  });

  it("rechecks an ambiguous server read without overwriting topics or unsubscribing", async () => {
    let topicReads = 0;
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === "/api/push/public-key") {
        return Response.json({ enabled: true, key: "AQID" });
      }
      if (url.startsWith("/api/push/topics?")) {
        topicReads += 1;
        return topicReads === 1
          ? Response.json({}, { status: 503 })
          : Response.json({ registered: true, topics: ["parking"] });
      }
      if (url.startsWith("/api/push/prefs?")) {
        return Response.json({ quiet_start: 21, quiet_end: 7 });
      }
      throw new Error(`Unexpected request: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    await renderAndSettle();
    expect(container.textContent).toContain("Retry");

    const retry = Array.from(
      container.querySelectorAll<HTMLButtonElement>("button"),
    ).find((button) => button.textContent?.includes("Retry"));
    if (!retry) throw new Error("Missing notification verification retry.");
    await act(async () => {
      retry.click();
      for (let turn = 0; turn < 6; turn += 1) await Promise.resolve();
    });

    expect(container.textContent).toContain("Turn off");
    expect(container.textContent).toContain("1 alert is on for this device.");
    expect(
      container.querySelector<HTMLButtonElement>(
        'button[aria-pressed="true"]',
      )?.textContent,
    ).toContain("Parking");
    expect(
      fetchMock.mock.calls.some(([input]) => String(input) === "/api/push/subscribe"),
    ).toBe(false);
    expect(unsubscribeExisting).not.toHaveBeenCalled();
  });
});
