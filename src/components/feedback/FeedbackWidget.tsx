"use client";

import { useEffect, useRef, useState, type ComponentType } from "react";
import { usePathname } from "next/navigation";
import {
  Accessibility,
  Baby,
  CalendarDays,
  Car,
  CircleHelp,
  MapPin,
  MessageSquare,
} from "lucide-react";
import Sheet from "@/components/ui/Sheet";
import { track } from "@/lib/track";
import { BETA_ID_COOKIE } from "@/lib/beta-constants";
import {
  FAIR_FEEDBACK_REASONS,
  FEEDBACK_MAX_MESSAGE,
  type FairFeedbackReason,
} from "@/lib/feedback";
import {
  OPEN_FEEDBACK_EVENT,
  PENDING_FEEDBACK_KEY,
  parseFeedbackOpenDetail,
} from "@/lib/feedback-ui";
import { MOBILE_BOTTOM_CHROME_RESERVE } from "@/components/ui/MobileActionBar";

/**
 * FeedbackWidget — the always-available "Send feedback" affordance for beta
 * and the public food-truck board.
 *
 * A small floating trigger (bottom-left, lifted clear of the bottom-nav pill and
 * the map's bottom-right controls) opens the canonical bottom Sheet, which
 * already carries the a11y contract: role=dialog + aria-modal, focus trap, ESC,
 * and focus restore to the trigger on close.
 *
 * The general app is gated on the readable `fr_who` beta-identity cookie. The
 * public food-truck board is the one exception so a visitor can correct a stop
 * without joining the beta first.
 */

type Phase = "idle" | "sending" | "ok" | "error";

const FAIR_REASON_ICONS: Record<
  FairFeedbackReason,
  ComponentType<{ className?: string; strokeWidth?: number; "aria-hidden"?: boolean }>
> = {
  map_wrong: MapPin,
  schedule_change: CalendarDays,
  parking_entry: Car,
  restroom_help: Baby,
  access_barrier: Accessibility,
  other: CircleHelp,
};

const FAIR_MESSAGE_PROMPTS: Record<FairFeedbackReason, string> = {
  map_wrong: "Tell us what is in the wrong place or hard to find.",
  schedule_change: "Tell us which time, event, or detail changed.",
  parking_entry: "Tell us what happened while parking or entering.",
  restroom_help: "Tell us what was missing or hard to find.",
  access_barrier: "Tell us what made the Fair harder to access or use.",
  other: "Tell us what changed or what made Fair Day harder to use.",
};

export const FEEDBACK_TRIGGER_BOTTOM =
  `calc(env(safe-area-inset-bottom, 0px) + ${MOBILE_BOTTOM_CHROME_RESERVE} + 12px)`;

/** On /map the dock's command bar sits at the same bottom offset, so the
 * standard position parks this pill exactly on the search field's left end
 * (mobile audit 2026-08-18: both boxes top out ~124px from the viewport
 * bottom). Lift the trigger clear of the 48px bar plus its 8px inset. */
export const FEEDBACK_TRIGGER_BOTTOM_MAP =
  `calc(env(safe-area-inset-bottom, 0px) + ${MOBILE_BOTTOM_CHROME_RESERVE} + 12px + 56px)`;

function hasBetaCookie(): boolean {
  if (typeof document === "undefined") return false;
  return new RegExp(`(?:^|;\\s*)${BETA_ID_COOKIE}=`).test(document.cookie);
}

export function publicFeedbackSurface(
  pathname: string | null,
): "fair" | "food-trucks" | null {
  if (pathname === "/food-trucks") return "food-trucks";
  if (pathname === "/moments/great-frederick-fair-2026") return "fair";
  return null;
}

export function buildFeedbackRequestBody({
  message,
  email,
  pathname,
  fairIssue,
  fairContext,
}: {
  message: string;
  email: string;
  pathname: string | null;
  fairIssue: FairFeedbackReason | null;
  fairContext: string;
}) {
  const isFair = publicFeedbackSurface(pathname) === "fair";
  return {
    message,
    ...(email ? { email } : {}),
    ...(pathname ? { pathname } : {}),
    ...(isFair && fairIssue
      ? {
          fairIssue,
          ...(fairContext ? { fairContext } : {}),
        }
      : {}),
  };
}

