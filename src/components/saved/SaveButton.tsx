"use client";

import { useEffect, useRef, useState } from "react";
import { useIsSaved, useToggleSave, useMounted, useSavedList } from "@/hooks/useSaved";
import { useIsFollowed, useToggleFollow } from "@/hooks/useFollows";
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
import { toast } from "sonner";

export default function SaveButton({
  refType,
  refId,
  label,
  barLabel,
}: {
  refType: "place" | "event" | "radius";
  refId: string;
  label: string;
  /** Render as a complete mobile action-bar cell so the visible label is
   *  inside the same button hit area as the bookmark icon. */
  barLabel?: string;
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
  // The auth-aware place toggle may need one lightweight session lookup before
  // it knows whether to write locally or remotely. Reflect the tap in this
  // button immediately rather than leaving the bookmark visually unchanged
  // during that lookup; the shared store remains the durable source of truth.
  const [optimisticSaved, setOptimisticSaved] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const renderedSaved = optimisticSaved ?? isSaved;
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
  useEffect(() => {
    if (optimisticSaved === null || optimisticSaved !== isSaved) return;
    // Clear the one-tap visual bridge once the shared save store catches up.
    setOptimisticSaved(null);
  }, [isSaved, optimisticSaved]);

  async function toggle(wasSaved: boolean): Promise<boolean> {
    if (busyRef.current) return false;
    busyRef.current = true;
    setBusy(true);
    setOptimisticSaved(!wasSaved);
    try {
      const nextSaved = await (refType === "place" ? togglePlace() : legacyToggle());
      // A full followed-place list refuses an addition without throwing.
      if (nextSaved === wasSaved) throw new Error("Save state did not change");
      return true;
    } catch {
      toast.error(wasSaved ? "Could not remove from Saved" : "Could not save this item", {
        description: "Your saved list has not changed. Please try again.",
      });
      return false;
    } finally {
      setOptimisticSaved(null);
      setBusy(false);
      busyRef.current = false;
    }
  }

  if (!mounted) {
    return (
      <button
        type="button"
        data-save-ref={`${refType}:${refId}`}
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
        haptic(wasSaved ? "light" : "medium");
        if (!await toggle(wasSaved)) return;
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
        // Sonner toast — quiet, brand-aligned acknowledgement so the
        // user sees something happen even if the bookmark animation
        // is missed at a glance. Undo action mirrors the toggle so
        // a mistaken save is one tap to reverse.
        if (wasSaved) {
          toast(`Removed from Saved`, {
            action: { label: "Undo", onClick: () => void toggle(!wasSaved) },
          });
        } else if (totalBefore === 0) {
          // First add ever — moment worth marking. Editorial copy
          // instead of the routine acknowledgement, plus a longer
          // dwell so the user has time to read what just happened.
          toast.success("Your saved list starts here", {
            description: "Anything you save stays together under Saved.",
            duration: offerKeepAction ? 7000 : 5000,
            action: offerKeepAction
              ? { label: "Keep handy", onClick: openReturnBridge }
              : { label: "Undo", onClick: () => void toggle(!wasSaved) },
            cancel: offerKeepAction
              ? { label: "Undo", onClick: () => void toggle(!wasSaved) }
              : undefined,
          });
        } else {
          toast.success(`Saved · ${label.replace(/^Save\s+/, "")}`, {
            action: { label: "Undo", onClick: () => void toggle(!wasSaved) },
          });
        }
      }}
      disabled={busy}
      aria-busy={busy}
      aria-pressed={renderedSaved}
      // `label` arrives as "Save {name}"; strip the verb so the aria reads
      // cleanly ("Save {name}" / "Remove {name} from Saved") instead of the
      // doubled "Add Save {name} to Saved".
      aria-label={
        renderedSaved
          ? `Remove ${label.replace(/^Save\s+/, "")} from Saved`
          : `Save ${label.replace(/^Save\s+/, "")}`
      }
      title={renderedSaved ? "Saved" : "Save"}
      className={barLabel
        ? "tap-44 relative flex min-h-[52px] flex-1 flex-col items-center justify-center gap-1 rounded-[var(--app-radius-md)] px-2 py-2 text-[11px] font-semibold leading-none transition-colors hover:bg-[var(--app-bg-sunken)] active:scale-[0.98]"
        : "tap-44 relative grid h-9 w-9 place-items-center rounded-full transition-colors hover:bg-[var(--app-bg-sunken)] active:scale-[0.92]"}
      style={{
        color: renderedSaved ? "var(--app-cool)" : "var(--app-ink-3)",
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
      {barLabel ? <span>{renderedSaved ? "Saved" : barLabel}</span> : null}
      {celebrate && (
        <span
          aria-hidden
          className="save-ring pointer-events-none absolute inset-0 rounded-full"
        />
      )}
    </button>
  );
}
