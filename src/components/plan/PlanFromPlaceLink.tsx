"use client";

import { useSyncExternalStore } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { Route } from "lucide-react";
import { placePlanHref } from "@/lib/plan-journey";
import { getScope, subscribeScopeChange } from "@/lib/scope";

const serverScope = () => null;

/** A document navigation also closes the current place sheet before planning. */
export default function PlanFromPlaceLink({ slug, name }: { slug: string; name: string }) {
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
      className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full border px-4 text-[13px] font-semibold"
      style={{ borderColor: "var(--app-border)", color: "var(--app-ink)", background: "var(--app-bg-elevated)" }}
    >
      <Route className="h-4 w-4" aria-hidden />
      Plan from here
    </a>
  );
}
