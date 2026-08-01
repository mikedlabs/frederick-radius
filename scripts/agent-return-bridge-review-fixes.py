from __future__ import annotations

from pathlib import Path


def replace_once(path: str, old: str, new: str) -> None:
    target = Path(path)
    text = target.read_text()
    count = text.count(old)
    if count != 1:
        raise SystemExit(
            f"{path}: expected one replacement, found {count}\n"
            f"--- needle ---\n{old}"
        )
    target.write_text(text.replace(old, new, 1))


# ---------------------------------------------------------------------------
# Preferences: only a real town change earns a value-qualified return offer,
# and clearing preferences withdraws any unshown home-area signal.
# ---------------------------------------------------------------------------
replace_once(
    "src/components/settings/PreferencesPanel.tsx",
    '''import {
  cancelPendingReturnBridgeValue,
  signalReturnBridgeValue,
} from "@/lib/return-bridge";''',
    '''import {
  cancelPendingReturnBridgeValue,
  shouldSignalHomeAreaValue,
  signalReturnBridgeValue,
} from "@/lib/return-bridge";''',
)
replace_once(
    "src/components/settings/PreferencesPanel.tsx",
    '''  const changeMuni = useCallback((slug: string | null) => {
    haptic("light");
    setMuni(slug);
    setHomeMuni(slug);
    if (slug && getHomeMuni() === slug) signalReturnBridgeValue("home-area");
    if (!slug) cancelPendingReturnBridgeValue("home-area");
    setMuniEditing(false);
  }, []);''',
    '''  const changeMuni = useCallback((slug: string | null) => {
    const previous = getHomeMuni();
    haptic("light");
    setMuni(slug);
    setHomeMuni(slug);
    if (shouldSignalHomeAreaValue(previous, slug)) {
      signalReturnBridgeValue("home-area");
    }
    if (!slug) cancelPendingReturnBridgeValue("home-area");
    setMuniEditing(false);
  }, []);''',
)
replace_once(
    "src/components/settings/PreferencesPanel.tsx",
    '''    haptic("medium");
    setHomeMuni(null);
    setInterests([]);''',
    '''    haptic("medium");
    setHomeMuni(null);
    cancelPendingReturnBridgeValue("home-area");
    setInterests([]);''',
)

# ---------------------------------------------------------------------------
# Authenticated follows: do not clear the pending place value until the DELETE
# actually succeeds, and decide against the latest shared store.
# ---------------------------------------------------------------------------
replace_once(
    "src/hooks/useFollows.ts",
    '''  return { next, wasFollowed };
}

/* ----------------------------------------------------------------------''',
    '''  return { next, wasFollowed };
}

export function shouldCancelPlaceReturnBridgeAfterDelete(
  wasFollowed: boolean,
  live: ReadonlySet<string> | null,
  slug: string,
): boolean {
  return (
    wasFollowed
    && live !== null
    && !live.has(slug)
    && live.size === 0
  );
}

/* ----------------------------------------------------------------------''',
)
replace_once(
    "src/hooks/useFollows.ts",
    '''    writeRemote(next);
    if (wasFollowed && next.size === 0) {
      cancelPendingReturnBridgeValue("place");
    }
    track("save_place", { on: !wasFollowed, source: source ?? "place_detail", synced: true });''',
    '''    writeRemote(next);
    track("save_place", { on: !wasFollowed, source: source ?? "place_detail", synced: true });''',
)
replace_once(
    "src/hooks/useFollows.ts",
    '''        if (!r.ok) throw new Error("follow write failed");
        if (!wasFollowed && remoteStore?.has(slug)) {
          signalReturnBridgeValue("place");
        }
        // Only mirror the push topic once the follow actually persisted, so a''',
    '''        if (!r.ok) throw new Error("follow write failed");
        if (
          shouldCancelPlaceReturnBridgeAfterDelete(
            wasFollowed,
            remoteStore,
            slug,
          )
        ) {
          cancelPendingReturnBridgeValue("place");
        } else if (!wasFollowed && remoteStore?.has(slug)) {
          signalReturnBridgeValue("place");
        }
        // Only mirror the push topic once the follow actually persisted, so a''',
)
replace_once(
    "tests/follows-toggle.spec.ts",
    '''import { toggleSlug } from "@/hooks/useFollows";''',
    '''import {
  shouldCancelPlaceReturnBridgeAfterDelete,
  toggleSlug,
} from "@/hooks/useFollows";''',
)
replace_once(
    "tests/follows-toggle.spec.ts",
    '''  it("round-trips back to the original membership", () => {
    const start = new Set<string>(["volt"]);
    const added = toggleSlug(start, "sky-stage").next;
    const removed = toggleSlug(added, "sky-stage").next;
    expect([...removed].sort()).toEqual([...start].sort());
  });
});''',
    '''  it("round-trips back to the original membership", () => {
    const start = new Set<string>(["volt"]);
    const added = toggleSlug(start, "sky-stage").next;
    const removed = toggleSlug(added, "sky-stage").next;
    expect([...removed].sort()).toEqual([...start].sort());
  });
});

describe("place Return Bridge cleanup", () => {
  it("cancels only after a successful delete leaves the latest store empty", () => {
    expect(
      shouldCancelPlaceReturnBridgeAfterDelete(
        true,
        new Set<string>(),
        "brewers-alley",
      ),
    ).toBe(true);
  });

  it("preserves the signal when the delete failed or another follow remains", () => {
    expect(
      shouldCancelPlaceReturnBridgeAfterDelete(
        true,
        new Set<string>(["brewers-alley"]),
        "brewers-alley",
      ),
    ).toBe(false);
    expect(
      shouldCancelPlaceReturnBridgeAfterDelete(
        true,
        new Set<string>(["sky-stage"]),
        "brewers-alley",
      ),
    ).toBe(false);
    expect(
      shouldCancelPlaceReturnBridgeAfterDelete(
        false,
        new Set<string>(),
        "brewers-alley",
      ),
    ).toBe(false);
  });
});''',
)

