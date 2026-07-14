"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { MessageSquare } from "lucide-react";
import Sheet from "@/components/ui/Sheet";
import { track } from "@/lib/track";
import { BETA_ID_COOKIE } from "@/lib/beta-constants";
import { FEEDBACK_MAX_MESSAGE } from "@/lib/feedback";

/**
 * FeedbackWidget — the always-available "Send feedback" affordance for beta.
 *
 * A small floating trigger (bottom-left, lifted clear of the bottom-nav pill and
 * the map's bottom-right controls) opens the canonical bottom Sheet, which
 * already carries the a11y contract: role=dialog + aria-modal, focus trap, ESC,
 * and focus restore to the trigger on close.
 *
 * Gated on the readable `fr_who` beta-identity cookie so it shows ONLY to
 * unlocked beta visitors and vanishes for the public the moment the beta wall
 * comes down (no cookie set → nothing renders). We key off `fr_who`, NOT the
 * credential cookie `fr_beta`: that one is httpOnly and invisible to JS, so a
 * document.cookie check for it can never be true. The check is client-side
 * after mount, so both the server render and the first client render return
 * null (no hydration mismatch), and the trigger appears once we confirm it.
 */

type Phase = "idle" | "sending" | "ok" | "error";

function hasBetaCookie(): boolean {
  if (typeof document === "undefined") return false;
  return new RegExp(`(?:^|;\\s*)${BETA_ID_COOKIE}=`).test(document.cookie);
}

export default function FeedbackWidget() {
  const pathname = usePathname();
  const [show, setShow] = useState(false);
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [email, setEmail] = useState("");
  const [phase, setPhase] = useState<Phase>("idle");
  const [errorText, setErrorText] = useState("");
  // Yield to any open bottom sheet / modal (the radius sheet, place sheet,
  // search overlay, our own feedback sheet). The beta reviewer (Jul 2026)
  // caught the trigger fighting the radius sheet for the same corner; a modal
  // is a full-attention surface, so the tab hides while one is up and returns
  // when it closes. Detected structurally (any visible aria-modal dialog) so
  // no cross-component wiring is needed.
  const [modalUp, setModalUp] = useState(false);

  // Only reveal for unlocked beta visitors. Reads document.cookie (an external
  // system unavailable during SSR) once after mount; both the server and first
  // client render return null, so there's no hydration mismatch and no cascade.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- syncing from document.cookie, which only exists client-side
    setShow(hasBetaCookie());
  }, []);

  // Watch the DOM for any open modal dialog and hide the tab while one is up.
  useEffect(() => {
    if (typeof document === "undefined") return;
    const check = () =>
      setModalUp(document.querySelector('[role="dialog"][aria-modal="true"]') != null);
    check();
    const mo = new MutationObserver(check);
    mo.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["role", "aria-modal"] });
    return () => mo.disconnect();
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

  // Place- and event-detail pages pin a MobileActionBar ~76px above the
  // nav; lift the feedback trigger clear of it so the two don't overlap on
  // the bottom-left. Every other route keeps the base 76px clearance.
  const overActionBar = /^\/(places|events)\/[^/]+$/.test(pathname || "");
  const triggerBottom = overActionBar ? 150 : 76;

  return (
    <>
      {/* A compact icon-only tab, not a full text pill (beta review, Jul 2026:
          the pill overlapped content and fought the bottom controls). 44px so
          the tap target stays comfortable; hides entirely while any modal /
          bottom sheet is open so it never competes for the same corner. */}
      {!modalUp && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-haspopup="dialog"
          aria-label="Send feedback"
          className="tap-44 fixed inline-flex h-11 w-11 items-center justify-center rounded-full border transition-colors"
          style={{
            zIndex: "var(--z-fab)",
            left: "max(0.75rem, env(safe-area-inset-left, 0px))",
            bottom: `calc(env(safe-area-inset-bottom, 0px) + ${triggerBottom}px)`,
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
        title={succeeded ? "Thanks, that's in front of us." : "Send feedback"}
        subtitle={succeeded ? undefined : "What's working? What's rough?"}
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
            We read every note during the beta. If you left an email, we might
            write back.
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
              placeholder="A bug, a rough edge, something you liked…"
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
              <p className="text-[13px]" role="status" style={{ color: "var(--app-brand)" }}>
                {errorText}
              </p>
            )}
          </div>
        )}
      </Sheet>
    </>
  );
}
