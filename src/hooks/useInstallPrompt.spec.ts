import { describe, expect, it, vi } from "vitest";
import {
  RETURN_REVEAL_DELAY_MS,
  VALUE_REVEAL_DELAY_MS,
  requestBrowserInstall,
  shouldAutoOfferInstall,
} from "./useInstallPrompt";
import {
  RETURN_BRIDGE_DISMISS_MS,
  beginReturnBridgeSession,
  dismissReturnBridge,
  emptyReturnBridgeState,
  markReturnBridgeOfferShown,
  recordReturnBridgeValue,
  returnBridgeOfferReason,
} from "@/lib/return-bridge";

describe("requestBrowserInstall", () => {
  it("opens the browser-owned install dialog and returns acceptance", async () => {
    const prompt = vi.fn().mockResolvedValue(undefined);

    await expect(
      requestBrowserInstall({
        prompt,
        userChoice: Promise.resolve({ outcome: "accepted", platform: "web" }),
      }),
    ).resolves.toBe("accepted");
    expect(prompt).toHaveBeenCalledOnce();
  });

  it("reports a browser dismissal without pretending installation succeeded", async () => {
    await expect(
      requestBrowserInstall({
        prompt: vi.fn().mockResolvedValue(undefined),
        userChoice: Promise.resolve({ outcome: "dismissed", platform: "web" }),
      }),
    ).resolves.toBe("dismissed");
  });
});

describe("automatic Home Screen invitation", () => {
  const NOW = Date.parse("2026-07-31T16:00:00.000Z");

  it("reveals the save banner quickly and the return banner after first paint", () => {
    expect(VALUE_REVEAL_DELAY_MS).toBe(1_200);
    expect(RETURN_REVEAL_DELAY_MS).toBe(400);
  });

  it("never auto-opens on a first visit, including social entry", () => {
    expect(shouldAutoOfferInstall("visit")).toBe(false);
    expect(shouldAutoOfferInstall("social")).toBe(false);
    expect(shouldAutoOfferInstall(null)).toBe(false);

    const firstVisit = beginReturnBridgeSession(emptyReturnBridgeState(), NOW);
    expect(
      shouldAutoOfferInstall(
        returnBridgeOfferReason(firstVisit, { socialEntry: false, now: NOW }),
      ),
    ).toBe(false);
    expect(
      shouldAutoOfferInstall(
        returnBridgeOfferReason(firstVisit, { socialEntry: true, now: NOW }),
      ),
    ).toBe(false);
  });

  it("auto-offers after a second visit or a save", () => {
    expect(shouldAutoOfferInstall("value")).toBe(true);
    expect(shouldAutoOfferInstall("return")).toBe(true);

    const firstVisit = beginReturnBridgeSession(emptyReturnBridgeState(), NOW);
    const saved = recordReturnBridgeValue(firstVisit, "place", NOW + 1);
    expect(
      shouldAutoOfferInstall(
        returnBridgeOfferReason(saved, { socialEntry: false, now: NOW + 1 }),
      ),
    ).toBe(true);

    const returnVisit = { ...firstVisit, sessions: 2 };
    expect(
      shouldAutoOfferInstall(
        returnBridgeOfferReason(returnVisit, { socialEntry: false, now: NOW }),
      ),
    ).toBe(true);
  });

  it("keeps the banner hidden through a 30-day dismissal", () => {
    const returnVisit = {
      ...beginReturnBridgeSession(emptyReturnBridgeState(), NOW),
      sessions: 2,
    };
    const dismissed = dismissReturnBridge(
      markReturnBridgeOfferShown(returnVisit, NOW),
      NOW,
    );

    expect(
      shouldAutoOfferInstall(
        returnBridgeOfferReason(dismissed, {
          socialEntry: false,
          now: NOW + RETURN_BRIDGE_DISMISS_MS - 1,
        }),
      ),
    ).toBe(false);
    expect(
      shouldAutoOfferInstall(
        returnBridgeOfferReason({ ...dismissed, sessions: 3 }, {
          socialEntry: false,
          now: NOW + RETURN_BRIDGE_DISMISS_MS,
        }),
      ),
    ).toBe(true);
  });
});
