"use client";

import { useEffect, useState } from "react";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
};

const STORAGE_KEY = "fr:install-prompt:v1";
const ENGAGEMENT_KEY = "fr:engagement:v1";

type Engagement = { sessions: number; interactions: number; firstSeen: number };

function readEngagement(): Engagement {
  if (typeof window === "undefined") return { sessions: 0, interactions: 0, firstSeen: 0 };
  try {
    const raw = window.localStorage.getItem(ENGAGEMENT_KEY);
    return raw ? JSON.parse(raw) : { sessions: 0, interactions: 0, firstSeen: 0 };
  } catch {
    return { sessions: 0, interactions: 0, firstSeen: 0 };
  }
}

function writeEngagement(e: Engagement) {
  if (typeof window === "undefined") return;
  try { window.localStorage.setItem(ENGAGEMENT_KEY, JSON.stringify(e)); } catch {}
}

function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  if (window.matchMedia("(display-mode: standalone)").matches) return true;
  const nav = window.navigator as Navigator & { standalone?: boolean };
  return Boolean(nav.standalone);
}

// The share -> Add to Home Screen flow only exists in iOS Safari.
// In iOS Chrome/Firefox/Edge (CriOS/FxiOS/EdgiOS/OPiOS) the same
// instruction is wrong, so the sheet must not show there.
function isIosSafari(): boolean {
  if (typeof window === "undefined") return false;
  const ua = window.navigator.userAgent;
  if (!/iPad|iPhone|iPod/.test(ua)) return false;
  return !/CriOS|FxiOS|EdgiOS|OPiOS|mercury/i.test(ua);
}

// Brief: never show again once dismissed. A single persisted flag,
// permanent (not the prior 30-day window).
function wasDismissed(): boolean {
  if (typeof window === "undefined") return true;
  try {
    return Boolean(window.localStorage.getItem(STORAGE_KEY));
  } catch {
    return false;
  }
}

export function useInstallPrompt(): {
  show: boolean;
  ios: boolean;
  promptInstall: () => Promise<void>;
  dismiss: () => void;
} {
  const [deferredEvent, setDeferredEvent] = useState<BeforeInstallPromptEvent | null>(null);
  const [eligible, setEligible] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const ios = isIosSafari();

  useEffect(() => {
    // Track engagement: sessions + interactions
    const e = readEngagement();
    const now = Date.now();
    const lastSession = e.firstSeen ? now - e.firstSeen : Infinity;
    const isNewSession = lastSession > 30 * 60 * 1000;
    const updated: Engagement = {
      sessions: e.sessions + (isNewSession ? 1 : 0),
      interactions: e.interactions + 1,
      firstSeen: e.firstSeen || now,
    };
    writeEngagement(updated);
    // eslint-disable-next-line react-hooks/set-state-in-effect -- mount-time read of persisted engagement to derive client-only install eligibility (SSR-unsafe storage)
    setDismissed(wasDismissed());

    // Don't slam the prompt on arrival — that's what read as intrusive.
    // Let the user settle in first: hold it back a few seconds (and a
    // touch longer on a true first session, when they're still getting
    // oriented). Still a first-visit prompt, just not the instant the
    // page paints. Dismiss-forever behavior is unchanged.
    const baseEligible = !isStandalone() && !wasDismissed();
    const delayMs = updated.sessions <= 1 ? 18_000 : 8_000;
    let eligibleTimer: ReturnType<typeof setTimeout> | undefined;
    if (baseEligible) {
      eligibleTimer = setTimeout(() => setEligible(true), delayMs);
    }

    const handler = (event: Event) => {
      event.preventDefault();
      setDeferredEvent(event as BeforeInstallPromptEvent);
    };
    window.addEventListener("beforeinstallprompt", handler);
    return () => {
      if (eligibleTimer) clearTimeout(eligibleTimer);
      window.removeEventListener("beforeinstallprompt", handler);
    };
  }, []);

  const dismiss = () => {
    try { window.localStorage.setItem(STORAGE_KEY, Date.now().toString()); } catch {}
    setDismissed(true);
  };

  const promptInstall = async () => {
    if (deferredEvent) {
      await deferredEvent.prompt();
      const result = await deferredEvent.userChoice;
      if (result.outcome === "dismissed") dismiss();
      setDeferredEvent(null);
    }
  };

  const show = eligible && !dismissed && (Boolean(deferredEvent) || ios);
  return { show, ios, promptInstall, dismiss };
}
