import { describe, expect, it } from "vitest";
import {
  RETURN_BRIDGE_SESSION_GAP_MS,
  RETURN_BRIDGE_SNOOZE_MS,
  beginReturnBridgeSession,
  clearPendingReturnBridgeValue,
  completeReturnBridge,
  dismissReturnBridge,
  emptyReturnBridgeState,
  isReturnBridgeValueKind,
  isSocialEntry,
  markReturnBridgeOfferShown,
  parseReturnBridgeState,
  recordReturnBridgeValue,
  returnBridgeOfferReason,
  returnBridgeSurface,
  safeReturnLink,
  shouldReplaceReturnBridgeOffer,
  shouldSignalHomeAreaValue,
} from "./return-bridge";

const NOW = Date.parse("2026-07-31T16:00:00.000Z");

describe("Return Bridge state", () => {
  it("fails safely when stored state is missing or malformed", () => {
    expect(parseReturnBridgeState(null)).toEqual(emptyReturnBridgeState());
    expect(parseReturnBridgeState("not json")).toEqual(emptyReturnBridgeState());
    expect(parseReturnBridgeState("[]")).toEqual(emptyReturnBridgeState());
  });

  it("migrates partial state without preserving unknown value data", () => {
    expect(
      parseReturnBridgeState(JSON.stringify({
        sessions: 3.8,
        valueKind: "gravel-and-grind-frederick",
        dismissals: 99,
        completed: false,
      })),
    ).toEqual(expect.objectContaining({
      sessions: 3,
      valueKind: null,
      valueAt: 0,
      dismissals: 2,
      autoDisabled: true,
    }));
  });

  it("counts a new visit only after the session gap", () => {
    const first = beginReturnBridgeSession(emptyReturnBridgeState(), NOW);
    const sameVisit = beginReturnBridgeSession(first, NOW + 60_000);
    const returnVisit = beginReturnBridgeSession(
      sameVisit,
      NOW + RETURN_BRIDGE_SESSION_GAP_MS + 60_001,
    );

    expect(first.sessions).toBe(1);
    expect(sameVisit.sessions).toBe(1);
    expect(returnVisit.sessions).toBe(2);
  });

  it("qualifies a real saved value in session one, not a cold landing", () => {
    const firstVisit = beginReturnBridgeSession(emptyReturnBridgeState(), NOW);
    expect(
      returnBridgeOfferReason(firstVisit, { socialEntry: false, now: NOW }),
    ).toBeNull();

    const saved = recordReturnBridgeValue(firstVisit, "event", NOW + 1);
    expect(
      returnBridgeOfferReason(saved, { socialEntry: false, now: NOW + 1 }),
    ).toBe("value");
  });

  it("offers a quiet recovery path for social and returning visitors", () => {
    const firstVisit = beginReturnBridgeSession(emptyReturnBridgeState(), NOW);
    expect(
      returnBridgeOfferReason(firstVisit, { socialEntry: true, now: NOW }),
    ).toBe("social");

    const returnVisit = { ...firstVisit, sessions: 2 };
    expect(
      returnBridgeOfferReason(returnVisit, { socialEntry: false, now: NOW }),
    ).toBe("return");
  });

  it("snoozes once, then permanently stops automatic offers", () => {
    const active = recordReturnBridgeValue(
      beginReturnBridgeSession(emptyReturnBridgeState(), NOW),
      "transit-stop",
      NOW,
    );
    const firstDismissal = dismissReturnBridge(
      markReturnBridgeOfferShown(active, NOW),
      NOW,
    );

    expect(firstDismissal.snoozedUntil).toBe(NOW + RETURN_BRIDGE_SNOOZE_MS);
    expect(
      returnBridgeOfferReason(firstDismissal, {
        socialEntry: false,
        now: NOW + RETURN_BRIDGE_SNOOZE_MS - 1,
      }),
    ).toBeNull();

    const eligibleAgain = { ...firstDismissal, sessions: 2 };
    expect(
      returnBridgeOfferReason(eligibleAgain, {
        socialEntry: false,
        now: NOW + RETURN_BRIDGE_SNOOZE_MS + 1,
      }),
    ).toBe("return");

    const secondDismissal = dismissReturnBridge(
      eligibleAgain,
      NOW + RETURN_BRIDGE_SNOOZE_MS + 1,
    );
    expect(secondDismissal.autoDisabled).toBe(true);
    expect(secondDismissal.snoozedUntil).toBe(0);
    expect(
      returnBridgeOfferReason(secondDismissal, {
        socialEntry: true,
        now: NOW + 10 * RETURN_BRIDGE_SNOOZE_MS,
      }),
    ).toBeNull();
  });

  it("treats a completed return path as final for automatic prompting", () => {
    const completed = completeReturnBridge(
      recordReturnBridgeValue(emptyReturnBridgeState(), "home-area", NOW),
    );
    expect(completed.completed).toBe(true);
    expect(
      returnBridgeOfferReason(completed, { socialEntry: true, now: NOW }),
    ).toBeNull();
  });

  it("withdraws only an unshown matching save signal", () => {
    const saved = recordReturnBridgeValue(emptyReturnBridgeState(), "event", NOW);
    expect(clearPendingReturnBridgeValue(saved, "place")).toBe(saved);
    expect(clearPendingReturnBridgeValue(saved, "event")).toEqual(
      expect.objectContaining({ valueKind: null, valueAt: 0 }),
    );

    const shown = markReturnBridgeOfferShown(saved, NOW + 1);
    expect(clearPendingReturnBridgeValue(shown, "event")).toBe(shown);
  });

  it("only treats a changed non-empty home area as new value", () => {
    expect(shouldSignalHomeAreaValue("frederick", "frederick")).toBe(false);
    expect(shouldSignalHomeAreaValue(null, null)).toBe(false);
    expect(shouldSignalHomeAreaValue("frederick", null)).toBe(false);
    expect(shouldSignalHomeAreaValue("frederick", "brunswick")).toBe(true);
    expect(shouldSignalHomeAreaValue(null, "brunswick")).toBe(true);
  });

  it("lets value offers replace lower-priority pending offers", () => {
    expect(shouldReplaceReturnBridgeOffer("social", "value")).toBe(true);
    expect(shouldReplaceReturnBridgeOffer("return", "value")).toBe(true);
    expect(shouldReplaceReturnBridgeOffer("social", "return")).toBe(true);
    expect(shouldReplaceReturnBridgeOffer("value", "social")).toBe(false);
    expect(shouldReplaceReturnBridgeOffer("value", "value")).toBe(false);
  });
});

