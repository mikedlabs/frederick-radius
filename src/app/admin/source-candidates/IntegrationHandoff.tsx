"use client";

import { useState } from "react";
import { Check, ClipboardCopy } from "lucide-react";

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

export default function IntegrationHandoff({
  title,
  markdown,
}: {
  title: string;
  markdown: string;
}) {
  const [copyState, setCopyState] = useState<"idle" | "copied" | "failed">("idle");

  const copy = async () => {
    const copied = await copyText(markdown);
    setCopyState(copied ? "copied" : "failed");
    if (copied) window.setTimeout(() => setCopyState("idle"), 2_000);
  };

  return (
    <details
      className="mt-3 rounded-[var(--app-radius-md)] border px-3 py-2.5"
      style={{
        borderColor: "var(--app-border)",
        background: "var(--app-bg-sunken)",
      }}
    >
      <summary
        className="tap-44 cursor-pointer text-xs font-semibold"
        style={{ color: "var(--app-ink)" }}
      >
        Implementation handoff
      </summary>
      <p className="mt-2 text-xs leading-relaxed" style={{ color: "var(--app-ink-2)" }}>
        {title}. Copy this reviewed brief into the implementation PR. It does not authorize publishing the provider&apos;s claims.
      </p>
      <button
        type="button"
        onClick={copy}
        className="tap-44 mt-2 inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition hover:bg-[var(--app-bg-elevated)]"
        style={{
          borderColor: "var(--app-border)",
          color: copyState === "copied" ? "var(--app-positive)" : "var(--app-ink-2)",
        }}
      >
        {copyState === "copied" ? (
          <Check className="h-3.5 w-3.5" aria-hidden />
        ) : (
          <ClipboardCopy className="h-3.5 w-3.5" aria-hidden />
        )}
        {copyState === "copied" ? "Brief copied" : "Copy implementation brief"}
      </button>
      <p className="sr-only" role="status" aria-live="polite">
        {copyState === "copied"
          ? "Implementation brief copied."
          : copyState === "failed"
            ? "The brief could not be copied."
            : ""}
      </p>
      {copyState === "failed" ? (
        <p className="mt-1 text-xs" style={{ color: "var(--app-danger)" }}>
          Copy failed. Open the brief below and copy it manually.
        </p>
      ) : null}
      <pre
        className="mt-3 max-h-72 overflow-auto whitespace-pre-wrap rounded-[var(--app-radius-sm)] border p-3 text-[11px] leading-relaxed"
        style={{
          borderColor: "var(--app-border)",
          background: "var(--app-bg-elevated)",
          color: "var(--app-ink-2)",
        }}
      >
        {markdown}
      </pre>
    </details>
  );
}
