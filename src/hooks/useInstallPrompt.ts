"use client";

import { useEffect, useState } from "react";
import {
  canOfferInstallAutomatically,
  isInstallCooldownActive,
  isIos,
  isIosSafari,
  isStandalone,
} from "@/lib/pwa-display";

export type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
};

type InstallWindow = Window & {
  __frBeforeInstallPrompt?: BeforeInstallPromptEvent;
};

type Engagement = {
  sessions: number;
  interactions: number;
  lastSessionAt: number;
};

const STORAGE_KEY = "fr:install-prompt:v2";
const ENGAGEMENT_KEY = "fr:engagement:v2";
const SESSION_GAP_MS = 30 * 60 * 1000;
const COOLDOWN_MS = 14 * 24 * 60 * 60 * 1000;
const REVEAL_DELAY_MS = 6_000;

function fallbackEngagement(): Engagement {
  return { sessions: 0, interactions: 0, lastSessionAt: 0 };
}

function readEngagement(): Engagement {
  if (typeof window === "undefined") return fallbackEngagement();
  try {
    const parsed = JSON.parse(window.localStorage.getItem(ENGAGEMENT_KEY) ?? "null") as Partial<Engagement> | null;
    if (!parsed || typeof parsed !== "object") return fallbackEngagement();
    return {
      sessions: Number.isFinite(parsed.sessions) ? Math.max(0, parsed.sessions ?? 0) : 0,
      interactions: Number.isFinite(parsed.interactions) ? Math.max(0, parsed.interactions ?? 0) : 0,
      lastSessionAt: Number.isFinite(parsed.lastSessionAt) ? Math.max(0, parsed.lastSessionAt ?? 0) : 0,
    };
  } catch {
    return fallbackEngagement();
  }
}

function writeEngagement(engagement: Engagement) {
  try {
    window.localStorage.setItem(ENGAGEMENT_KEY, JSON.stringify(engagement));
  } catch {
    // Storage is a convenience for timing, not a requirement for using the app.
  }
}

function beginSession(): Engagement {
  const previous = readEngagement();
  const now = Date.now();
  const isNewSession = !previous.lastSessionAt || now - previous.lastSessionAt > SESSION_GAP_MS;
  const next: Engagement = {
    ...previous,
    sessions: previous.sessions + (isNewSession ? 1 : 0),
    lastSessionAt: now,
  };
  writeEngagement(next);
  return next;
}

function recordInteraction(): Engagement {
  const previous = readEngagement();
  const next: Engagement = {
    ...previous,
    interactions: previous.interactions + 1,
  };
  writeEngagement(next);
  return next;
}

function cooldownActive(): boolean {
  if (typeof window === "undefined") return true;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return false;
    const value = JSON.parse(raw) as { notBefore?: unknown };
    return isInstallCooldownActive(value.notBefore);
  } catch {
    return false;
  }
}

function deferInstallOffer() {
  try {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ notBefore: Date.now() + COOLDOWN_MS }),
    );
  } catch {
    // A declined nudge should never block the rest of the app.
  }
}

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

/**
 * Turns browser-specific install behavior into one honest product surface.
 * Chromium gets its native browser prompt. iPhone and iPad get exact manual
 * instructions because browser chrome owns Add to Home Screen; a page-opened
 * Web Share sheet is not the same installation surface.
 */
export function useInstallPrompt(): {
  show: boolean;
  ios: boolean;
  iosSafari: boolean;
  prompting: boolean;
  promptInstall: () => Promise<void>;
  dismiss: () => void;
} {
  const [deferredEvent, setDeferredEvent] = useState<BeforeInstallPromptEvent | null>(null);
  const [eligible, setEligible] = useState(false);
  const [deferred, setDeferred] = useState(false);
  const [installed, setInstalled] = useState(false);
  const [ios, setIos] = useState(false);
  const [iosSafari, setIosSafari] = useState(false);
  const [prompting, setPrompting] = useState(false);

  useEffect(() => {
    const iosDevice = isIos();
    const iosSafariBrowser = iosDevice && isIosSafari();
    const baseEligible = !isStandalone() && !cooldownActive();
    setIos(iosDevice);
    setIosSafari(iosSafariBrowser);
    setDeferred(!baseEligible);

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
    window.addEventListener("beforeinstallprompt", assignDeferredEvent);
    window.addEventListener("fr:beforeinstallprompt-ready", onCapturedInstallReady);

    let engagement = beginSession();
    let revealTimer: ReturnType<typeof setTimeout> | undefined;
    const scheduleReveal = () => {
      if (
        !baseEligible
        || !canOfferInstallAutomatically(engagement.sessions, engagement.interactions)
        || revealTimer
      ) return;
      revealTimer = setTimeout(() => setEligible(true), REVEAL_DELAY_MS);
    };
    scheduleReveal();

    const onInteraction = () => {
      engagement = recordInteraction();
      scheduleReveal();
    };
    const onManualOpen = () => {
      // A person who deliberately asks from Settings is different from an
      // automatic reminder. Chromium can go straight to its browser-owned
      // dialog from this click; iOS has no programmatic install API, so it
      // opens the exact Safari steps instead.
      if (isStandalone()) return;
      const installEvent = capturedInstallEvent();
      if (installEvent && !iosDevice) {
        setPrompting(true);
        void requestBrowserInstall(installEvent)
          .then((outcome) => {
            clearCapturedInstallEvent();
            setDeferredEvent(null);
            if (outcome === "accepted") {
              setInstalled(true);
              setEligible(false);
              return;
            }
            deferInstallOffer();
            setDeferred(true);
            setEligible(false);
          })
          .finally(() => setPrompting(false));
        return;
      }
      if (iosDevice) {
        setEligible(true);
        setDeferred(false);
      }
    };
    const onInstalled = () => {
      clearCapturedInstallEvent();
      setDeferredEvent(null);
      setInstalled(true);
      setEligible(false);
      try {
        window.localStorage.removeItem(STORAGE_KEY);
      } catch {
        // No action required; the standalone check prevents future nudges.
      }
    };

    window.addEventListener("pointerdown", onInteraction, { passive: true });
    window.addEventListener("keydown", onInteraction);
    window.addEventListener("fr:open-install", onManualOpen);
    window.addEventListener("appinstalled", onInstalled);

    return () => {
      if (revealTimer) clearTimeout(revealTimer);
      window.removeEventListener("beforeinstallprompt", assignDeferredEvent);
      window.removeEventListener("fr:beforeinstallprompt-ready", onCapturedInstallReady);
      window.removeEventListener("pointerdown", onInteraction);
      window.removeEventListener("keydown", onInteraction);
      window.removeEventListener("fr:open-install", onManualOpen);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  const dismiss = () => {
    deferInstallOffer();
    setDeferred(true);
    setEligible(false);
  };

  const promptInstall = async () => {
    if (!deferredEvent || prompting) return;
    setPrompting(true);
    try {
      const outcome = await requestBrowserInstall(deferredEvent);
      clearCapturedInstallEvent();
      setDeferredEvent(null);
      if (outcome === "accepted") {
        setInstalled(true);
        setEligible(false);
      } else {
        dismiss();
      }
    } finally {
      setPrompting(false);
    }
  };

  const show = eligible && !deferred && !installed && (Boolean(deferredEvent) || ios);
  return { show, ios, iosSafari, prompting, promptInstall, dismiss };
}
