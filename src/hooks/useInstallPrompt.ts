"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { isStandalone } from "@/lib/pwa-display";
import {
  RETURN_BRIDGE_OPEN_EVENT,
  RETURN_BRIDGE_VALUE_CANCEL_EVENT,
  RETURN_BRIDGE_VALUE_EVENT,
  beginReturnBridgeSession,
  clearPendingReturnBridgeValue,
  completeReturnBridge,
  currentReturnBridgeState,
  dismissReturnBridge,
  embeddedBrowserName,
  emptyReturnBridgeState,
  isReturnBridgeValueKind,
  isSocialEntry,
  markReturnBridgeInstalledThisSession,
  markReturnBridgeOfferShown,
  recordReturnBridgeValue,
  returnBridgeOfferReason,
  returnBridgeSurface,
  shouldReplaceReturnBridgeOffer,
  writeReturnBridgeState,
  type ReturnBridgeOfferReason,
  type ReturnBridgeState,
  type ReturnBridgeSurface,
  type ReturnBridgeValueKind,
} from "@/lib/return-bridge";
import { track } from "@/lib/track";

export type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
};

type InstallWindow = Window & {
  __frBeforeInstallPrompt?: BeforeInstallPromptEvent;
};

const VALUE_REVEAL_DELAY_MS = 6_500;
const RETURN_REVEAL_DELAY_MS = 6_000;
const PWA_LAUNCH_SESSION_KEY = "fr:pwa-launch:v1";

function capturedInstallEvent(): BeforeInstallPromptEvent | null {
  if (typeof window === "undefined") return null;
  return (window as InstallWindow).__frBeforeInstallPrompt ?? null;
}

function clearCapturedInstallEvent() {
  if (typeof window === "undefined") return;
  delete (window as InstallWindow).__frBeforeInstallPrompt;
  window.dispatchEvent(new Event("fr:install-prompt-consumed"));
}

/** Invoke the browser-owned installation dialog from a direct user action. */
export async function requestBrowserInstall(
  installEvent: Pick<BeforeInstallPromptEvent, "prompt" | "userChoice">,
): Promise<"accepted" | "dismissed"> {
  await installEvent.prompt();
  return (await installEvent.userChoice).outcome;
}

function delayFor(reason: ReturnBridgeOfferReason): number {
  if (reason === "value") return VALUE_REVEAL_DELAY_MS;
  return RETURN_REVEAL_DELAY_MS;
}

/**
 * Automatic retention offers require proof of value or a return visit. A
 * first shared-link session must remain focused on the page someone came to
 * see, regardless of device. Manual and browser-native install paths remain
 * available without this automatic gate.
 */
export function shouldAutoOfferInstall(
  reason: ReturnBridgeOfferReason | null,
): boolean {
  return reason === "value" || reason === "return";
}

/**
 * Owns the one global return-path surface. A first useful action can qualify in
 * session one; returning and social-entry visitors retain quieter
 * fallbacks. Manual doors in Saved, Compass, and Settings bypass snoozes.
 */
