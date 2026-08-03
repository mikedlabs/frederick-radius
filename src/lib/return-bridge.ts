import { isIosDevice, isIosSafariUserAgent } from "@/lib/pwa-display";

export const RETURN_BRIDGE_STORAGE_KEY = "fr:return-bridge:v1";
export const RETURN_BRIDGE_INSTALLED_SESSION_KEY = "fr:return-bridge:installed:v1";
export const RETURN_BRIDGE_INSTALLED_EVENT = "fr:return-bridge:installed";
export const RETURN_BRIDGE_VALUE_EVENT = "fr:return-bridge:value";
export const RETURN_BRIDGE_VALUE_CANCEL_EVENT = "fr:return-bridge:value-cancel";
export const RETURN_BRIDGE_OPEN_EVENT = "fr:open-install";

export const RETURN_BRIDGE_SESSION_GAP_MS = 30 * 60 * 1000;
// One automatic invitation is enough. Saved, Compass, and Settings retain a
// deliberate way to reopen the instructions without nagging someone again.
export const RETURN_BRIDGE_MAX_AUTO_DISMISSALS = 1;

export type ReturnBridgeValueKind =
  | "place"
  | "event"
  | "radius"
  | "transit-stop"
  | "transit-bus"
  | "home-area";

export type ReturnBridgeState = {
  sessions: number;
  lastSessionAt: number;
  valueKind: ReturnBridgeValueKind | null;
  valueAt: number;
  dismissals: number;
  snoozedUntil: number;
  autoDisabled: boolean;
  completed: boolean;
  lastOfferAt: number;
};

export type ReturnBridgeOfferReason = "value" | "social" | "return";

const RETURN_BRIDGE_OFFER_PRIORITY: Record<ReturnBridgeOfferReason, number> = {
  social: 1,
  return: 2,
  value: 3,
};

export type ReturnBridgeSurface =
  | "installed"
  | "native"
  | "ios-safari"
  | "ios-chrome"
  | "ios-browser"
  | "embedded-ios"
  | "embedded-android"
  | "mobile-browser"
  | "desktop";

const VALUE_KINDS = new Set<ReturnBridgeValueKind>([
  "place",
  "event",
  "radius",
  "transit-stop",
  "transit-bus",
  "home-area",
]);

export function isReturnBridgeValueKind(
  value: unknown,
): value is ReturnBridgeValueKind {
  return typeof value === "string"
    && VALUE_KINDS.has(value as ReturnBridgeValueKind);
}

const EMPTY_STATE: ReturnBridgeState = {
  sessions: 0,
  lastSessionAt: 0,
  valueKind: null,
  valueAt: 0,
  dismissals: 0,
  snoozedUntil: 0,
  autoDisabled: false,
  completed: false,
  lastOfferAt: 0,
};

function finiteNonNegative(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? value
    : 0;
}

export function emptyReturnBridgeState(): ReturnBridgeState {
  return { ...EMPTY_STATE };
}

/** Parse old, partial, or malformed device state without creating a permanent trap. */
export function parseReturnBridgeState(raw: string | null): ReturnBridgeState {
  if (!raw) return emptyReturnBridgeState();
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return emptyReturnBridgeState();
    }
    const dismissals = Math.min(
      RETURN_BRIDGE_MAX_AUTO_DISMISSALS,
      Math.floor(finiteNonNegative(parsed.dismissals)),
    );
    const valueKind = isReturnBridgeValueKind(parsed.valueKind)
      ? parsed.valueKind
      : null;
    return {
      sessions: Math.floor(finiteNonNegative(parsed.sessions)),
      lastSessionAt: finiteNonNegative(parsed.lastSessionAt),
      valueKind,
      valueAt: valueKind ? finiteNonNegative(parsed.valueAt) : 0,
      dismissals,
      snoozedUntil: finiteNonNegative(parsed.snoozedUntil),
      autoDisabled:
        parsed.autoDisabled === true
        || dismissals >= RETURN_BRIDGE_MAX_AUTO_DISMISSALS,
      completed: parsed.completed === true,
      lastOfferAt: finiteNonNegative(parsed.lastOfferAt),
    };
  } catch {
    return emptyReturnBridgeState();
  }
}

export function beginReturnBridgeSession(
  state: ReturnBridgeState,
  now = Date.now(),
): ReturnBridgeState {
  const isNewSession =
    !state.lastSessionAt
    || now - state.lastSessionAt > RETURN_BRIDGE_SESSION_GAP_MS;
  return {
    ...state,
    sessions: state.sessions + (isNewSession ? 1 : 0),
    lastSessionAt: now,
  };
}

export function recordReturnBridgeValue(
  state: ReturnBridgeState,
  valueKind: ReturnBridgeValueKind,
  now = Date.now(),
): ReturnBridgeState {
  return {
    ...state,
    valueKind,
    valueAt: now,
  };
}