/** Fair Day exposes feedback inside its Help drawer so it does not compete with
 * the Fair's four primary controls. Other surfaces keep the floating trigger. */
export function shouldShowFeedbackTrigger(
  publicSurface: "fair" | "food-trucks" | null,
): boolean {
  return publicSurface !== "fair";
}

export default function FeedbackWidget() {
  const pathname = usePathname();
  const [show, setShow] = useState(false);
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [email, setEmail] = useState("");
  const [fairIssue, setFairIssue] = useState<FairFeedbackReason | null>(null);
  const [fairContext, setFairContext] = useState("");
  const [phase, setPhase] = useState<Phase>("idle");
  const [errorText, setErrorText] = useState("");
  const resetTimer = useRef<number | null>(null);

  const publicSurface = publicFeedbackSurface(pathname);
  const isPublicFoodTruckBoard = publicSurface === "food-trucks";
  const isPublicFairDay = publicSurface === "fair";

  // Reads document.cookie after mount; both the server and first client render
  // return null, so there is no hydration mismatch.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- syncing from document.cookie, which only exists client-side
    setShow(hasBetaCookie() || publicSurface !== null);
  }, [publicSurface]);

  useEffect(() => {
    const openFeedback = (event?: Event) => {
      try {
        window.sessionStorage.removeItem(PENDING_FEEDBACK_KEY);
      } catch {
        // Storage is optional; opening the sheet is not.
      }
      if (resetTimer.current !== null) {
        window.clearTimeout(resetTimer.current);
        resetTimer.current = null;
      }
      setMessage("");
      setEmail("");
      setPhase("idle");
      setErrorText("");

      const detail =
        event instanceof CustomEvent
          ? parseFeedbackOpenDetail(event.detail)
          : null;
      setFairIssue(isPublicFairDay ? detail?.fairIssue ?? null : null);
      setFairContext(isPublicFairDay ? detail?.fairContext ?? "" : "");
      setOpen(true);
    };
    window.addEventListener(OPEN_FEEDBACK_EVENT, openFeedback);
    try {
      if (window.sessionStorage.getItem(PENDING_FEEDBACK_KEY) === "1") {
        openFeedback();
      }
    } catch {
      // The event listener remains the fallback.
    }
    return () => {
      window.removeEventListener(OPEN_FEEDBACK_EVENT, openFeedback);
      if (resetTimer.current !== null) window.clearTimeout(resetTimer.current);
    };
  }, [isPublicFairDay]);

  function close() {
    setOpen(false);
    // Reset after the sheet has animated out so the next open starts clean and
    // a stale success/error never flashes.
    resetTimer.current = window.setTimeout(() => {
      setMessage("");
      setEmail("");
      setFairIssue(null);
      setFairContext("");
      setPhase("idle");
      setErrorText("");
      resetTimer.current = null;
    }, 320);
  }

  async function send() {
    const trimmed = message.trim();
    if (isPublicFairDay && !fairIssue) {
      setErrorText("Choose what this report is about.");
      setPhase("error");
      return;
    }
    if (!trimmed) {
      setErrorText("Tell us what changed or went wrong.");
      setPhase("error");
      return;
    }
    setPhase("sending");
    setErrorText("");
    try {
      const res = await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          buildFeedbackRequestBody({
            message: trimmed,
            email: email.trim(),
            pathname,
            fairIssue,
            fairContext,
          }),
        ),
      });
      if (!res.ok) {
        const d = (await res.json().catch(() => ({}))) as { error?: string };
        const msg =
          d.error === "bad-email"
              ? "That email doesn't look right. Fix it, or leave it blank."
              : d.error === "too-long"
                ? "That's a lot. Trim it a little and send."
                : d.error === "bad-fair-issue" ||
                    d.error === "bad-fair-surface" ||
                    d.error === "bad-fair-context" ||
                    d.error === "fair-context-too-long"
                  ? "That Fair report could not be verified. Close it and try again."
              : d.error === "rate-limited"
                ? "That's plenty for now. Try again in a bit."
                : "That didn't send. Give it another try.";
        setErrorText(msg);
        setPhase("error");
        return;
      }
      track("feedback_send", {
        path: pathname || "",
        ...(fairIssue ? { fair_issue: fairIssue } : {}),
      });
      setPhase("ok");
    } catch {
      setErrorText("That didn't send. Give it another try.");
      setPhase("error");
    }
  }

  if (!show) return null;

  const sending = phase === "sending";
  const succeeded = phase === "ok";

  return (
    <>
      {/* A compact icon-only tab, not a full text pill (beta review, Jul 2026:
          the pill overlapped content and fought the bottom controls). 44px so
          the tap target stays comfortable. During beta the owner wants feedback
          reachable on every screen (owner call, 2026-07-20), so the tab stays up
          over other bottom sheets and only steps aside for its OWN open sheet. */}
      {!open && shouldShowFeedbackTrigger(publicSurface) && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-haspopup="dialog"
          aria-label="Send feedback"
          className="tap-44 fixed inline-flex h-11 w-11 items-center justify-center rounded-full border transition-colors"
          style={{
            zIndex: "var(--z-fab)",
            left: "max(0.75rem, env(safe-area-inset-left, 0px))",
            // BottomNav and MobileActionBar are mutually exclusive and share
            // one shell reserve. One offset therefore clears either bottom
            // control without double-counting both of them. The map carries
            // its own bottom command bar, so the pill steps above it there.
            bottom: pathname === "/map" ? FEEDBACK_TRIGGER_BOTTOM_MAP : FEEDBACK_TRIGGER_BOTTOM,
            background: "var(--app-bg-elevated-solid)",
            borderColor: "var(--app-border)",
            color: "var(--app-ink-2)",
            boxShadow:
              "0 8px 22px -10px rgba(20,20,18,0.30), 0 2px 6px rgba(20,20,18,0.08), var(--app-edge)",
          }}
        >
          <MessageSquare className="h-[18px] w-[18px]" strokeWidth={2} aria-hidden style={{ color: "var(--app-brand)" }} />
        </button>
      )}

      <Sheet
        open={open}
        onClose={close}
        title={
          succeeded
            ? isPublicFairDay
              ? "Fair report received."
              : "Thanks. We have your note."
            : isPublicFairDay
              ? "Report a Fair issue"
              : "Send feedback"
        }
        subtitle={
          succeeded
            ? undefined
            : isPublicFairDay
              ? "Help Frederick Radius keep Fair Day accurate."
              : "What would you keep or change?"
        }
        maxHeight="80dvh"
        footer={
          succeeded ? (
            <button
              type="button"
              onClick={close}
              className="w-full rounded-[var(--app-radius-md)] py-3 text-[15px] font-semibold"
              style={{ background: "var(--app-brand-press)", color: "var(--app-on-brand)", minHeight: 44 }}
            >
              Done
            </button>
          ) : (
            <button
              type="button"
              onClick={send}
              disabled={sending || !message.trim()}
              className="w-full rounded-[var(--app-radius-md)] py-3 text-[15px] font-semibold disabled:opacity-50"
              style={{ background: "var(--app-brand-press)", color: "var(--app-on-brand)", minHeight: 44 }}
            >
              {sending
                ? "Sending…"
                : isPublicFairDay
                  ? "Send Fair report"
                  : "Send"}
            </button>
          )
        }
      >
        {succeeded ? (
          <p className="pb-1 text-[14px]" style={{ color: "var(--app-ink-2)" }}>
            {isPublicFoodTruckBoard
              ? "We use these notes to correct the board. If you left an email, we may write back."
              : isPublicFairDay
                ? "Frederick Radius received your report. We will use it to correct Fair Day. If you left an email, we may reply."
              : "We read every note during the beta. If you left an email, we may write back."}
          </p>
        ) : (
          <div className="flex flex-col gap-3 pb-1">
            {isPublicFairDay ? (
              <>
                <fieldset>
                  <legend
                    className="mb-2 text-[13px] font-semibold"
                    style={{ color: "var(--app-ink)" }}
                  >
                    What should we fix?
                  </legend>
                  <div className="grid grid-cols-2 gap-2">
                    {(
                      Object.entries(FAIR_FEEDBACK_REASONS) as Array<
                        [FairFeedbackReason, string]
                      >
                    ).map(([value, label]) => {
                      const selected = fairIssue === value;
                      const Icon = FAIR_REASON_ICONS[value];
                      return (
                        <button
                          key={value}
                          type="button"
                          aria-pressed={selected}
                          onClick={() => {
                            if (value !== fairIssue) setFairContext("");
                            setFairIssue(value);
                            setErrorText("");
                            if (phase === "error") setPhase("idle");
                          }}
                          className="flex min-h-12 items-center gap-2 rounded-[var(--app-radius-md)] border px-3 py-2.5 text-left text-[13px] font-semibold leading-tight transition-colors"
                          style={{
                            borderColor: selected
                              ? "var(--app-brand)"
                              : "var(--app-border)",
                            background: selected
                              ? "var(--app-brand-tint-14)"
                              : "var(--app-bg-elevated-solid)",
                            color: selected
                              ? "var(--app-brand-press)"
                              : "var(--app-ink)",
                          }}
                        >
                          <Icon
                            className="h-4 w-4 shrink-0"
                            strokeWidth={2}
                            aria-hidden
                          />
                          <span>{label}</span>
                        </button>
                      );
                    })}
                  </div>
                </fieldset>

                {fairContext ? (
                  <p
                    className="rounded-[var(--app-radius-sm)] border px-3 py-2 text-[12px] leading-relaxed"
                    style={{
                      borderColor: "var(--app-border)",
                      background: "var(--app-bg-sunken)",
                      color: "var(--app-ink-2)",
                    }}
                  >
                    <span className="font-semibold" style={{ color: "var(--app-ink)" }}>
                      Reporting:
                    </span>{" "}
                    {fairContext}
                  </p>
                ) : null}

                <p
                  className="rounded-[var(--app-radius-sm)] border px-3 py-2 text-[12px] leading-relaxed"
                  style={{
                    borderColor: "var(--app-warning)",
                    background: "var(--app-warning-tint-6)",
                    color: "var(--app-ink-2)",
                  }}
                >
                  For an immediate safety or medical emergency, get on-site help
                  or call 911. This form reports information to Frederick Radius,
                  not the Fair.
                </p>
              </>
            ) : null}

            <label
              htmlFor="fr-feedback-message"
              className={
                isPublicFairDay
                  ? "text-[13px] font-semibold"
                  : "sr-only"
              }
              style={isPublicFairDay ? { color: "var(--app-ink)" } : undefined}
            >
              {isPublicFairDay
                ? "What changed or went wrong?"
                : "What’s working, what’s rough"}
            </label>
            <textarea
              id="fr-feedback-message"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              maxLength={FEEDBACK_MAX_MESSAGE}
              rows={4}
              autoComplete="off"
              placeholder={
                isPublicFairDay
                  ? fairIssue
                    ? FAIR_MESSAGE_PROMPTS[fairIssue]
                    : "Choose a topic, then tell us what happened."
                  : "A bug, a rough edge, something you liked…"
              }
              className="w-full resize-y rounded-[var(--app-radius-md)] border px-3 py-2.5 text-[15px] outline-none"
              style={{
                borderColor: "var(--app-border)",
                background: "var(--app-bg)",
                color: "var(--app-ink)",
                minHeight: 96,
              }}
            />

            <div className="flex flex-col gap-1.5">
              <label
                htmlFor="fr-feedback-email"
                className="text-[13px] font-medium"
                style={{ color: "var(--app-ink-2)" }}
              >
                {isPublicFairDay ? "Email (optional)" : "Email, if you want a reply"}
              </label>
              {isPublicFairDay ? (
                <p className="text-[12px]" style={{ color: "var(--app-ink-3)" }}>
                  Add it only if you want a reply.
                </p>
              ) : null}
              <input
                id="fr-feedback-email"
                type="email"
                inputMode="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                className="h-11 w-full rounded-[var(--app-radius-md)] border px-3 text-[15px] outline-none"
                style={{
                  borderColor: "var(--app-border)",
                  background: "var(--app-bg)",
                  color: "var(--app-ink)",
                }}
              />
            </div>

            <p className="text-[12px]" style={{ color: "var(--app-ink-3)" }}>
              Sent with the page you&rsquo;re on:{" "}
              <span className="font-mono">{pathname || "/"}</span>
            </p>

            {phase === "error" && (
              <p className="text-[13px]" role="status" style={{ color: "var(--app-brand-press)" }}>
                {errorText}
              </p>
            )}
          </div>
        )}
      </Sheet>
    </>
  );
}
