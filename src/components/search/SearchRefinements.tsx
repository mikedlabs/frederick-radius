"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useTransition, useSyncExternalStore } from "react";
import { MapPin } from "lucide-react";
import { MUNICIPALITIES } from "@/data/municipalities";
import { setScope } from "@/lib/scope";
import { queryWithoutSearchArea } from "@/lib/search/refinement";

const subscribeReady = () => () => {};

/** Refinements live in the URL, so reload, sharing, and Back keep the request. */
export default function SearchRefinements({ town, query }: { town: string | null; query: string }) {
  const router = useRouter();
  const params = useSearchParams();
  const [pending, startTransition] = useTransition();
  const ready = useSyncExternalStore(subscribeReady, () => true, () => false);
  return (
    <div className="flex min-h-12 flex-wrap items-center gap-x-3 gap-y-1 border-b pb-3" style={{ borderColor: "var(--app-border)" }}>
      <label className="flex min-h-11 min-w-0 items-center gap-2 text-[14px] font-medium">
        <MapPin className="h-4 w-4 shrink-0" aria-hidden style={{ color: "var(--app-cool)" }} />
        <span className="sr-only">Search area</span>
        <select
          value={town ?? "county"}
          disabled={pending || !ready}
          onChange={(event) => {
            const value = event.target.value;
            const next = new URLSearchParams(params.toString());
            const nextQuery = queryWithoutSearchArea(query);
            next.set("q", nextQuery);
            next.set("in", value);
            setScope(value === "county" ? "county" : `town:${value}`);
            startTransition(() => router.push(`/search?${next.toString()}`));
          }}
          className="min-h-11 max-w-full rounded-[var(--app-radius-sm)] border bg-[var(--app-bg-elevated)] px-3 text-[16px] disabled:opacity-60"
          style={{ borderColor: "var(--app-control-border)", color: "var(--app-ink)" }}
        >
          <option value="county">Whole county</option>
          {MUNICIPALITIES.map((item) => <option key={item.slug} value={item.slug}>{item.name}</option>)}
        </select>
      </label>
      <p role="status" className="text-[12px]" style={{ color: "var(--app-ink-2)" }}>
        {pending ? "Updating matches…" : town ? "Only matches in this area are shown." : "Search across Frederick City and the county."}
      </p>
    </div>
  );
}
