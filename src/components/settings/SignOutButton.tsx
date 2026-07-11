"use client";

import { useState } from "react";
import { LogOut, X } from "lucide-react";
import { resetFollowsSyncFlag } from "@/hooks/useFollows";

export default function SignOutButton({ email }: { email: string | null }) {
  const [confirming, setConfirming] = useState(false);

  if (!confirming) {
    return (
      <button
        type="button"
        onClick={() => setConfirming(true)}
        className="tactile tactile-interactive inline-flex min-h-11 items-center justify-center gap-2 rounded-full border px-4 text-[12px] font-semibold"
        style={{
          borderColor: "var(--app-border)",
          background: "var(--app-bg-sunken)",
          color: "var(--app-ink-2)",
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
      className="rounded-[var(--app-radius-md)] border p-3.5"
      style={{
        borderColor: "color-mix(in srgb, var(--app-danger) 28%, var(--app-border))",
        background: "color-mix(in srgb, var(--app-danger) 6%, var(--app-bg-elevated))",
      }}
    >
      <p className="text-[13px] font-semibold" style={{ color: "var(--app-ink)" }}>
        Stop syncing here?
      </p>
      <p className="mt-1 text-[11.5px] leading-relaxed" style={{ color: "var(--app-ink-3)" }}>
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
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full px-4 text-[12px] font-semibold text-white"
            style={{ background: "var(--app-danger)" }}
          >
            <LogOut className="h-4 w-4" strokeWidth={2.1} aria-hidden />
            Sign out here
          </button>
        </form>
        <button
          type="button"
          onClick={() => setConfirming(false)}
          className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full border px-4 text-[12px] font-semibold"
          style={{ borderColor: "var(--app-border)", color: "var(--app-ink-2)" }}
        >
          <X className="h-4 w-4" strokeWidth={2.1} aria-hidden />
          Cancel
        </button>
      </div>
    </div>
  );
}
