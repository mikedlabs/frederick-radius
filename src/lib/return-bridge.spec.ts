import { describe, expect, it } from "vitest";
import {
  RETURN_BRIDGE_DISMISS_MS,
  beginReturnBridgeSession,
  clearPendingReturnBridgeValue,
  completeReturnBridge,
  dismissReturnBridge,
  emptyReturnBridgeState,
  isReturnBridgeValueKind,
  isSameLocalCalendarDay,
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
      dismissals: 99,
      autoDisabled: false,
    }));
  });

  it("keeps an older permanent dismissal as a hard stop", () => {
    expect(
      parseReturnBridgeState(JSON.stringify({
        sessions: 2,
        autoDisabled: true,
        dismissals: 1,
      })),
    ).toEqual(expect.objectContaining({ autoDisabled: true }));
  });

  it("counts a new visit at most once per local calendar day", () => {
    const evening = new Date(2026, 6, 31, 23, 0, 0).getTime();
    const laterSameNight = new Date(2026, 6, 31, 23, 45, 0).getTime();
    const nextMorning = new Date(2026, 7, 1, 1, 0, 0).getTime();

    expect(isSameLocalCalendarDay(evening, laterSameNight)).toBe(true);
    expect(isSameLocalCalendarDay(evening, nextMorning)).toBe(false);

    const first = beginReturnBridgeSession(emptyReturnBridgeState(), evening);
    const sameVisit = beginReturnBridgeSession(first, laterSameNight);
    const returnVisit = beginReturnBridgeSession(sameVisit, nextMorning);

    expect(first.sessions).toBe(1);
    expect(sameVisit.sessions).toBe(1);
    expect(returnVisit.sessions).toBe(2);
  });

  it("does not offer a Home Screen path on a first visit", () => {
    const firstVisit = beginReturnBridgeSession(emptyReturnBridgeState(), NOW);
    expect(
      returnBridgeOfferReason(firstVisit, { socialEntry: false, now: NOW }),
    ).toBeNull();
    expect(
      returnBridgeOfferReason(firstVisit, { socialEntry: true, now: NOW }),
    ).toBeNull();
  });

  it("offers a quiet banner after a save, including on a first visit", () => {
    const firstVisit = beginReturnBridgeSession(emptyReturnBridgeState(), NOW);
    const saved = recordReturnBridgeValue(firstVisit, "event", NOW + 1);
    expect(
      returnBridgeOfferReason(saved, { socialEntry: false, now: NOW + 1 }),
    ).toBe("value");
  });

  it("offers a quiet banner on the second visit", () => {
    const firstVisit = beginReturnBridgeSession(emptyReturnBridgeState(), NOW);
    const returnVisit = { ...firstVisit, sessions: 2 };
    expect(
      returnBridgeOfferReason(returnVisit, { socialEntry: false, now: NOW }),
    ).toBe("return");
  });

  it("hides automatic offers for 30 days after dismissal", () => {
    const active = recordReturnBridgeValue(
      beginReturnBridgeSession(emptyReturnBridgeState(), NOW),
      "transit-stop",
      NOW,
    );
    const shown = markReturnBridgeOfferShown(active, NOW);
    const firstDismissal = dismissReturnBridge(shown, NOW);

    expect(firstDismissal.snoozedUntil).toBe(NOW + RETURN_BRIDGE_DISMISS_MS);
    expect(firstDismissal.autoDisabled).toBe(false);
    expect(
      returnBridgeOfferReason(firstDismissal, {
        socialEntry: false,
        now: NOW + 60_000,
      }),
    ).toBeNull();

    const day29 = NOW + RETURN_BRIDGE_DISMISS_MS - 1;
    expect(
      returnBridgeOfferReason({ ...firstDismissal, sessions: 2 }, {
        socialEntry: false,
        now: day29,
      }),
    ).toBeNull();

    const day30 = NOW + RETURN_BRIDGE_DISMISS_MS;
    expect(
      returnBridgeOfferReason({ ...firstDismissal, sessions: 2 }, {
        socialEntry: false,
        now: day30,
      }),
    ).toBe("return");
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
    expect(shouldReplaceReturnBridgeOffer("visit", "social")).toBe(true);
    expect(shouldReplaceReturnBridgeOffer("visit", "return")).toBe(true);
    expect(shouldReplaceReturnBridgeOffer("visit", "value")).toBe(true);
    expect(shouldReplaceReturnBridgeOffer("social", "value")).toBe(true);
    expect(shouldReplaceReturnBridgeOffer("return", "value")).toBe(true);
    expect(shouldReplaceReturnBridgeOffer("social", "return")).toBe(true);
    expect(shouldReplaceReturnBridgeOffer("value", "social")).toBe(false);
    expect(shouldReplaceReturnBridgeOffer("value", "value")).toBe(false);
  });

  it("does not repeat an automatic invitation that was already shown", () => {
    const firstVisit = beginReturnBridgeSession(emptyReturnBridgeState(), NOW);
    const shown = markReturnBridgeOfferShown(firstVisit, NOW + 10_000);
    const returnVisit = { ...shown, sessions: 2 };

    expect(
      returnBridgeOfferReason(returnVisit, {
        socialEntry: false,
        now: NOW + 24 * 60 * 60 * 1000,
      }),
    ).toBeNull();
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
