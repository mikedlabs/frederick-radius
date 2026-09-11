"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { MapPin, ChevronDown, Loader2 } from "lucide-react";
import { setScope } from "@/lib/scope";
import { MUNICIPALITY_BY_SLUG } from "@/data/municipalities";

/**
 * ScopeBar — the always-present "where am I looking" control for a
 * scope-ranked LIST surface (category pages, /open-now — the pages that print
 * "Ranked from X" and re-order by proximity to a town).
 *
 * The old category affordance (SetTownInline) only appeared when NO town was
 * set; the moment you picked one, it was replaced by read-only "Ranked from X"
 * text, so there was no way to CHANGE the town on the page — you had to leave
 * and find the nav chip, which is hidden on mobile. Beta feedback (2026-07-12):
 * "I picked Mt. Airy but couldn't find where to change it." This is the fix, on
 * every ranked list surface: a contextual control right where location changes
 * the results, working the same on mobile and desktop.
 *
 * So this bar is ALWAYS shown, states the current choice, and carries the
 * change control inline. It writes the shared browsing SCOPE (lib/scope.ts) —
 * the same lens the nav chip and the other list surfaces use — so a change
 * here shows up in the chip and re-ranks everywhere, and the two controls can
 * never disagree.
 */
export default function ScopeBar({
  current,
  selectedTown,
  municipalities,
}: {
  /** The effective origin town slug the page ranked from, or null = county. */
  current: string | null;
  /** A town selected as the explicit browsing boundary. A saved-home ranking
   * origin stays null so choosing that same town still creates the boundary. */
  selectedTown: string | null;
  municipalities: { slug: string; name: string }[];
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const currentName = current ? (MUNICIPALITY_BY_SLUG[current]?.name ?? null) : null;
  const selectValue = selectedTown ?? (currentName ? "ranking-origin" : "county");

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
      <label
        className="relative inline-flex items-center gap-1 text-[12px] font-semibold"
        style={{ color: "color-mix(in srgb, var(--app-brand-press) 82%, var(--app-ink))" }}
      >
        <span>{currentName ? "Change town" : "Set your town"}</span>
        {isPending ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin motion-reduce:animate-none" strokeWidth={2.25} aria-hidden />
        ) : (
          <ChevronDown className="h-3.5 w-3.5" strokeWidth={2.25} aria-hidden />
        )}
        <select
          aria-describedby="scope-status"
          disabled={isPending}
          value={selectValue}
          onChange={(e) => {
            const v = e.target.value;
            setScope(v === "county" ? "county" : (`town:${v}` as const));
            // Server components re-render with the new fr_scope cookie.
            startTransition(() => router.refresh());
          }}
          className="absolute -inset-y-[13px] inset-x-0 cursor-pointer opacity-0 disabled:cursor-wait"
        >
          {currentName && !selectedTown ? (
            <option value="ranking-origin" disabled>
              Ranked from {currentName}
            </option>
          ) : null}
          <option value="county">Whole county</option>
          {municipalities.map((m) => (
            <option key={m.slug} value={m.slug}>
              {m.name}
            </option>
          ))}
        </select>
      </label>
      <span id="scope-status" className="sr-only" role="status" aria-live="polite">
        {isPending ? "Updating place rankings" : currentName ? `Ranked from ${currentName}` : "Ranked across Frederick County"}
      </span>
    </div>
  );
}
