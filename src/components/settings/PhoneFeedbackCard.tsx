"use client";

import { useCallback, useEffect, useState } from "react";
import { Play } from "lucide-react";
import {
  ROW_HELP,
  ROW_TITLE,
  SettingsRow,
  SettingsSection,
  SettingsSwitch,
  helpStyle,
} from "@/components/settings/SettingsSection";
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
 * notifications were retired, and now sits directly in Settings as a
 * labelled run of ruled rows: the switch row, then the preview row.
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
    <SettingsSection title="Phone feedback">
      <SettingsRow
        trailing={
          <SettingsSwitch
            checked={enabled && !unavailable}
            label="Feedback cues"
            disabled={unavailable}
            onClick={toggle}
          />
        }
      >
        {/* A short row title over the shared 14px help line, the same
            pattern as the other Settings rows. */}
        <p className={ROW_TITLE} style={{ color: "var(--app-ink)" }}>
          Feedback cues
        </p>
        <p className={`mt-0.5 ${ROW_HELP}`} style={helpStyle}>
          {supportCopy}
        </p>
      </SettingsRow>
      <SettingsRow
        trailing={
          !unavailable ? (
            <button
              type="button"
              onClick={preview}
              disabled={!enabled}
              className="inline-flex min-h-11 items-center gap-1.5 whitespace-nowrap text-[0.875rem] font-semibold disabled:opacity-45"
              style={{ color: "var(--app-link)" }}
            >
              <Play className="h-4 w-4" strokeWidth={2.25} aria-hidden />
              {previewState === "sent"
                ? "Feedback sent"
                : previewState === "unavailable"
                  ? "No cue detected"
                  : "Try feedback"}
            </button>
          ) : undefined
        }
      >
        <p className={ROW_HELP} style={helpStyle}>
          This preference is stored only on this device.
        </p>
        <p className="sr-only" role="status" aria-live="polite">
          {previewState === "sent"
            ? "The phone feedback cue was sent."
            : previewState === "unavailable"
              ? "This browser did not accept the phone feedback cue."
              : ""}
        </p>
      </SettingsRow>
    </SettingsSection>
  );
}