export function clearPendingReturnBridgeValue(
  state: ReturnBridgeState,
  valueKind: ReturnBridgeValueKind,
): ReturnBridgeState {
  if (
    state.valueKind !== valueKind
    || state.valueAt <= state.lastOfferAt
  ) {
    return state;
  }
  return {
    ...state,
    valueKind: null,
    valueAt: 0,
  };
}

export function markReturnBridgeOfferShown(
  state: ReturnBridgeState,
  now = Date.now(),
): ReturnBridgeState {
  return { ...state, lastOfferAt: now };
}

export function dismissReturnBridge(
  state: ReturnBridgeState,
): ReturnBridgeState {
  const dismissals = Math.min(
    RETURN_BRIDGE_MAX_AUTO_DISMISSALS,
    state.dismissals + 1,
  );
  return {
    ...state,
    dismissals,
    snoozedUntil: 0,
    autoDisabled: true,
  };
}

export function completeReturnBridge(state: ReturnBridgeState): ReturnBridgeState {
  return {
    ...state,
    completed: true,
    autoDisabled: true,
    snoozedUntil: 0,
  };
}

export function returnBridgeOfferReason(
  state: ReturnBridgeState,
  options: { socialEntry: boolean; now?: number },
): ReturnBridgeOfferReason | null {
  const now = options.now ?? Date.now();
  if (
    state.completed
    || state.autoDisabled
    || state.snoozedUntil > now
  ) {
    return null;
  }
  if (state.valueKind && state.valueAt > state.lastOfferAt) return "value";
  if (options.socialEntry && state.lastOfferAt === 0) return "social";
  if (state.sessions >= 2) return "return";
  return null;
}

export function shouldReplaceReturnBridgeOffer(
  current: ReturnBridgeOfferReason | null,
  next: ReturnBridgeOfferReason,
): boolean {
  return (
    current === null
    || RETURN_BRIDGE_OFFER_PRIORITY[next] > RETURN_BRIDGE_OFFER_PRIORITY[current]
  );
}

export function shouldSignalHomeAreaValue(
  previous: string | null,
  next: string | null,
): boolean {
  return next !== null && next !== previous;
}

export function isEmbeddedBrowserUserAgent(userAgent: string): boolean {
  return /FBAN|FBAV|Instagram|Threads|TikTok|BytedanceWebview|musical_ly|Snapchat|Line\/|LinkedInApp|Pinterest|Reddit|Twitter for|;\s*wv\)/i.test(userAgent);
}

