"use client";

import { Suspense } from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import Omnibox from "@/components/system/Omnibox";
import type { IntentToken } from "@/lib/search/parseIntent";

/**
 * TopBarOmnibox — the ONE search input, wired to the URL (redesign shell).
 *
 * Submit pushes /search?q=<text>&t=<tokens> so the applied intent chips
 * are shareable, removable, and survive refresh (the URL-state rule).
 * On /search the box rehydrates its chips + text FROM the URL, so the
 * input and the page can never disagree.
 */
function Inner() {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();

  const onSearch = pathname === "/search";
  const initialText = onSearch ? (sp.get("q") ?? "") : "";
  const initialChips = onSearch
    ? ((sp.get("t")?.split(",").filter(Boolean) ?? []) as IntentToken[])
    : [];

  return (
    <Omnibox
      key={onSearch ? `s:${sp.toString()}` : pathname}
      initialText={initialText}
      initialChips={initialChips}
      onSubmit={({ tokens, text }) => {
        const q = new URLSearchParams();
        if (text) q.set("q", text);
        if (tokens.length) q.set("t", tokens.join(","));
        router.push(`/search${q.size ? `?${q}` : ""}`);
      }}
    />
  );
}

export default function TopBarOmnibox() {
  return (
    <Suspense fallback={<div className="h-10 flex-1" />}>
      <Inner />
    </Suspense>
  );
}