# ---------------------------------------------------------------------------
# Transit: an in-session save is still useful when localStorage is blocked.
# ---------------------------------------------------------------------------
replace_once(
    "src/components/transit/useSavedTransitBuses.ts",
    '''  return persistent;
}

export function useSavedTransitBuses(): {''',
    '''  return persistent;
}

export function shouldSignalSavedTransitBus(
  result: Pick<SavedBusToggleResult, "saved" | "limitReached">,
): boolean {
  return result.saved && !result.limitReached;
}

export function useSavedTransitBuses(): {''',
)
replace_once(
    "src/components/transit/useSavedTransitBuses.ts",
    '''    if (result.saved && persistent && !result.limitReached) {
      signalReturnBridgeValue("transit-bus");''',
    '''    if (shouldSignalSavedTransitBus(result)) {
      signalReturnBridgeValue("transit-bus");''',
)

# ---------------------------------------------------------------------------
# Return Bridge: value-qualified prompts supersede lower-priority timers.
# ---------------------------------------------------------------------------
replace_once(
    "src/lib/return-bridge.ts",
    '''export type ReturnBridgeOfferReason = "value" | "social" | "return";

export type ReturnBridgeSurface =''',
    '''export type ReturnBridgeOfferReason = "value" | "social" | "return";

const RETURN_BRIDGE_OFFER_PRIORITY: Record<ReturnBridgeOfferReason, number> = {
  social: 1,
  return: 2,
  value: 3,
};

export type ReturnBridgeSurface =''',
)
replace_once(
    "src/lib/return-bridge.ts",
    '''export function isEmbeddedBrowserUserAgent(userAgent: string): boolean {''',
    '''export function shouldReplaceReturnBridgeOffer(
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

export function isEmbeddedBrowserUserAgent(userAgent: string): boolean {''',
)
replace_once(
    "src/hooks/useInstallPrompt.ts",
    '''  returnBridgeOfferReason,
  returnBridgeSurface,
  writeReturnBridgeState,''',
    '''  returnBridgeOfferReason,
  returnBridgeSurface,
  shouldReplaceReturnBridgeOffer,
  writeReturnBridgeState,''',
)
replace_once(
    "src/hooks/useInstallPrompt.ts",
    '''    const schedule = (nextReason: ReturnBridgeOfferReason) => {
      if (revealTimerRef.current || eligibleRef.current) return;
      revealReasonRef.current = nextReason;''',
    '''    const schedule = (nextReason: ReturnBridgeOfferReason) => {
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
      revealReasonRef.current = nextReason;''',
)
replace_once(
    "src/lib/return-bridge.spec.ts",
    '''  safeReturnLink,
} from "./return-bridge";''',
    '''  safeReturnLink,
  shouldReplaceReturnBridgeOffer,
  shouldSignalHomeAreaValue,
} from "./return-bridge";''',
)
replace_once(
    "src/lib/return-bridge.spec.ts",
    '''  it("withdraws only an unshown matching save signal", () => {
    const saved = recordReturnBridgeValue(emptyReturnBridgeState(), "event", NOW);
    expect(clearPendingReturnBridgeValue(saved, "place")).toBe(saved);
    expect(clearPendingReturnBridgeValue(saved, "event")).toEqual(
      expect.objectContaining({ valueKind: null, valueAt: 0 }),
    );

    const shown = markReturnBridgeOfferShown(saved, NOW + 1);
    expect(clearPendingReturnBridgeValue(shown, "event")).toBe(shown);
  });
});''',
    '''  it("withdraws only an unshown matching save signal", () => {
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
});''',
)

# Keep the event resolver option shape readable after the automated hardening.
replace_once(
    "src/lib/loaders/liveEvents.ts",
    '''  options: {
  signal?: AbortSignal;
  deadline?: number;
  allowNetwork?: boolean;
} = {},''',
    '''  options: {
    signal?: AbortSignal;
    deadline?: number;
    allowNetwork?: boolean;
  } = {},''',
)

Path("src/components/transit/useSavedTransitBuses.spec.ts").write_text(
    '''import { describe, expect, it } from "vitest";
import { shouldSignalSavedTransitBus } from "./useSavedTransitBuses";

describe("saved transit bus Return Bridge signal", () => {
  it("signals a useful in-session save independently of storage persistence", () => {
    expect(
      shouldSignalSavedTransitBus({ saved: true, limitReached: false }),
    ).toBe(true);
  });

  it("does not signal removals or rejected over-limit saves", () => {
    expect(
      shouldSignalSavedTransitBus({ saved: false, limitReached: false }),
    ).toBe(false);
    expect(
      shouldSignalSavedTransitBus({ saved: true, limitReached: true }),
    ).toBe(false);
  });
});
'''
)

print("Return Bridge review fixes applied successfully.")
