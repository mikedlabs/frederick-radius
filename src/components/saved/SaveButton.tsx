"use client";

import { useEffect, useState } from "react";
import { useIsSaved, useToggleSave, useMounted, useSavedList } from "@/hooks/useSaved";
import { useIsFollowed, useToggleFollow } from "@/hooks/useFollows";
import { Bookmark } from "lucide-react";
import { haptic } from "@/lib/haptics";
import { subscribeDevicePush } from "@/lib/pushSubscribe";
import { track } from "@/lib/track";
import { toast } from "sonner";

/**
 * critic-1: mirror an EVENT save into the device's server-side reminder
 * registry (/api/saved), so the "one hour before something you saved" cron can
 * reach this device. Only runs when the device already has a push subscription
 * (getSubscription() non-null) — no consent, no record, and we never force a
 * permission prompt. Best-effort + fire-and-forget: the localStorage save is
 * the source of truth; a failed sync must never block or surface. Mirrors
 * syncFollowPushTopic in useFollows.
 */
async function syncSavedEventReminder(slug: string, save: boolean): Promise<void> {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;
  try {
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription();
    if (!sub) return; // no push consent on this device → no reminder possible
    await fetch("/api/saved", {
      method: save ? "POST" : "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ slug, endpoint: sub.endpoint }),
    });
  } catch {
    /* best-effort side channel; never surface or block the save */
  }
}

const PUSH_NUDGE_KEY = "fr:push-nudge:v1";

/** One-shot, contextual push opt-in at the moment it earns its keep: the user
 *  just saved an EVENT, reminders exist (the /api/saved registry + hourly
 *  cron), but the machinery silently no-ops without a push subscription — and
 *  the only place to create one was three taps deep in Settings. Offered ONCE
 *  ever per device, only when permission is still undecided; a dismissal is
 *  final (Settings remains the deliberate path). Never the browser prompt
 *  cold: the toast asks first, in our voice, and the browser prompt appears
 *  only after an explicit "Remind me". */
async function maybeOfferEventReminders(slug: string): Promise<void> {
  try {
    if (typeof window === "undefined" || !("Notification" in window)) return;
    if (Notification.permission !== "default") return; // already granted or blocked
    if (window.localStorage.getItem(PUSH_NUDGE_KEY)) return; // offered before
    window.localStorage.setItem(PUSH_NUDGE_KEY, "1");
    const reg = await navigator.serviceWorker?.ready;
    if (await reg?.pushManager.getSubscription()) return; // already wired
    toast("Want a nudge an hour before it starts?", {
      description: "One reminder per saved event. Nothing else.",
      duration: 8000,
      action: {
        label: "Remind me",
        onClick: () => {
          void subscribeDevicePush().then((r) => {
            if (r === "subscribed") {
              track("push_optin", { source: "event_save" });
              // The subscription now exists, so the reminder registry write
              // that no-opped during the save can succeed — re-run it.
              void syncSavedEventReminder(slug, true);
              toast.success("You'll get a nudge an hour before.");
            } else if (r === "denied" || r === "dismissed") {
              toast("No reminders then. You can change this in Settings.");
            }
          });
        },
      },
    });
  } catch {
    /* the nudge must never break a save */
  }
}