export function embeddedBrowserName(userAgent: string): string {
  if (/Instagram/i.test(userAgent)) return "Instagram";
  if (/FBAN|FBAV/i.test(userAgent)) return "Facebook";
  if (/Threads/i.test(userAgent)) return "Threads";
  if (/TikTok|BytedanceWebview|musical_ly/i.test(userAgent)) return "TikTok";
  if (/Reddit/i.test(userAgent)) return "Reddit";
  if (/Twitter for/i.test(userAgent)) return "X";
  if (/LinkedInApp/i.test(userAgent)) return "LinkedIn";
  if (/Pinterest/i.test(userAgent)) return "Pinterest";
  if (/Snapchat/i.test(userAgent)) return "Snapchat";
  if (/Line\//i.test(userAgent)) return "LINE";
  return "another app";
}

const SOCIAL_SOURCE_NAMES = new Set([
  "facebook",
  "fb",
  "instagram",
  "ig",
  "threads",
  "tiktok",
  "reddit",
  "x",
  "twitter",
  "linkedin",
  "pinterest",
  "snapchat",
]);

const SOCIAL_REFERRER_HOSTS = [
  "facebook.com",
  "instagram.com",
  "threads.net",
  "tiktok.com",
  "reddit.com",
  "t.co",
  "twitter.com",
  "x.com",
  "linkedin.com",
  "pinterest.com",
  "snapchat.com",
];

function hostMatches(hostname: string, domain: string): boolean {
  return hostname === domain || hostname.endsWith(`.${domain}`);
}

/** Bounded entry provenance catches social webviews that disguise their UA. */
export function isSocialEntry(options: {
  userAgent: string;
  referrer?: string;
  currentUrl?: string;
}): boolean {
  if (isEmbeddedBrowserUserAgent(options.userAgent)) return true;

  if (options.referrer) {
    try {
      const hostname = new URL(options.referrer).hostname.toLowerCase();
      if (SOCIAL_REFERRER_HOSTS.some((domain) => hostMatches(hostname, domain))) {
        return true;
      }
    } catch {
      // Ignore malformed or privacy-trimmed referrers.
    }
  }

  if (options.currentUrl) {
    try {
      const source = new URL(options.currentUrl).searchParams
        .get("utm_source")
        ?.trim()
        .toLowerCase();
      if (source && SOCIAL_SOURCE_NAMES.has(source)) return true;
    } catch {
      // Ignore malformed entry URLs.
    }
  }

  return false;
}

export function isIosChromeUserAgent(userAgent: string): boolean {
  return /CriOS\//i.test(userAgent);
}

export function returnBridgeSurface(options: {
  userAgent: string;
  maxTouchPoints?: number;
  hasNativePrompt: boolean;
  standalone: boolean;
}): ReturnBridgeSurface {
  if (options.standalone) return "installed";
  if (options.hasNativePrompt) return "native";

  const embedded = isEmbeddedBrowserUserAgent(options.userAgent);
  const ios = isIosDevice(options.userAgent, options.maxTouchPoints ?? 0);
  if (ios && embedded) return "embedded-ios";
  if (ios && isIosChromeUserAgent(options.userAgent)) return "ios-chrome";
  if (ios && isIosSafariUserAgent(options.userAgent)) return "ios-safari";
  if (ios) return "ios-browser";
  if (/Android/i.test(options.userAgent) && embedded) return "embedded-android";
  if (/Android|Mobile/i.test(options.userAgent)) return "mobile-browser";
  return "desktop";
}

const PRIVATE_QUERY_KEYS = new Set([
  "access_token",
  "api_key",
  "apikey",
  "auth",
  "beta",
  "code",
  "email",
  "id_token",
  "invite",
  "magic_link",
  "password",
  "refresh_token",
  "session_token",
  "token",
]);

function isPrivateShareKey(key: string): boolean {
  const normalized = key.toLowerCase();
  return PRIVATE_QUERY_KEYS.has(normalized) || normalized.endsWith("_token");
}

/** Keep the useful deep link while stripping values that should never be shared. */
export function safeReturnLink(rawUrl: string): string {
  try {
    const url = new URL(rawUrl);
    if (url.protocol !== "https:" && url.protocol !== "http:") return "";
    for (const key of [...url.searchParams.keys()]) {
      if (isPrivateShareKey(key)) url.searchParams.delete(key);
    }

    // The setup hash is an internal control surface, not a useful return
    // destination. A copied Settings/Compass setup link should reopen Today.
    if (url.hash.toLowerCase() === "#keep-radius") {
      url.pathname = "/today";
      url.hash = "";
    } else if (url.hash.includes("=")) {
      const hadQuestionPrefix = url.hash.startsWith("#?");
      const fragmentParams = new URLSearchParams(
        url.hash.slice(hadQuestionPrefix ? 2 : 1),
      );
      let scrubbed = false;
      for (const key of [...fragmentParams.keys()]) {
        if (!isPrivateShareKey(key)) continue;
        fragmentParams.delete(key);
        scrubbed = true;
      }
      if (scrubbed) {
        const nextFragment = fragmentParams.toString();
        url.hash = nextFragment
          ? `${hadQuestionPrefix ? "?" : ""}${nextFragment}`
          : "";
      }
    }
    return url.toString();
  } catch {
    return "";
  }
}

function readBrowserState(): ReturnBridgeState {
  if (typeof window === "undefined") return emptyReturnBridgeState();
  try {
    return parseReturnBridgeState(
      window.localStorage.getItem(RETURN_BRIDGE_STORAGE_KEY),
    );
  } catch {
    return emptyReturnBridgeState();
  }
}

export function writeReturnBridgeState(state: ReturnBridgeState): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(RETURN_BRIDGE_STORAGE_KEY, JSON.stringify(state));
  } catch {
    // The in-page event still makes the current session useful when storage is blocked.
  }
}

/** Record value before dispatching so onboarding-to-Today and hard navigations keep it. */
export function signalReturnBridgeValue(valueKind: ReturnBridgeValueKind): void {
  if (typeof window === "undefined") return;
  const next = recordReturnBridgeValue(readBrowserState(), valueKind);
  writeReturnBridgeState(next);
  window.dispatchEvent(
    new CustomEvent<ReturnBridgeValueKind>(RETURN_BRIDGE_VALUE_EVENT, {
      detail: valueKind,
    }),
  );
}

/** Withdraw an unshown save signal when the value was undone. */
export function cancelPendingReturnBridgeValue(
  valueKind: ReturnBridgeValueKind,
): void {
  if (typeof window === "undefined") return;
  const current = readBrowserState();
  const next = clearPendingReturnBridgeValue(current, valueKind);
  if (next !== current) writeReturnBridgeState(next);
  window.dispatchEvent(
    new CustomEvent<ReturnBridgeValueKind>(RETURN_BRIDGE_VALUE_CANCEL_EVENT, {
      detail: valueKind,
    }),
  );
}

export function markReturnBridgeInstalledThisSession(): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(RETURN_BRIDGE_INSTALLED_SESSION_KEY, "1");
  } catch {
    // Standalone display mode remains the durable source on the next launch.
  }
  window.dispatchEvent(new Event(RETURN_BRIDGE_INSTALLED_EVENT));
}

export function wasReturnBridgeInstalledThisSession(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.sessionStorage.getItem(RETURN_BRIDGE_INSTALLED_SESSION_KEY) === "1";
  } catch {
    return false;
  }
}

export function openReturnBridge(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(RETURN_BRIDGE_OPEN_EVENT));
}

export function currentReturnBridgeState(): ReturnBridgeState {
  return readBrowserState();
}
