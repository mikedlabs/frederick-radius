"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { MapPin, ChevronDown } from "lucide-react";
import { setScope } from "@/lib/scope";
import { MUNICIPALITY_BY_SLUG } from "@/data/municipalities";

/**
 * CategoryLocationBar — the always-present "where am I looking" control on a
 * category page.
 *
 * The old affordance (SetTownInline) only appeared when NO town was set; the
 * moment you picked one, it was replaced by read-only "Ranked from X" text, so
 * there was no way to CHANGE the town on the page — you had to leave and find
 * the nav chip (which is desktop-only). Beta feedback (2026-07-12): "I picked
 * Mt. Airy but couldn't find where to change it."
 *
 * So this bar is ALWAYS shown, states the current choice, and carries the
 * change control inline. It writes the shared browsing SCOPE (lib/scope.ts) —
 * the same lens the nav chip and the other list surfaces use — so a change
 * here shows up in the chip and re-ranks everywhere, and the two controls can
 * never disagree.
 */
export default function CategoryLocationBar({
  current,
  municipalities,
}: {
  /** The effective origin town slug the page ranked from, or null = county. */
  current: string | null;
  municipalities: { slug: string; name: string }[];
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const currentName = current ? (MUNICIPALITY_BY_SLUG[current]?.name ?? null) : null;

  return (
    <div
      className="-mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 rounded-[var(--app-radius-md)] border px-3 py-2"
      style={{ borderColor: "var(--app-border)", background: "var(--app-bg-sunken)" }}
    >
      <MapPin className="h-3.5 w-3.5 shrink-0" strokeWidth={2} aria-hidden style={{ color: "var(--app-brand)" }} />
      <span className="text-[11px]" style={{ color: "var(--app-ink-3)" }}>
        {currentName ? `Ranked from ${currentName}` : "Showing all of Frederick County"}
      </span>
      {/* The change control — a native select so it works everywhere and needs
          no popover. Pre-selected to the current choice; picking re-ranks. */}
      <label className="tap-44-y relative inline-flex items-center gap-1 text-[12px] font-semibold" style={{ color: "var(--app-brand-press)" }}>
        <span aria-hidden>{currentName ? "Change" : "Set your town"}</span>
        <ChevronDown className="h-3.5 w-3.5" strokeWidth={2.25} aria-hidden />
        <select
          aria-label="Change the town results are ranked from"
          disabled={busy}
          value={current ?? "county"}
          onChange={(e) => {
            const v = e.target.value;
            setBusy(true);
            setScope(v === "county" ? "county" : (`town:${v}` as const));
            // Server components re-render with the new fr_scope cookie.
            router.refresh();
          }}
          className="absolute inset-0 cursor-pointer opacity-0"
        >
          <option value="county">Whole county</option>
          {municipalities.map((m) => (
            <option key={m.slug} value={m.slug}>
              {m.name}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}
