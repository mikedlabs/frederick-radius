"use client";

import { usePathname } from "next/navigation";
import { useId, useState } from "react";
import {
  ASK_CORRECTION_REASONS,
  type AskCorrectionReason,
} from "@/lib/feedback";
import { haptic } from "@/lib/haptics";
import { track } from "@/lib/track";
import {
  decisionEntityFromPath,
  trackDecision,
  type DecisionAction,
} from "@/lib/decision/telemetry";

const CORRECTION_OPTIONS = Object.entries(ASK_CORRECTION_REASONS) as Array<
  [AskCorrectionReason, (typeof ASK_CORRECTION_REASONS)[AskCorrectionReason]]
>;

type CorrectionStatus = "idle" | "sending" | "sent" | "error";

/**
 * A deliberately small quality escape hatch for Ask Radius. It sends a fixed
 * reason and an optional canonical entity route. The visitor's question and
 * the generated answer never leave this component through the feedback path.
 */
export default function AskCorrectionControl({
  resultRef,
}: {
  resultRef: string | null;
}) {
  const pathname = usePathname();
  const reasonsId = useId();
  const [expanded, setExpanded] = useState(false);
  const [status, setStatus] = useState<CorrectionStatus>("idle");
  const decisionEntity = decisionEntityFromPath(resultRef);

  function recordDecisionFeedback(action: DecisionAction) {
    trackDecision({
      stage: "feedback",
      surface: "ask",
      entityKind: decisionEntity.entityKind,
      entityId: decisionEntity.entityId,
      position: "result",
      action,
    });
  }

  async function sendCorrection(reason: AskCorrectionReason) {
    if (status === "sending" || status === "sent") return;
    setStatus("sending");
    try {
      const response = await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          source: "ask-correction",
          reason,
          resultRef,
          pathname,
        }),
      });
      if (!response.ok) throw new Error("correction_failed");
      setStatus("sent");
      haptic("success");
      track("feedback_send", {
        source: "ask-correction",
        reason,
        result: resultRef ?? "none",
      });
      recordDecisionFeedback(
        reason === "hours_wrong" || reason === "closed"
          ? "wrong"
          : "not_relevant",
      );
    } catch {
      setStatus("error");
      haptic("error");
    }
  }

  if (status === "sent") {
    return (
      <p
        className="mt-6 border-t pt-3 text-[14px]"
        style={{ borderColor: "var(--app-border)", color: "var(--app-ink-2)" }}
        role="status"
        data-ask-correction-sent
      >
        Thanks. We will use that to improve Radius.
      </p>
    );
  }

  return (
    <div
      className="mt-6 border-t pt-1"
      style={{ borderColor: "var(--app-border)" }}
      data-ask-correction
    >
      <div className="flex items-center gap-3">
        <button
          type="button"
          className="tap-44 inline-flex min-h-11 items-center text-[14px] font-semibold transition-opacity hover:underline hover:underline-offset-[3px] active:opacity-70"
          style={{ color: "var(--app-ink-2)" }}
          onClick={() => {
            haptic("success");
            recordDecisionFeedback("helpful");
            setStatus("sent");
          }}
        >
          Helpful
        </button>
        <button
          type="button"
          className="tap-44 inline-flex min-h-11 items-center text-[14px] font-semibold transition-opacity hover:underline hover:underline-offset-[3px] active:opacity-70"
          style={{ color: "var(--app-ink-2)" }}
          aria-expanded={expanded}
          aria-controls={reasonsId}
          onClick={() => {
            haptic("light");
            setExpanded((value) => !value);
            if (status === "error") setStatus("idle");
          }}
        >
          Not right
        </button>
      </div>

      {expanded ? (
        <div id={reasonsId} className="pb-1">
          <p
            className="mb-2 text-[14px] font-semibold"
            style={{ color: "var(--app-ink)" }}
          >
            What was off?
          </p>
          <div className="flex flex-wrap gap-2" aria-busy={status === "sending"}>
            {CORRECTION_OPTIONS.map(([reason, label]) => (
              <button
                key={reason}
                type="button"
                disabled={status === "sending"}
                onClick={() => void sendCorrection(reason)}
                className="tap-44 min-h-11 rounded-[var(--app-radius-md)] border bg-transparent px-3 text-[14px] font-semibold transition-colors hover:bg-[var(--app-bg-sunken)] active:opacity-75 disabled:opacity-50"
                style={{
                  borderColor: "var(--app-control-border)",
                  color: "var(--app-ink-2)",
                }}
              >
                {label}
              </button>
            ))}
          </div>
          {status === "error" ? (
            <p
              className="mt-2 text-[14px]"
              style={{ color: "var(--app-danger-text)" }}
              role="alert"
            >
              That did not send. Choose a reason to try again.
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
