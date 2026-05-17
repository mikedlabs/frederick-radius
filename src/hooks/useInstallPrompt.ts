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

function isIos(): boolean {
  if (typeof window === "undefined") return false;
  return /iPad|iPhone|iPod/.test(window.navigator.userAgent);
}

function wasDismissed(): boolean {
  if (typeof window === "undefined") return true;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return false;
    const at = parseInt(raw, 10);
    // Don't re-show for 30 days after dismissal
    return Date.now() - at < 30 * 24 * 60 * 60 * 1000;
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
  const ios = isIos();

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
    setEligible(
      !isStandalone() &&
      !wasDismissed() &&
      (updated.sessions >= 2 || updated.interactions >= 5)
    );

    const handler = (event: Event) => {
      event.preventDefault();
      setDeferredEvent(event as BeforeInstallPromptEvent);
    };
    window.addEventListener("beforeinstallprompt", handler);
    return () => window.removeEventListener("beforeinstallprompt", handler);
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
