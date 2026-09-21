"use client";

import { Bookmark, Copy, Smartphone } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { FAIR_DAY_PATH } from "@/lib/fair/plan-status";
import { openReturnBridge } from "@/lib/return-bridge";

/** Browser bookmarks and on-device plans are different. Never claim a copy saved either. */
export default function FairKeepGuide() {
  const [copyState, setCopyState] = useState<"idle" | "copied" | "manual">("idle");
  const [link, setLink] = useState("");
  const copy = async () => {
    const url = new URL(FAIR_DAY_PATH, window.location.origin).toString();
    setLink(url);
    try {
      if (!navigator.clipboard?.writeText) throw new Error("Clipboard unavailable");
      await navigator.clipboard.writeText(url);
      setCopyState("copied");
    } catch {
      setCopyState("manual");
    }
  };
  return (
    <details data-fair-keep-guide className="mt-4 border-y text-[var(--app-ink)]" style={{ borderColor: "var(--app-border)" }}>
      <summary className="tap-44 flex min-h-12 cursor-pointer items-center gap-2 py-2 text-[14px] font-semibold">
        <Bookmark className="h-4 w-4" aria-hidden />
        Keep this guide for Fair day
      </summary>
      <div className="pb-4">
        <p className="text-[14px] leading-relaxed">Bookmark this page with your browser’s bookmark or favorites option to return directly to the Fair.</p>
        <div className="mt-3 flex flex-wrap gap-2">
          <button type="button" onClick={copy} className="tap-44 inline-flex min-h-11 items-center gap-2 rounded-full border px-3 text-[13px] font-semibold" style={{ borderColor: "var(--app-control-border)" }}>
            <Copy className="h-4 w-4" aria-hidden />
            {copyState === "copied" ? "Link copied" : "Copy Fair link"}
          </button>
          <button type="button" onClick={openReturnBridge} className="tap-44 inline-flex min-h-11 items-center gap-2 rounded-full border px-3 text-[13px] font-semibold" style={{ borderColor: "var(--app-control-border)" }}>
            <Smartphone className="h-4 w-4" aria-hidden />
            Add Radius to Home Screen
          </button>
        </div>
        <p role="status" className="mt-2 text-[13px] leading-relaxed text-[var(--app-ink-2)]">
          {copyState === "copied" ? "Fair link copied. Your My Day plan stays in this browser, not in the link." : "My Day saves your stops in this browser. A bookmark or copied link does not transfer the plan to another device."}
        </p>
        <Link href="/install" className="mt-1 inline-flex min-h-11 items-center text-[13px] font-semibold text-[var(--app-ink-2)] underline underline-offset-4">
          Home Screen setup and help
        </Link>
        {copyState === "manual" ? <label className="mt-2 block text-[13px]">Select and copy the Fair link<input aria-label="Fair guide link" readOnly value={link} onFocus={(event) => event.currentTarget.select()} className="mt-1 min-h-11 w-full rounded-md border bg-[var(--app-bg)] px-3 text-[16px]" /></label> : null}
      </div>
    </details>
  );
}
