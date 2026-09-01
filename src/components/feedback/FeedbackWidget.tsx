"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { MessageSquare } from "lucide-react";
import Sheet from "@/components/ui/Sheet";
import { track } from "@/lib/track";
import { BETA_ID_COOKIE } from "@/lib/beta-constants";
import { FEEDBACK_MAX_MESSAGE } from "@/lib/feedback";
import {
  OPEN_FEEDBACK_EVENT,
  PENDING_FEEDBACK_KEY,
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

export default function FeedbackWidget() {
  const pathname = usePathname();
  const [show, setShow] = useState(false);
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [email, setEmail] = useState("");
  const [phase, setPhase] = useState<Phase>("idle");
  const [errorText, setErrorText] = useState("");

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
    const openFeedback = () => {
      try {
        window.sessionStorage.removeItem(PENDING_FEEDBACK_KEY);
      } catch {
        // Storage is optional; opening the sheet is not.
      }
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
    return () => window.removeEventListener(OPEN_FEEDBACK_EVENT, openFeedback);
  }, []);

  function close() {
    setOpen(false);
    // Reset after the sheet has animated out so the next open starts clean and
    // a stale success/error never flashes.
    window.setTimeout(() => {
      setMessage("");
      setEmail("");
      setPhase("idle");
      setErrorText("");
    }, 320);
  }

  async function send() {
    const trimmed = message.trim();
    if (!trimmed) {
      setErrorText("Add a few words first.");
      setPhase("error");
      return;
    }
    setPhase("sending");
    setErrorText("");
    try {
      const res = await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: trimmed,
          email: email.trim() || undefined,
          pathname: pathname || undefined,
        }),
      });
      if (!res.ok) {
        const d = (await res.json().catch(() => ({}))) as { error?: string };
        const msg =
          d.error === "bad-email"
            ? "That email doesn't look right. Fix it, or leave it blank."
            : d.error === "too-long"
              ? "That's a lot. Trim it a little and send."
              : d.error === "rate-limited"
                ? "That's plenty for now. Try again in a bit."
                : "That didn't send. Give it another try.";
        setErrorText(msg);
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
      {!open && (
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
        title={succeeded ? "Thanks. We have your note." : "Send feedback"}
        subtitle={
          succeeded
            ? undefined
            : isPublicFairDay
              ? "What did you wish you knew before arriving?"
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
              {sending ? "Sending…" : "Send"}
            </button>
          )
        }
      >
        {succeeded ? (
          <p className="pb-1 text-[14px]" style={{ color: "var(--app-ink-2)" }}>
            {isPublicFoodTruckBoard
              ? "We use these notes to correct the board. If you left an email, we may write back."
              : isPublicFairDay
                ? "We use these notes to make Fair Day more useful. If you left an email, we may write back."
              : "We read every note during the beta. If you left an email, we may write back."}
          </p>
        ) : (
          <div className="flex flex-col gap-3 pb-1">
            <label htmlFor="fr-feedback-message" className="sr-only">
              What&rsquo;s working, what&rsquo;s rough
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
                  ? "Parking, entry, finding something, getting home…"
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