describe("Return Bridge platform routing", () => {
  const iosSafari =
    "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1";
  const iosChrome =
    "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 CriOS/126.0.0 Mobile/15E148 Safari/604.1";
  const android =
    "Mozilla/5.0 (Linux; Android 15; Pixel 9 Pro) AppleWebKit/537.36 Chrome/126.0 Mobile Safari/537.36";

  it.each([
    [{ userAgent: iosSafari, hasNativePrompt: false, standalone: false }, "ios-safari"],
    [{ userAgent: iosChrome, hasNativePrompt: false, standalone: false }, "ios-chrome"],
    [{ userAgent: `${iosSafari} [FBAN/FBIOS;FBAV/500.0]`, hasNativePrompt: false, standalone: false }, "embedded-ios"],
    [{ userAgent: `${android} Instagram 340.0.0`, hasNativePrompt: false, standalone: false }, "embedded-android"],
    [{ userAgent: android, hasNativePrompt: false, standalone: false }, "mobile-browser"],
    [{ userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0)", hasNativePrompt: false, standalone: false }, "desktop"],
  ] as const)("routes %o to %s", (options, expected) => {
    expect(returnBridgeSurface(options)).toBe(expected);
  });

  it("prioritizes native installation and standalone status", () => {
    expect(
      returnBridgeSurface({
        userAgent: android,
        hasNativePrompt: true,
        standalone: false,
      }),
    ).toBe("native");
    expect(
      returnBridgeSurface({
        userAgent: android,
        hasNativePrompt: true,
        standalone: true,
      }),
    ).toBe("installed");
  });

  it("recognizes touch-capable iPad desktop identification", () => {
    expect(
      returnBridgeSurface({
        userAgent:
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15) AppleWebKit/605.1.15 Version/18.0 Safari/605.1.15",
        maxTouchPoints: 5,
        hasNativePrompt: false,
        standalone: false,
      }),
    ).toBe("ios-safari");
  });
});

describe("Return Bridge privacy", () => {
  it("accepts only stable value categories", () => {
    expect(isReturnBridgeValueKind("place")).toBe(true);
    expect(isReturnBridgeValueKind("transit-bus")).toBe(true);
    expect(isReturnBridgeValueKind("gravel-and-grind-frederick")).toBe(false);
  });

  it("keeps useful deep links while stripping private query values", () => {
    expect(
      safeReturnLink(
        "https://frederickradius.app/events/alive-at-five?utm_source=facebook&token=secret&email=person%40example.com#details",
      ),
    ).toBe(
      "https://frederickradius.app/events/alive-at-five?utm_source=facebook#details",
    );
    expect(safeReturnLink("javascript:alert(1)")).toBe("");
  });

  it("turns internal setup links into safe Today links and scrubs fragments", () => {
    expect(
      safeReturnLink("https://frederickradius.app/settings#keep-radius"),
    ).toBe("https://frederickradius.app/today");
    expect(
      safeReturnLink(
        "https://frederickradius.app/today#access_token=secret&refresh_token=also-secret&view=map",
      ),
    ).toBe("https://frederickradius.app/today#view=map");
  });
});

describe("Return Bridge social entry detection", () => {
  it("recognizes bounded referrers, campaign sources, and generic webviews", () => {
    expect(isSocialEntry({
      userAgent: "Mobile Safari",
      referrer: "https://www.reddit.com/r/frederickmd/",
    })).toBe(true);
    expect(isSocialEntry({
      userAgent: "Mobile Safari",
      currentUrl: "https://frederickradius.app/today?utm_source=x",
    })).toBe(true);
    expect(isSocialEntry({
      userAgent: "Mozilla/5.0 (Linux; Android 15; Pixel; wv)",
    })).toBe(true);
    expect(isSocialEntry({
      userAgent: "Mobile Safari",
      referrer: "https://www.google.com/",
      currentUrl: "https://frederickradius.app/today?utm_source=newsletter",
    })).toBe(false);
  });
});
