"use client";

import { useCallback, useEffect, useState } from "react";
import { Play, Smartphone } from "lucide-react";
import {
  haptic,
  isPhoneFeedbackEnabled,
  PHONE_FEEDBACK_CHANGE_EVENT,
  PHONE_FEEDBACK_STORAGE_KEY,
  phoneFeedbackSupport,
  setPhoneFeedbackEnabled,
  type PhoneFeedbackSupport,
} from "@/lib/haptics";

/**
 * PhoneFeedbackCard: the device-local switch for haptic cues, with a preview.
 * It lived on /settings/notifications beside the push controls until push
 * notifications were retired, and now sits directly in Settings.
 */
export default function PhoneFeedbackCard() {
  const [enabled, setEnabled] = useState(true);
  const [support, setSupport] = useState<PhoneFeedbackSupport>("none");
  const [previewState, setPreviewState] = useState<
    "sent" | "unavailable" | null
  >(null);

  useEffect(() => {
    // Device capability and localStorage exist only after hydration.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setEnabled(isPhoneFeedbackEnabled());
    setSupport(phoneFeedbackSupport());

    const onPreferenceChange = (event: Event) => {
      const next = (event as CustomEvent<{ enabled?: boolean }>).detail?.enabled;
      setEnabled(
        typeof next === "boolean" ? next : isPhoneFeedbackEnabled(),
      );
    };
    const onStorage = (event: StorageEvent) => {
      if (event.key === PHONE_FEEDBACK_STORAGE_KEY) {
        setEnabled(isPhoneFeedbackEnabled());
      }
    };
    window.addEventListener(
      PHONE_FEEDBACK_CHANGE_EVENT,
      onPreferenceChange,
    );
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener(
        PHONE_FEEDBACK_CHANGE_EVENT,
        onPreferenceChange,
      );
      window.removeEventListener("storage", onStorage);
    };
  }, []);

  const toggle = useCallback(() => {
    const next = !enabled;
    if (!next) haptic("light");
    setPhoneFeedbackEnabled(next);
    setEnabled(next);
    if (next) haptic("success");
    setPreviewState(null);
  }, [enabled]);

  const preview = useCallback(() => {
    setPreviewState(haptic("success") ? "sent" : "unavailable");
    window.setTimeout(() => setPreviewState(null), 1800);
  }, []);

  const unavailable = support === "none";
  const supportCopy =
    support === "vibration"
      ? "Short vibration cues confirm saves, choices, and near-arrival moments."
      : support === "ios-tap"
        ? "Short tap cues confirm actions when your iPhone supports them."
        : "This browser does not expose physical feedback. Visual confirmations still work.";

  return (
    <article
      className="rounded-[var(--app-radius-lg)] border p-4"
      style={{
        borderColor: "var(--app-border)",
        background: "var(--app-bg-elevated)",
      }}
    >
      <header className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <span
            className="grid h-9 w-9 shrink-0 place-items-center rounded-xl"
            style={{
              background:
                "color-mix(in srgb, var(--app-brand) 11%, transparent)",
              color: "var(--app-brand-press)",
            }}
          >
            <Smartphone className="h-4 w-4" strokeWidth={2.25} aria-hidden />
          </span>
          <div className="min-w-0">
            <h2
              className="text-[15px] font-semibold"
              style={{ color: "var(--app-ink)" }}
            >
              Phone feedback
            </h2>
            <p
              className="mt-0.5 text-[12px] leading-relaxed"
              style={{ color: "var(--app-ink-3)" }}
            >
              {supportCopy}
            </p>
          </div>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={enabled && !unavailable}
          aria-label="Phone feedback"
          onClick={toggle}
          disabled={unavailable}
          className="tap-44 relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors disabled:opacity-45"
          style={{
            background:
              enabled && !unavailable
                ? "var(--app-brand)"
                : "color-mix(in srgb, var(--app-ink) 22%, transparent)",
          }}
        >
          <span
            className="inline-block h-5 w-5 rounded-full bg-white transition-transform"
            style={{
              transform:
                enabled && !unavailable
                  ? "translateX(22px)"
                  : "translateX(2px)",
              boxShadow: "var(--app-elev-1)",
            }}
          />
        </button>
      </header>

      <div className="mt-3 flex min-h-11 items-center justify-between gap-3 border-t pt-3" style={{ borderColor: "var(--app-border)" }}>
        <p className="text-[11px]" style={{ color: "var(--app-ink-3)" }}>
          This preference is stored only on this device.
        </p>
        {!unavailable && (
          <button
            type="button"
            onClick={preview}
            disabled={!enabled}
            className="inline-flex min-h-11 items-center gap-1.5 text-[12px] font-semibold disabled:opacity-45"
            style={{ color: "var(--app-brand-press)" }}
          >
            <Play className="h-3.5 w-3.5" strokeWidth={2.25} aria-hidden />
            {previewState === "sent"
              ? "Feedback sent"
              : previewState === "unavailable"
                ? "No cue detected"
                : "Try feedback"}
          </button>
        )}
      </div>
      <p className="sr-only" role="status" aria-live="polite">
        {previewState === "sent"
          ? "The phone feedback cue was sent."
          : previewState === "unavailable"
            ? "This browser did not accept the phone feedback cue."
            : ""}
      </p>
    </article>
  );
}
