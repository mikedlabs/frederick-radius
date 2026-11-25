"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { MessageSquare } from "lucide-react";
import Sheet from "@/components/ui/Sheet";
import { track } from "@/lib/track";
import { FEEDBACK_MAX_MESSAGE } from "@/lib/feedback";
import { OPEN_FEEDBACK_EVENT, PENDING_FEEDBACK_KEY } from "@/lib/feedback-ui";
import { MOBILE_BOTTOM_CHROME_RESERVE } from "@/components/ui/MobileActionBar";

/**
 * FeedbackWidget owns the one "Send feedback" sheet for every app page.
 *
 * More tools in the header offers feedback on every route and at every width.
 * Where the desktop side rail is present (the lg breakpoint), a floating
 * trigger also sits at the foot of that rail, where it covers no content.
 * Below lg there is no floating trigger: on a phone it sat on the map's "Use
 * my location" action and on rows of Saved and Events, and it took their taps.
 * Both entries open the canonical bottom Sheet, which already carries the
 * a11y contract: role=dialog + aria-modal, focus trap, ESC, and focus restore
 * to the opener on close.
 *
 * Every visitor can send a note. It used to appear only for beta testers
 * (the `fr_who` cookie) and on the food-truck board; the beta layer was
 * retired in #1952, which left public visitors with no way to reach the
 * owner. The intake route is same-origin only, rate-limited and size-capped.
 * The food-truck board keeps its own confirmation wording.
 */

type Phase = "idle" | "sending" | "ok" | "error";

/** Shown only from the breakpoint where SideRail replaces BottomNav
 * (`hidden lg:flex` there, `hidden lg:inline-flex` here). The two must move
 * together, because the trigger sits at the foot of the rail. */
export const FEEDBACK_TRIGGER_DISPLAY_CLASS = "hidden lg:inline-flex";

/** 12px above the bottom edge. The shared bottom-chrome reserve resolves to
 * 0px wherever the trigger shows, and stays in the sum so the trigger can
 * never sit on a bottom bar if that breakpoint and this one drift apart. */
export const FEEDBACK_TRIGGER_BOTTOM =
  `calc(env(safe-area-inset-bottom, 0px) + ${MOBILE_BOTTOM_CHROME_RESERVE} + 12px)`;

export function publicFeedbackSurface(
  pathname: string | null,
): "food-trucks" | null {
  if (pathname === "/food-trucks") return "food-trucks";
  return null;
}

export function buildFeedbackRequestBody({
  message,
  email,
  pathname,
}: {
  message: string;
  email: string;
  pathname: string | null;
}) {
  return {
    message,
    ...(email ? { email } : {}),
    ...(pathname ? { pathname } : {}),
  };
}

export function feedbackSendErrorMessage(error?: string): string {
  switch (error) {
    case "bad-email":
      return "That email doesn't look right. Fix it, or leave it blank.";
    case "too-long":
      return "That's a lot. Trim it a little and send.";
    case "rate-limited":
      return "That's plenty for now. Try again in a bit.";
    case "feedback-storage-unavailable":
      return "We couldn't save your report, so your message is still here for you to try again in a moment.";
    default:
      return "That didn't send. Give it another try.";
  }
}

export default function FeedbackWidget() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [email, setEmail] = useState("");
  const [phase, setPhase] = useState<Phase>("idle");
  const [errorText, setErrorText] = useState("");
  const resetTimer = useRef<number | null>(null);
  // The floating trigger steps aside for its own sheet, so it is already gone
  // when the sheet looks for the focused control. Remember it at the click so
  // closing returns focus to it. Other openers can supply their own visible
  // return target, including the header menu summary.
  const openerRef = useRef<HTMLElement | null>(null);

  const publicSurface = publicFeedbackSurface(pathname);
  const isPublicFoodTruckBoard = publicSurface === "food-trucks";


  useEffect(() => {
    const openFeedback = (event?: Event) => {
      // An item inside a closing menu returns to its still-visible summary.
      // Older inline events can rely on the sheet’s active-element fallback.
      const requested = event instanceof CustomEvent ? event.detail?.returnFocusTo : null;
      openerRef.current = requested instanceof HTMLElement && requested.isConnected ? requested : null;
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
  }, []);

  function close() {
    setOpen(false);
    // Reset after the sheet has animated out so the next open starts clean and
    // a stale success/error never flashes.
    resetTimer.current = window.setTimeout(() => {
      setMessage("");
      setEmail("");
      setPhase("idle");
      setErrorText("");
      resetTimer.current = null;
    }, 320);
  }

  async function send() {
    const trimmed = message.trim();
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
          }),
        ),
      });
      if (!res.ok) {
        const d = (await res.json().catch(() => ({}))) as { error?: string };
        setErrorText(feedbackSendErrorMessage(d.error));
        setPhase("error");
        return;
      }
      track("feedback_send", { path: pathname || "" });
      setPhase("ok");
    } catch {
      setErrorText("That didn't send. Give it another try.");
      setPhase("error");
    }
  }


  const sending = phase === "sending";
  const succeeded = phase === "ok";

  return (
    <>
      {/* A compact icon-only tab, not a full text pill (beta review, Jul 2026:
          the pill overlapped content and fought the bottom controls). 44px so
          the tap target stays comfortable. The owner wants feedback reachable on
          every screen: More tools carries it everywhere, and this tab adds a
          second entry beside the desktop rail. It stays up over other bottom
          sheets and only steps aside for its OWN open sheet. */}
      {!open && (
        <button
          type="button"
          onClick={(event) => {
            openerRef.current = event.currentTarget;
            setOpen(true);
          }}
          aria-haspopup="dialog"
          aria-label="Send feedback"
          data-feedback-trigger
          className={`tap-44 fixed ${FEEDBACK_TRIGGER_DISPLAY_CLASS} h-11 w-11 items-center justify-center rounded-full border transition-colors`}
          style={{
            zIndex: "var(--z-fab)",
            left: "max(0.75rem, env(safe-area-inset-left, 0px))",
            bottom: FEEDBACK_TRIGGER_BOTTOM,
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
        returnFocusRef={openerRef}
        title={succeeded ? "Thanks. We have your note." : "Send feedback"}
        subtitle={succeeded ? undefined : "What would you keep or change?"}
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
              {sending ? "Sending…" : "Send"}
            </button>
          )
        }
      >
        {succeeded ? (
          <p className="pb-1 text-[14px]" style={{ color: "var(--app-ink-2)" }}>
            {isPublicFoodTruckBoard
              ? "We use these notes to correct the board. If you left an email, we may write back."
              : "We read every note. If you left an email, we may write back."}
          </p>
        ) : (
          <div className="flex flex-col gap-3 pb-1">
            <label htmlFor="fr-feedback-message" className="sr-only">
              What’s working, what’s rough
            </label>
            <textarea
              id="fr-feedback-message"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              maxLength={FEEDBACK_MAX_MESSAGE}
              rows={4}
              autoComplete="off"
              placeholder="A bug, a rough edge, something you liked…"
              className="w-full resize-y rounded-[var(--app-radius-md)] border px-3 py-2.5 text-base outline-none"
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
                Email, if you want a reply
              </label>
              <input
                id="fr-feedback-email"
                type="email"
                inputMode="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                className="h-11 w-full rounded-[var(--app-radius-md)] border px-3 text-base outline-none"
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