export default function SaveButton({
  refType,
  refId,
  label,
}: {
  refType: "place" | "event" | "radius";
  refId: string;
  label: string;
}) {
  const mounted = useMounted();
  // For places, route through the auth-aware useFollows hook: writes
  // hit the DB when signed in, fall back to localStorage when signed
  // out. Events + radii stay on the legacy useSaved hook by design
  // (Phase 1 brief framed sync as "follow PLACES"; broader sync later).
  const placeFollowed = useIsFollowed(refType === "place" ? refId : "");
  const togglePlace = useToggleFollow(refId, "icon");
  const legacyIsSaved = useIsSaved(refType, refId);
  const legacyToggle = useToggleSave(refType, refId);
  const isSaved = refType === "place" ? placeFollowed : legacyIsSaved;
  const toggle =
    refType === "place" ? () => void togglePlace() : legacyToggle;
  // Pre-toggle total. Used to detect the user's first save ever —
  // when totalBefore is 0 AND the user is about to save, the next
  // tap is the moment that promotes a stranger into someone who has
  // started keeping a list. Marked with editorial copy below.
  const totalBefore = useSavedList().length;
  // Track a brief "celebration" window after a fresh save so we can
  // overshoot-pop the icon and radiate a one-shot ring. The flag is
  // reset by an animation-end timer; the actual saved-state is the
  // source of truth. We use the "set state during render based on
  // prop change" pattern so we never cascade setState from an effect.
  const [celebrate, setCelebrate] = useState(false);
  const [prev, setPrev] = useState(isSaved);
  if (isSaved !== prev) {
    setPrev(isSaved);
    if (!prev && isSaved) setCelebrate(true);
  }
  useEffect(() => {
    if (!celebrate) return;
    const t = window.setTimeout(() => setCelebrate(false), 520);
    return () => window.clearTimeout(t);
  }, [celebrate]);

  if (!mounted) {
    return (
      <button
        type="button"
        aria-hidden
        tabIndex={-1}
        className="tap-44 grid h-9 w-9 place-items-center rounded-full"
        style={{ color: "var(--app-ink-3)" }}
      >
        <Bookmark className="h-4 w-4" strokeWidth={1.75} />
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        haptic(isSaved ? "light" : "medium");
        toggle();
        if (refType === "event") track("save_event", { on: !isSaved });
        // Event saves also register a device-scoped reminder (critic-1).
        // isSaved is the PRE-toggle state, so the new state is !isSaved.
        if (refType === "event") void syncSavedEventReminder(refId, !isSaved);
        // First event save on a device with undecided notification permission:
        // offer the reminder loop right where it pays off (one-shot ever).
        if (refType === "event" && !isSaved) void maybeOfferEventReminders(refId);
        // Sonner toast — quiet, brand-aligned acknowledgement so the
        // user sees something happen even if the bookmark animation
        // is missed at a glance. Undo action mirrors the toggle so
        // a mistaken save is one tap to reverse.
        if (isSaved) {
          toast(`Removed from Saved`, {
            action: { label: "Undo", onClick: () => toggle() },
          });
        } else if (totalBefore === 0) {
          // First add ever — moment worth marking. Editorial copy
          // instead of the routine acknowledgement, plus a longer
          // dwell so the user has time to read what just happened.
          toast.success("Your saved list starts here", {
            description: "Save places you care about. Find them all under Saved.",
            duration: 5000,
            action: { label: "Undo", onClick: () => toggle() },
          });
        } else {
          toast.success(`Saved · ${label.replace(/^Save\s+/, "")}`, {
            action: { label: "Undo", onClick: () => toggle() },
          });
        }
      }}
      aria-pressed={isSaved}
      // `label` arrives as "Save {name}"; strip the verb so the aria reads
      // cleanly ("Save {name}" / "Remove {name} from Saved") instead of the
      // doubled "Add Save {name} to Saved".
      aria-label={
        isSaved
          ? `Remove ${label.replace(/^Save\s+/, "")} from Saved`
          : `Save ${label.replace(/^Save\s+/, "")}`
      }
      title={isSaved ? "Saved" : "Save"}
      className="tap-44 relative grid h-9 w-9 place-items-center rounded-full transition-colors hover:bg-[var(--app-bg-sunken)] active:scale-[0.92]"
      style={{
        color: isSaved ? "var(--app-cool)" : "var(--app-ink-3)",
        transitionTimingFunction: "var(--app-ease-spring)",
      }}
    >
      <Bookmark
        className={`h-4 w-4 transition-transform ${
          celebrate ? "save-pop" : ""
        }`}
        strokeWidth={isSaved ? 0 : 1.75}
        fill={isSaved ? "currentColor" : "none"}
        style={{ transitionTimingFunction: "var(--app-ease-spring)" }}
      />
      {celebrate && (
        <span
          aria-hidden
          className="save-ring pointer-events-none absolute inset-0 rounded-full"
        />
      )}
    </button>
  );
}
