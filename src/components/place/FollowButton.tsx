"use client";

import { useCallback, useEffect, useState } from "react";
import { Bell, BellOff, Check } from "lucide-react";
import {
  detectPushCapability,
  followBusiness,
  getFollowedBizSlugs,
  unfollowBusiness,
  type PushCapability,
} from "@/lib/push-client";
import { haptic } from "@/lib/haptics";

/**
 * FollowButton — opt in to push notifications for a specific place's
 * specials. Sits next to SaveButton on the place page; same pill
 * footprint, distinct intent.
 *
 * Save = personal bookmark list. Follow = alerts when this business
 * posts a special. We let the user have both, neither, or either.
 *
 * Visual states:
 *   - capability "ready" + not following → "Follow" (brand pill)
 *   - capability "ready" + following     → "Following" (subtle pill + check)
 *   - capability "blocked"               → "Notifications blocked" (muted, disabled)
 *   - capability "unsupported"/"server-disabled" → render nothing
 *   - capability "unknown"               → render nothing (still detecting)
 *
 * Hydration safety: state derives from localStorage + a feature-
 * detect effect, so initial server HTML doesn't carry the wrong text.
 */
export default function FollowButton({
  slug,
  name,
}: {
  slug: string;
  name: string;
}) {
  const [capability, setCapability] = useState<PushCapability>("unknown");
  const [following, setFollowing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [hint, setHint] = useState<string | null>(null);

  // Mount-only feature detect + initial follow state from localStorage.
  // We don't render the button until detection settles to avoid a
  // pop-in of "Follow" → "Notifications blocked" or similar churn.
  useEffect(() => {
    let cancelled = false;
    setFollowing(getFollowedBizSlugs().has(slug));
    void (async () => {
      const cap = await detectPushCapability();
      if (!cancelled) setCapability(cap);
    })();
    return () => {
      cancelled = true;
    };
  }, [slug]);

  const flash = useCallback((msg: string) => {
    setHint(msg);
    window.setTimeout(() => setHint(null), 2500);
  }, []);

  const onClick = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    try {
      if (following) {
        const res = await unfollowBusiness(slug);
        if (res.ok) {
          setFollowing(false);
          haptic("light");
          flash(`Unfollowed ${name}.`);
        }
      } else {
        haptic("medium");
        const res = await followBusiness(slug);
        if (res.ok) {
          setFollowing(true);
          flash(`Following ${name}. We'll ping you for specials.`);
        } else if (res.reason === "permission-denied") {
          flash("Notifications blocked. Re-enable in your browser settings.");
          setCapability("blocked");
        } else if (res.reason === "permission-default") {
          // User dismissed the prompt without choosing — no change.
          flash("Tap again and allow notifications to follow.");
        } else if (res.reason === "server-disabled" || res.reason === "unsupported") {
          flash("Notifications aren't available here yet.");
        } else {
          flash("Couldn't save. Try again in a moment.");
        }
      }
    } finally {
      setBusy(false);
    }
  }, [busy, following, slug, name, flash]);

  // Hide entirely on platforms / configs that can't support push at all.
  if (capability === "unknown" || capability === "unsupported" || capability === "server-disabled") {
    return null;
  }

  const blocked = capability === "blocked";

  return (
    <div className="relative">
      <button
        type="button"
        onClick={onClick}
        disabled={busy || blocked}
        aria-pressed={following}
        aria-label={
          blocked
            ? `Notifications blocked — can't follow ${name}`
            : following
              ? `Unfollow ${name}`
              : `Follow ${name} for specials`
        }
        className="tactile tactile-interactive inline-flex h-9 items-center gap-1.5 rounded-full border px-3 text-[12px] font-semibold transition active:scale-[0.96] disabled:opacity-60"
        style={{
          background: following
            ? "var(--app-bg-elevated)"
            : blocked
              ? "var(--app-bg-sunken)"
              : "var(--app-brand)",
          color: following
            ? "var(--app-ink-2)"
            : blocked
              ? "var(--app-ink-3)"
              : "white",
          borderColor: following
            ? "var(--app-border)"
            : blocked
              ? "var(--app-border)"
              : "var(--app-brand)",
        }}
      >
        {blocked ? (
          <>
            <BellOff className="h-3.5 w-3.5" strokeWidth={2.25} aria-hidden />
            Notifications off
          </>
        ) : following ? (
          <>
            <Check className="h-3.5 w-3.5" strokeWidth={2.5} aria-hidden />
            Following
          </>
        ) : (
          <>
            <Bell className="h-3.5 w-3.5" strokeWidth={2.25} aria-hidden />
            Follow
          </>
        )}
      </button>
      {hint && (
        <span
          role="status"
          className="absolute left-1/2 top-full z-10 mt-1.5 -translate-x-1/2 whitespace-nowrap rounded-full px-2.5 py-1 text-[10.5px] font-medium shadow-[var(--app-shadow-1)]"
          style={{
            background: "var(--app-bg-elevated)",
            color: "var(--app-ink-2)",
            border: "1px solid var(--app-border)",
          }}
        >
          {hint}
        </span>
      )}
    </div>
  );
}
