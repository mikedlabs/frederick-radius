"use client";

import { useState } from "react";
import { LogOut, X } from "lucide-react";
import { resetFollowsSyncFlag } from "@/hooks/useFollows";

// The base fill is a class, not an inline style, so the hover fill can
// replace it. An inline background would outrank the hover class.
const OUTLINE_BUTTON =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-[var(--app-radius-md)] border bg-[var(--app-bg)] px-4 text-[0.875rem] font-semibold transition-colors motion-reduce:transition-none hover:bg-[var(--app-bg-sunken)]";

export default function SignOutButton({ email }: { email: string | null }) {
  const [confirming, setConfirming] = useState(false);

  if (!confirming) {
    return (
      <button
        type="button"
        onClick={() => setConfirming(true)}
        className={OUTLINE_BUTTON}
        style={{
          borderColor: "var(--app-control-border)",
          color: "var(--app-ink)",
        }}
      >
        <LogOut className="h-4 w-4" strokeWidth={2.1} aria-hidden />
        Stop syncing on this device
      </button>
    );
  }

  return (
    <div
      role="group"
      aria-label="Confirm sign out"
    >
      <p className="text-[1.0625rem] font-semibold leading-snug" style={{ color: "var(--app-ink)" }}>
        Stop syncing here?
      </p>
      <p className="mt-1 text-[0.875rem] leading-relaxed" style={{ color: "var(--app-ink-3)" }}>
        Places already with {email ?? "your account"} stay there. Saved events,
        routes, settings, and recent views stay on this device.
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        <form
          action="/auth/signout"
          method="post"
          onSubmit={() => {
            resetFollowsSyncFlag();
            const controller = navigator.serviceWorker?.controller;
            controller?.postMessage({
              type: "CLEAR_PRIVATE_NAVIGATIONS",
            });
            // Workers deployed before the privacy-specific message existed
            // already understand this broader command. On sign-out, clearing
            // every cached page is the safest backward-compatible choice.
            controller?.postMessage({ type: "CLEAR_CACHES" });
          }}
        >
          <button
            type="submit"
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-[var(--app-radius-md)] px-4 text-[0.875rem] font-semibold"
            style={{ background: "var(--app-danger)", color: "var(--app-on-brand)" }}
          >
            <LogOut className="h-4 w-4" strokeWidth={2.1} aria-hidden />
            Sign out here
          </button>
        </form>
        <button
          type="button"
          onClick={() => setConfirming(false)}
          className={OUTLINE_BUTTON}
          style={{ borderColor: "var(--app-control-border)", color: "var(--app-ink)" }}
        >
          <X className="h-4 w-4" strokeWidth={2.1} aria-hidden />
          Cancel
        </button>
      </div>
    </div>
  );
}
