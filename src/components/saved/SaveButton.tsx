"use client";

import { useEffect, useRef, useState } from "react";
import { useIsSaved, useToggleSave, useMounted, useSavedList, useSetEventSaved, useEventSavedState, savedChangeDescription } from "@/hooks/useSaved";
import { useFollowMutationState, useIsFollowed, useToggleFollow } from "@/hooks/useFollows";
import { Bookmark } from "lucide-react";
import { haptic } from "@/lib/haptics";
import {
  isInstallPromptSuppressedPath,
  isStandalone,
} from "@/lib/pwa-display";
import {
  currentReturnBridgeState,
  openReturnBridge,
} from "@/lib/return-bridge";
import { track } from "@/lib/track";
import {
  decisionContextFromPath,
  trackDecision,
} from "@/lib/decision/telemetry";
import { notifyError, notifyRemoved, notifySaved } from "@/lib/feedback/notify";

export default function SaveButton({
  refType,
  refId,
  label,
  barLabel,
  importLocalSavesOnMount = true,
}: {
  refType: "place" | "event" | "radius";
  refId: string;
  /** Always "Save {name}". The control strips that one leading verb, so a
   *  title that itself begins with "Save" keeps its own words. */
  label: string;
  /** Render as a complete mobile action-bar cell so the visible label is
   *  inside the same button hit area as the bookmark icon. */
  barLabel?: string;
  /** Read saved membership on arrival without importing unrelated device saves.
   * Explicit Save/Remove still use the existing confirmed write queue. */
  importLocalSavesOnMount?: boolean;
}) {
  const mounted = useMounted();
  // For places, route through the auth-aware useFollows hook: writes
  // hit the DB when signed in, fall back to localStorage when signed
  // out. Events + radii stay on the legacy useSaved hook by design
  // (Phase 1 brief framed sync as "follow PLACES"; broader sync later).
  const placeFollowed = useIsFollowed(refType === "place" ? refId : "", { importLocalSavesOnMount });
  const failureDescriptionRef = useRef<string | null>(null);
  const togglePlace = useToggleFollow(refId, "icon", (description) => { failureDescriptionRef.current = description; });
  const legacyIsSaved = useIsSaved(refType, refId, refType !== "event");
  const legacyToggle = useToggleSave(refType, refId);
  const setEventSaved = useSetEventSaved(refId);
  const eventSavedState = useEventSavedState(refType === "event" ? refId : null);
  const eventSaveUnavailable = refType === "event" && eventSavedState === null;
  const isSaved = refType === "place" ? placeFollowed : refType === "event" ? eventSavedState === true : legacyIsSaved;
  const [localBusy, setBusy] = useState(false);
  const [pendingSaved, setPendingSaved] = useState<boolean | null>(null);
  const mutation = useFollowMutationState(refType === "place" ? refId : "");
  const busy = localBusy || mutation === "saving" || mutation === "removing";
  const saving = pendingSaved ?? mutation === "saving";
  const busyRef = useRef(false);
  const renderedSaved = isSaved;
  // Pre-toggle total. Used to detect the user's first save ever —
  // when totalBefore is 0 AND the user is about to save, the next
  // tap is the moment that promotes a stranger into someone who has
  // started keeping a list. Marked with editorial copy below.
  const totalBefore = useSavedList().length;
  // Celebrate only this control's confirmed save, never a pending intent.
  const [celebrate, setCelebrate] = useState(false);
  useEffect(() => {
    if (!celebrate) return;
    const t = window.setTimeout(() => setCelebrate(false), 520);
    return () => window.clearTimeout(t);
  }, [celebrate]);

  async function toggle(wasSaved: boolean): Promise<boolean> {
    if (busyRef.current) return false;
    busyRef.current = true;
    setBusy(true);
    setPendingSaved(!wasSaved);
    failureDescriptionRef.current = null;
    try {
      const nextSaved = await (refType === "place" ? togglePlace(!wasSaved) : refType === "event" ? setEventSaved(!wasSaved) : legacyToggle(!wasSaved));
      // A full followed-place list refuses an addition without throwing.
      if (failureDescriptionRef.current !== null || nextSaved === wasSaved) throw new Error("Save state did not change");
      return true;
    } catch (error) {
      notifyError({
        title: wasSaved ? "Could not remove from Saved" : "Could not save this item",
        description: failureDescriptionRef.current ?? savedChangeDescription(error),
      });
      return false;
    } finally {
      setPendingSaved(null);
      setBusy(false);
      busyRef.current = false;
    }
  }

  if (!mounted) {
    return (
      <button
        type="button"
        data-save-ref={`${refType}:${refId}`}
        disabled
        aria-busy="true"
        aria-hidden
        tabIndex={-1}
        className={barLabel
          ? "tap-44 flex min-h-[52px] flex-1 flex-col items-center justify-center gap-1 rounded-[var(--app-radius-md)] px-2 py-2 text-[11px] font-semibold leading-none"
          : "tap-44 grid h-9 w-9 place-items-center rounded-full"}
        style={{ color: "var(--app-ink-3)" }}
      >
        <Bookmark className="h-4 w-4" strokeWidth={1.75} />
        {barLabel ? <span>{barLabel}</span> : null}
      </button>
    );
  }

  return (
    <button
      type="button"
      data-save-ref={`${refType}:${refId}`}
      onClick={async (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (busyRef.current) return;
        const wasSaved = renderedSaved;
        const returnState = currentReturnBridgeState();
        const modalOpen = Boolean(
          document.querySelector('[role="dialog"][aria-modal="true"]'),
        );
        const offerKeepAction =
          !wasSaved
          && !isStandalone()
          && !returnState.completed
          && returnState.valueKind === null
          && isInstallPromptSuppressedPath(window.location.pathname)
          && !modalOpen;
        if (!await toggle(wasSaved)) return;
        if (!wasSaved) setCelebrate(true);
        haptic(wasSaved ? "light" : "medium");
        if (refType === "event") track("save_event", { on: !wasSaved });
        if (!wasSaved && refType !== "radius") {
          const context = decisionContextFromPath(window.location.pathname);
          trackDecision({
            stage: "action",
            surface: context.surface,
            entityKind: refType,
            entityId: refId,
            position: context.position,
            action: "save",
          });
        }
        // A quiet acknowledgement, so the person sees something happen even
        // when the bookmark animation is missed at a glance. Undo mirrors the
        // toggle, and the toast names the item so a stack of removals is not
        // three copies of one sentence.
        const name = label.replace(/^Save\s+/, "");
        const item = { type: refType, id: refId };
        const onUndo = () => void toggle(!wasSaved);
        if (wasSaved) {
          notifyRemoved({ label: name, onUndo, item });
        } else if (totalBefore === 0) {
          // First add ever: a moment worth marking with its own copy
          // instead of the routine acknowledgement.
          notifySaved({
            label: name,
            title: "Your saved list starts here",
            description: "Anything you save stays together under Saved.",
            onUndo,
            forward: offerKeepAction ? { label: "Keep handy", onClick: openReturnBridge } : undefined,
            item,
          });
        } else {
          notifySaved({ label: name, onUndo, item });
        }
      }}
      disabled={busy || eventSaveUnavailable}
      aria-busy={busy}
      aria-pressed={eventSaveUnavailable ? undefined : renderedSaved}
      // `label` arrives as "Save {name}"; strip the verb so the aria reads
      // cleanly ("Save {name}" / "Remove {name} from Saved") instead of the
      // doubled "Add Save {name} to Saved".
      aria-label={
        eventSaveUnavailable ? `Saved state unavailable for ${label.replace(/^Save\s+/, "")}`
          : busy ? `${saving ? "Saving" : "Removing"} ${label.replace(/^Save\s+/, "")}` : renderedSaved
          ? `Remove ${label.replace(/^Save\s+/, "")} from Saved`
          : `Save ${label.replace(/^Save\s+/, "")}`
      }
      title={eventSaveUnavailable ? "Saved state unavailable" : mutation === "unconfirmed" ? "This change could not be confirmed." : renderedSaved ? "Saved" : "Save"}
      className={barLabel
        ? "tap-44 relative flex min-h-[52px] flex-1 flex-col items-center justify-center gap-1 rounded-[var(--app-radius-md)] px-2 py-2 text-[11px] font-semibold leading-none transition-colors hover:bg-[var(--app-bg-sunken)] active:scale-[0.98]"
        : "tap-44 relative grid h-9 w-9 place-items-center rounded-full transition-colors hover:bg-[var(--app-bg-sunken)] active:scale-[0.92]"}
      style={{
        color: renderedSaved ? "var(--app-link)" : "var(--app-ink-3)",
        transitionTimingFunction: "var(--app-ease-spring)",
      }}
    >
      <Bookmark
        className={`h-4 w-4 transition-transform ${
          celebrate ? "save-pop" : ""
        }`}
        strokeWidth={renderedSaved ? 0 : 1.75}
        fill={renderedSaved ? "currentColor" : "none"}
        style={{ transitionTimingFunction: "var(--app-ease-spring)" }}
      />
      {barLabel ? <span>{eventSaveUnavailable ? "Unavailable" : busy ? saving ? "Saving…" : "Removing…" : renderedSaved ? "Saved" : barLabel}</span> : null}
      {celebrate && (
        <span
          aria-hidden
          className="save-ring pointer-events-none absolute inset-0 rounded-full"
        />
      )}
    </button>
  );
}
