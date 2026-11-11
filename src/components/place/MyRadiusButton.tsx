"use client";

import { useRef, useState } from "react";
import { Bookmark, BookmarkCheck, Loader2, X } from "lucide-react";
import { useFollowMutationState, useIsFollowed, useToggleFollow, useFollowedSlugs } from "@/hooks/useFollows";
import { useMounted } from "@/hooks/useSaved";
import { haptic } from "@/lib/haptics";
import {
  isInstallPromptSuppressedPath,
  isStandalone,
} from "@/lib/pwa-display";
import {
  currentReturnBridgeState,
  openReturnBridge,
} from "@/lib/return-bridge";
import { notifyError, notifyRemoved, notifySaved } from "@/lib/feedback/notify";
import { trackDecision } from "@/lib/decision/telemetry";

/**
 * MyRadiusButton — the prominent text-style follow CTA the user
 * spec'd for place detail pages.
 *
 * Three states:
 *   - default (not followed)              "Save"
 *   - followed                            "Saved"
 *   - followed + hover/long-press         "Remove"
 * (Wording is literal — "Save"/"Saved" — to match the "Saved" nav tab +
 * page. "My Radius" lingering on the button reintroduced the ambiguity the
 * nav rename removed; the brand name isn't a verb.)
 *
 * Mobile UX:
 *   - The hover state doesn't exist on touch. To remove on mobile,
 *     the user gets a confirmation toast with an Undo-style "Remove"
 *     action — same one-tap exit as the action-feedback pattern
 *     already used by SaveButton.
 *   - Big tap target (44px) per iOS HIG.
 *
 * Auth flow:
 *   - Signed in: tap → confirmed DB write via useToggleFollow.
 *   - Signed out: tap → saves to THIS DEVICE immediately (same silent
 *     localStorage path as the sheet's icon SaveButton), and the toast
 *     carries a quiet "sign in to keep it across devices" line. This CTA
 *     used to redirect anonymous users to /auth/login instead of saving —
 *     the app's most prominent save button punished the tap the icon
 *     version rewarded, and cost an /api/auth/me round trip besides. A
 *     save must never be a login wall; sync is the upsell, not the toll.
 *
 * Visual register:
 *   - Default: brand-filled pill (the call to action stands out).
 *   - Followed: subtle outlined pill with a checked bookmark icon.
 *   - Hover (desktop) on the followed state: red-tinted "Remove".
 *   - Loading: spinner in place of the icon; click is no-op.
 */
