"use client";

import { useSyncExternalStore } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { Route } from "lucide-react";
import { placePlanHref } from "@/lib/plan-journey";
import { getScope, subscribeScopeChange } from "@/lib/scope";

const serverScope = () => null;

/**
 * A document navigation also closes the current place sheet before planning.
 * `appearance="text"` drops the pill for the place page, where Save and this
 * link share one row of 44px Brick-press text buttons under the title.
 */
export default function PlanFromPlaceLink({
  slug,
  name,
  appearance = "pill",
}: {
  slug: string;
  name: string;
  appearance?: "pill" | "text";
}) {
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const scope = useSyncExternalStore(subscribeScopeChange, getScope, serverScope);
  const href = placePlanHref(slug, new URL(`${pathname}?${searchParams}`, "https://frederick-radius.invalid"), scope);

  return (
    <a
      href={href}
      onClick={(event) => {
        // Map cameras can update with history.replaceState without a render.
        event.currentTarget.href = placePlanHref(slug, new URL(window.location.href), getScope());
      }}
      aria-label={`Plan an outing from ${name}`}
      data-appearance={appearance}
      className={appearance === "text"
        ? "inline-flex min-h-11 items-center gap-1.5 text-body font-semibold underline-offset-4 hover:underline"
        : "inline-flex min-h-11 items-center justify-center gap-2 rounded-full border px-4 text-[13px] font-semibold"}
      style={appearance === "text"
        ? { color: "var(--app-brand-press)" }
        : { borderColor: "var(--app-border)", color: "var(--app-ink)", background: "var(--app-bg-elevated)" }}
    >
      <Route className="h-4 w-4" aria-hidden />
      Plan from here
    </a>
  );
}