export function useInstallPrompt(): {
  show: boolean;
  surface: ReturnBridgeSurface;
  reason: ReturnBridgeOfferReason | null;
  valueKind: ReturnBridgeValueKind | null;
  embeddedApp: string;
  manual: boolean;
  prompting: boolean;
  promptInstall: () => Promise<void>;
  dismiss: () => void;
  acknowledgeInstalled: () => void;
  completeAlternative: (method: "copy" | "share") => void;
  recordOfferShown: () => void;
} {
  const stateRef = useRef<ReturnBridgeState>(emptyReturnBridgeState());
  const eligibleRef = useRef(false);
  const offerTrackedRef = useRef(false);
  const successTrackedRef = useRef(false);
  const revealTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const revealReasonRef = useRef<ReturnBridgeOfferReason | null>(null);
  const [bridgeState, setBridgeState] = useState<ReturnBridgeState>(() =>
    emptyReturnBridgeState(),
  );
  const [deferredEvent, setDeferredEvent] =
    useState<BeforeInstallPromptEvent | null>(null);
  const [platform, setPlatform] = useState({
    userAgent: "",
    maxTouchPoints: 0,
    standalone: false,
  });
  const [eligible, setEligible] = useState(false);
  const [reason, setReason] = useState<ReturnBridgeOfferReason | null>(null);
  const [manual, setManual] = useState(false);
  const [prompting, setPrompting] = useState(false);

  const setBridgeEligible = useCallback((next: boolean) => {
    eligibleRef.current = next;
    setEligible(next);
  }, []);

  const persist = useCallback((next: ReturnBridgeState) => {
    stateRef.current = next;
    setBridgeState(next);
    writeReturnBridgeState(next);
  }, []);

  const markSuccess = useCallback((method: string) => {
    persist(completeReturnBridge(stateRef.current));
    setBridgeEligible(false);
    setManual(false);
    revealReasonRef.current = null;
    offerTrackedRef.current = false;
    if (!successTrackedRef.current) {
      successTrackedRef.current = true;
      track("keep_radius_success", { method });
    }
  }, [persist, setBridgeEligible]);

  useEffect(() => {
    const userAgent = window.navigator.userAgent;
    const maxTouchPoints = window.navigator.maxTouchPoints;
    const standalone = isStandalone();
    setPlatform({ userAgent, maxTouchPoints, standalone });

    let initial = beginReturnBridgeSession(currentReturnBridgeState());
    if (standalone) initial = completeReturnBridge(initial);
    persist(initial);

    if (standalone) {
      try {
        if (window.sessionStorage.getItem(PWA_LAUNCH_SESSION_KEY) !== "1") {
          window.sessionStorage.setItem(PWA_LAUNCH_SESSION_KEY, "1");
          track("pwa_launch");
        }
      } catch {
        track("pwa_launch");
      }
      return;
    }

    const schedule = (nextReason: ReturnBridgeOfferReason) => {
      if (eligibleRef.current) return;
      if (revealTimerRef.current) {
        if (
          !shouldReplaceReturnBridgeOffer(
            revealReasonRef.current,
            nextReason,
          )
        ) {
          return;
        }
        clearTimeout(revealTimerRef.current);
        revealTimerRef.current = null;
      }
      revealReasonRef.current = nextReason;
      revealTimerRef.current = setTimeout(() => {
        revealTimerRef.current = null;
        offerTrackedRef.current = false;
        setReason(nextReason);
        setManual(false);
        setBridgeEligible(true);
      }, delayFor(nextReason));
    };

    const socialEntry = isSocialEntry({
      userAgent,
      referrer: document.referrer,
      currentUrl: window.location.href,
    });
    let firstReason = returnBridgeOfferReason(initial, { socialEntry });
    // Never interrupt a first visit, including a social/shared deep link. The
    // automatic surface becomes earned only after a useful action or a later
    // session. Saved, Compass, and Settings keep their manual door.
    if (!shouldAutoOfferInstall(firstReason)) {
      firstReason = null;
    }
    if (firstReason) schedule(firstReason);

    const assignDeferredEvent = (event: Event) => {
      event.preventDefault();
      const installEvent = event as BeforeInstallPromptEvent;
      (window as InstallWindow).__frBeforeInstallPrompt = installEvent;
      setDeferredEvent(installEvent);
    };
    const onCapturedInstallReady = () => {
      const next = capturedInstallEvent();
      if (next) setDeferredEvent(next);
    };
    const captured = capturedInstallEvent();
    if (captured) setDeferredEvent(captured);

    const onValue = (event: Event) => {
      const detail = (event as CustomEvent<ReturnBridgeValueKind>).detail;
      if (!isReturnBridgeValueKind(detail)) return;
      const next = recordReturnBridgeValue(stateRef.current, detail);
      persist(next);
      const nextReason = returnBridgeOfferReason(next, {
        socialEntry,
      });
      if (nextReason) schedule(nextReason);
    };

    const onValueCancel = (event: Event) => {
      const detail = (event as CustomEvent<ReturnBridgeValueKind>).detail;
      if (!isReturnBridgeValueKind(detail)) return;
      const next = clearPendingReturnBridgeValue(stateRef.current, detail);
      if (next === stateRef.current) return;
      persist(next);
      if (revealReasonRef.current !== "value") return;
      if (revealTimerRef.current) clearTimeout(revealTimerRef.current);
      revealTimerRef.current = null;
      revealReasonRef.current = null;
      setReason(null);
      setBridgeEligible(false);
    };

    const onManualOpen = () => {
      if (isStandalone()) return;
      if (revealTimerRef.current) {
        clearTimeout(revealTimerRef.current);
        revealTimerRef.current = null;
      }
      revealReasonRef.current = null;
      setReason(null);
      setManual(true);
      setBridgeEligible(true);
    };

    const onInstalled = () => {
      clearCapturedInstallEvent();
      setDeferredEvent(null);
      markReturnBridgeInstalledThisSession();
      markSuccess("appinstalled");
    };

    window.addEventListener("beforeinstallprompt", assignDeferredEvent);
    window.addEventListener("fr:beforeinstallprompt-ready", onCapturedInstallReady);
    window.addEventListener(RETURN_BRIDGE_VALUE_EVENT, onValue);
    window.addEventListener(RETURN_BRIDGE_VALUE_CANCEL_EVENT, onValueCancel);
    window.addEventListener(RETURN_BRIDGE_OPEN_EVENT, onManualOpen);
    window.addEventListener("appinstalled", onInstalled);

    return () => {
      if (revealTimerRef.current) clearTimeout(revealTimerRef.current);
      revealTimerRef.current = null;
      revealReasonRef.current = null;
      window.removeEventListener("beforeinstallprompt", assignDeferredEvent);
      window.removeEventListener("fr:beforeinstallprompt-ready", onCapturedInstallReady);
      window.removeEventListener(RETURN_BRIDGE_VALUE_EVENT, onValue);
      window.removeEventListener(RETURN_BRIDGE_VALUE_CANCEL_EVENT, onValueCancel);
      window.removeEventListener(RETURN_BRIDGE_OPEN_EVENT, onManualOpen);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, [markSuccess, persist, setBridgeEligible]);

  const dismiss = useCallback(() => {
    setBridgeEligible(false);
    revealReasonRef.current = null;
    offerTrackedRef.current = false;
    if (manual) {
      setManual(false);
      return;
    }
    const next = dismissReturnBridge(stateRef.current);
    persist(next);
    track("keep_radius_dismiss", { count: next.dismissals });
  }, [manual, persist, setBridgeEligible]);

  const promptInstall = useCallback(async () => {
    if (!deferredEvent || prompting) return;
    setPrompting(true);
    try {
      const outcome = await requestBrowserInstall(deferredEvent);
      clearCapturedInstallEvent();
      setDeferredEvent(null);
      if (outcome === "accepted") {
        markReturnBridgeInstalledThisSession();
        markSuccess("native");
      } else dismiss();
    } catch {
      // A stale browser event should degrade to the copy/share instructions,
      // not strand the CTA in a busy state or throw into the click handler.
      clearCapturedInstallEvent();
      setDeferredEvent(null);
    } finally {
      setPrompting(false);
    }
  }, [deferredEvent, dismiss, markSuccess, prompting]);

  const acknowledgeInstalled = useCallback(() => {
    markReturnBridgeInstalledThisSession();
    markSuccess("manual_confirm");
  }, [markSuccess]);

  const completeAlternative = useCallback((method: "copy" | "share") => {
    markSuccess(method);
  }, [markSuccess]);

  const surface = returnBridgeSurface({
    userAgent: platform.userAgent,
    maxTouchPoints: platform.maxTouchPoints,
    hasNativePrompt: Boolean(deferredEvent),
    standalone: platform.standalone,
  });

  const recordOfferShown = useCallback(() => {
    if (manual || !reason || offerTrackedRef.current) return;
    offerTrackedRef.current = true;
    persist(markReturnBridgeOfferShown(stateRef.current));
    track("keep_radius_offer", {
      reason,
      surface,
      value: stateRef.current.valueKind ?? "none",
    });
  }, [manual, persist, reason, surface]);

  return {
    show: eligible && !platform.standalone,
    surface,
    reason,
    valueKind: bridgeState.valueKind,
    embeddedApp: embeddedBrowserName(platform.userAgent),
    manual,
    prompting,
    promptInstall,
    dismiss,
    acknowledgeInstalled,
    completeAlternative,
    recordOfferShown,
  };
}