export default function MyRadiusButton({
  slug,
  name,
}: {
  slug: string;
  name: string;
}) {
  const mounted = useMounted();
  const isFollowed = useIsFollowed(slug);
  const { authed } = useFollowedSlugs();
  const failureDescriptionRef = useRef<string | null>(null);
  const toggle = useToggleFollow(slug, "place_detail", (description) => { failureDescriptionRef.current = description; });
  const [localBusy, setBusy] = useState(false);
  const [pendingSaved, setPendingSaved] = useState<boolean | null>(null);
  const mutation = useFollowMutationState(slug);
  const busy = localBusy || mutation === "saving" || mutation === "removing";
  const saving = pendingSaved ?? mutation === "saving";
  const busyRef = useRef(false);
  const [hover, setHover] = useState(false);
  const renderedFollowed = isFollowed;

  // Pre-mount: render a placeholder pill so SSR + hydration agree.
  if (!mounted) {
    return (
      <button
        type="button"
        data-place-save={slug}
        aria-hidden
        tabIndex={-1}
        className="tap-44-y inline-flex h-11 items-center gap-2 rounded-[var(--app-radius-sm)] px-1 text-[15px] font-semibold"
        style={{ color: "var(--app-ink)" }}
      >
        {/* Matches the mounted unsaved control exactly, so hydration does
            not shift the action strip's color or width. */}
        <Bookmark className="h-[18px] w-[18px]" strokeWidth={2} aria-hidden style={{ color: "var(--app-ink-2)" }} />
        Save
      </button>
    );
  }

  async function onClick() {
    if (busyRef.current) return;
    busyRef.current = true;
    const wasFollowed = renderedFollowed;
    const returnState = currentReturnBridgeState();
    const modalOpen = Boolean(
      document.querySelector('[role="dialog"][aria-modal="true"]'),
    );
    const offerKeepAction =
      !wasFollowed
      && !isStandalone()
      && !returnState.completed
      && returnState.valueKind === null
      && isInstallPromptSuppressedPath(window.location.pathname)
      && !modalOpen;
    setPendingSaved(!wasFollowed);
    setBusy(true);
    failureDescriptionRef.current = null;
    try {
      // One code path with the sheet's SaveButton: the toggle itself is
      // auth-aware (localStorage when anonymous, confirmed DB write when
      // signed in). Anonymous saves
      // get a quiet sync upsell in the toast, never a login detour.
      const nowFollowed = await toggle(!wasFollowed);
      if (failureDescriptionRef.current !== null || nowFollowed === wasFollowed) throw new Error("Save state did not change");
      haptic(nowFollowed ? "medium" : "light");
      if (nowFollowed) {
        trackDecision({
          stage: "action",
          surface: "place",
          entityKind: "place",
          entityId: slug,
          position: "detail",
          action: "save",
        });
        notifySaved({
          label: name,
          description: authed ? undefined : "On this device. Sign in to keep saves everywhere.",
          onUndo: () => void undo(nowFollowed),
          forward: offerKeepAction ? { label: "Keep handy", onClick: openReturnBridge } : undefined,
          item: { type: "place", id: slug },
        });
      } else {
        notifyRemoved({ label: name, onUndo: () => void undo(nowFollowed), item: { type: "place", id: slug } });
      }
    } catch {
      notifyError({
        title: wasFollowed ? "Could not remove from Saved" : "Could not save this place",
        description: failureDescriptionRef.current ?? "We could not confirm this change. Please try again.",
      });
    } finally {
      setPendingSaved(null);
      setBusy(false);
      busyRef.current = false;
    }
  }

  async function undo(wasFollowed: boolean) {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setPendingSaved(!wasFollowed);
    failureDescriptionRef.current = null;
    try {
      const nextFollowed = await toggle(!wasFollowed);
      if (failureDescriptionRef.current !== null || nextFollowed === wasFollowed) throw new Error("Save state did not change");
    } catch {
      notifyError({
        title: "Could not undo this change",
        description: failureDescriptionRef.current ?? "We could not confirm this change. Please try again.",
      });
    } finally {
      setPendingSaved(null);
      setBusy(false);
      busyRef.current = false;
    }
  }

  // Visual variants
  if (renderedFollowed) {
    const showRemove = hover && !busy;
    return (
      <button
        type="button"
        data-place-save={slug}
        onClick={onClick}
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
        disabled={busy}
        aria-pressed={true}
        aria-busy={busy}
        aria-label={busy ? `${saving ? "Saving" : "Removing"} ${name}` : `Saved. Tap to remove ${name}`}
        title={mutation === "unconfirmed" ? "This change could not be confirmed." : undefined}
        className="tap-44-y inline-flex h-11 items-center gap-2 rounded-[var(--app-radius-sm)] px-1 text-[15px] font-semibold transition-colors hover:underline disabled:opacity-60"
        style={{
          // The saved state keeps the link color and a checked bookmark, so
          // it reads as different from the ink "Save" at a glance.
          color: showRemove ? "var(--app-danger-text)" : "var(--app-link)",
        }}
      >
        {busy ? (
          <>
            <Loader2 className="h-[18px] w-[18px] animate-spin motion-reduce:animate-none" strokeWidth={2} aria-hidden />
            {saving ? "Saving…" : "Removing…"}
          </>
        ) : showRemove ? (
          <>
            <X className="h-[18px] w-[18px]" strokeWidth={2} aria-hidden />
            Remove
          </>
        ) : (
          <>
            <BookmarkCheck className="h-[18px] w-[18px]" strokeWidth={2} aria-hidden />
            Saved
          </>
        )}
      </button>
    );
  }

  return (
    <button
      type="button"
      data-place-save={slug}
      onClick={onClick}
      disabled={busy}
      aria-pressed={false}
      aria-busy={busy}
      aria-label={busy ? `${saving ? "Saving" : "Removing"} ${name}` : `Save ${name}`}
      title={mutation === "unconfirmed" ? "This change could not be confirmed." : undefined}
      className="tap-44-y inline-flex h-11 items-center gap-2 rounded-[var(--app-radius-sm)] px-1 text-[15px] font-semibold transition-colors hover:underline disabled:opacity-60"
      style={{ color: "var(--app-ink)" }}
    >
      {busy ? (
        <>
          <Loader2 className="h-[18px] w-[18px] animate-spin motion-reduce:animate-none" strokeWidth={2} aria-hidden />
          {saving ? "Saving…" : "Removing…"}
        </>
      ) : (
        <>
          <Bookmark className="h-[18px] w-[18px]" strokeWidth={2} aria-hidden style={{ color: "var(--app-ink-2)" }} />
          Save
        </>
      )}
    </button>
  );
}
