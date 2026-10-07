"use client";

import { useEffect, useState } from "react";

/**
 * "Copy" beside a place's address, for pasting into a ride app or a message.
 * The visible word changes to "Copied" and a polite live region says so once.
 * When the clipboard is blocked (an insecure context or a denied permission)
 * the button says "Copy failed" instead of pretending it worked.
 */
export default function CopyAddressButton({
  address,
  placeName,
}: {
  address: string;
  placeName: string;
}) {
  const [state, setState] = useState<"idle" | "copied" | "failed">("idle");

  useEffect(() => {
    if (state === "idle") return;
    const reset = window.setTimeout(() => setState("idle"), 2000);
    return () => window.clearTimeout(reset);
  }, [state]);

  async function copy() {
    try {
      await navigator.clipboard.writeText(address);
      setState("copied");
    } catch {
      setState("failed");
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={copy}
        aria-label={`Copy the address of ${placeName}`}
        className="tap-44 text-meta-lg shrink-0 font-semibold underline underline-offset-2"
        style={{ color: "var(--app-brand-press)" }}
      >
        {state === "copied" ? "Copied" : state === "failed" ? "Copy failed" : "Copy"}
      </button>
      <span className="sr-only" aria-live="polite">
        {state === "copied" ? "Address copied." : state === "failed" ? "The address could not be copied." : ""}
      </span>
    </>
  );
}
