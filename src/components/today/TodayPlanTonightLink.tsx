"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useSyncExternalStore } from "react";
import { ChevronRight } from "lucide-react";
import { getScope, parseScope, scopeToParam, subscribeScopeChange, type Scope } from "@/lib/scope";

/** Carry the active URL lens without making the cached Today page dynamic. */
export function tonightEntryHref(rawScope: string | null, storedScope: Scope | null): string {
  const scope = parseScope(rawScope) ?? storedScope;
  return scope ? `/today/tonight?intent=dinner&in=${scopeToParam(scope)}` : "/tonight";
}

const subscribe = (onChange: () => void) => subscribeScopeChange(() => onChange());

export default function TodayPlanTonightLink() {
  const params = useSearchParams();
  const storedScope = useSyncExternalStore(subscribe, getScope, () => null);
  return (
    <Link href={tonightEntryHref(params.get("in"), storedScope)} prefetch={false}
      className="mt-1 inline-flex min-h-11 items-center gap-1.5 text-[15px] font-semibold"
      style={{ color: "var(--app-link)" }}>
      Plan tonight <ChevronRight aria-hidden className="h-4 w-4" />
    </Link>
  );
}
