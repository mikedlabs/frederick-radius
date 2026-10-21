"use client";

import { parseAsString, useQueryStates } from "nuqs";
import { useTransition, useSyncExternalStore } from "react";
import { ChevronDown, MapPin } from "lucide-react";
import { MUNICIPALITIES } from "@/data/municipalities";
import { setScope } from "@/lib/scope";
import { queryWithoutSearchArea } from "@/lib/search/refinement";
import styles from "./SearchRefinements.module.css";

const subscribeReady = () => () => {};

export default function SearchRefinements({ town, query }: { town: string | null; query: string }) {
  const [pending, startTransition] = useTransition();
  const [, setSearchQuery] = useQueryStates(
    { in: parseAsString, q: parseAsString },
    { shallow: false, history: "push", scroll: false, startTransition },
  );
  const ready = useSyncExternalStore(subscribeReady, () => true, () => false);

  const handleSelect = (value: string) => {
    if (pending || !ready) return;
    const nextQuery = queryWithoutSearchArea(query);
    setScope(value === "county" ? "county" : `town:${value}`);
    // Results and the selected chip are server-rendered. Update both fields
    // together and rerun the server search; a shallow URL edit leaves stale
    // results on screen. Explicit county also survives a later scope cookie.
    void setSearchQuery({ in: value, q: nextQuery || null });
  };

  const options = [
    { slug: "county", name: "Whole county" },
    ...MUNICIPALITIES.map((m) => ({ slug: m.slug, name: m.name }))
  ];

  const currentValue = town ?? "county";

  return (
    <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 pb-1 pt-1">
      <label htmlFor="search-area" className="inline-flex min-h-[44px] shrink-0 items-center gap-2 text-[0.8125rem] font-semibold" style={{ color: "var(--app-ink-2)" }}>
        <MapPin className="h-4 w-4 shrink-0" aria-hidden />Search area
      </label>
      <span className={styles.control}>
        <select id="search-area" value={currentValue} disabled={pending || !ready}
          onChange={(event) => handleSelect(event.target.value)}
          className={styles.select}>
          {options.map((option) => <option key={option.slug} value={option.slug}>{option.name}</option>)}
        </select>
        <ChevronDown className={styles.chevron} aria-hidden />
      </span>
      <span role="status" className="sr-only">{pending ? "Updating matches…" : town ? "Only matches in this area are shown." : "Search across Frederick City and the county."}</span>
    </div>
  );
}
