"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useSyncExternalStore } from "react";
import { ChevronRight } from "lucide-react";
import { daypart } from "@/lib/daypart";
import { getScope, parseScope, scopeToParam, subscribeScopeChange, type Scope } from "@/lib/scope";

/** Carry the active URL lens without making the cached Today page dynamic. */
export function tonightEntryHref(rawScope: string | null, storedScope: Scope | null): string {
  const scope = parseScope(rawScope) ?? storedScope;
  return scope ? `/today/tonight?intent=dinner&in=${scopeToParam(scope)}` : "/tonight";
}

/** Planning tonight stops being useful once the late daypart begins at 9 PM;
 * from then Today's own program and the coming-day rows carry the answer. */
export function showsPlanTonight(now: Date): boolean {
  return daypart(now) !== "late";
}

const subscribe = (onChange: () => void) => subscribeScopeChange(() => onChange());

/** Re-read the clock each minute so a page left open past 9 PM, or a cached
 * render served after it, retires the link on the visitor's own clock. */
const subscribeClock = (onChange: () => void) => {
  const id = window.setInterval(onChange, 60_000);
  return () => window.clearInterval(id);
};

export default function TodayPlanTonightLink({ renderedAt }: { renderedAt?: string } = {}) {
  const params = useSearchParams();
  const storedScope = useSyncExternalStore(subscribe, getScope, () => null);
  // The server snapshot reads the render instant the page was built with, so
  // hydration of a cached page matches its HTML before the live clock decides.
  const visible = useSyncExternalStore(
    subscribeClock,
    () => showsPlanTonight(new Date()),
    () => showsPlanTonight(renderedAt ? new Date(renderedAt) : new Date()),
  );
  if (!visible) return null;
  return (
    <Link href={tonightEntryHref(params.get("in"), storedScope)} prefetch={false}
      className="mt-1 inline-flex min-h-11 items-center gap-1.5 text-[15px] font-semibold"
      style={{ color: "var(--app-brand-press)" }}>
      Plan tonight <ChevronRight aria-hidden className="h-4 w-4" />
    </Link>
  );
}
