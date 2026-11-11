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
      className="inline-flex min-h-11 items-center justify-center gap-2 rounded-[var(--app-radius-sm)] px-1 text-[15px] font-semibold hover:underline"
      style={{ color: "var(--app-ink)" }}
    >
      <Route className="h-[18px] w-[18px]" aria-hidden style={{ color: "var(--app-ink-2)" }} />
      Plan from here
    </a>
  );
}
