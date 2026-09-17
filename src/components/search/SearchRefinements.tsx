"use client";

import { useQueryState } from "nuqs";
import { useTransition, useSyncExternalStore } from "react";
import { motion, LayoutGroup } from "framer-motion";
import { MapPin } from "lucide-react";
import { MUNICIPALITIES } from "@/data/municipalities";
import { setScope } from "@/lib/scope";
import { queryWithoutSearchArea } from "@/lib/search/refinement";

const subscribeReady = () => () => {};

export default function SearchRefinements({ town, query }: { town: string | null; query: string }) {
  const [, setInQuery] = useQueryState("in");
  const [, setQQuery] = useQueryState("q");
  const [pending, startTransition] = useTransition();
  const ready = useSyncExternalStore(subscribeReady, () => true, () => false);

  const handleSelect = (value: string) => {
    if (pending || !ready) return;
    const nextQuery = queryWithoutSearchArea(query);
    setScope(value === "county" ? "county" : `town:${value}`);
    startTransition(() => {
      setInQuery(value === "county" ? null : value);
      setQQuery(nextQuery);
    });
  };

  const options = [
    { slug: "county", name: "Whole county" },
    ...MUNICIPALITIES.map((m) => ({ slug: m.slug, name: m.name }))
  ];

  const currentValue = town ?? "county";

  return (
    <div className="flex flex-col gap-3 border-b pb-4 pt-2" style={{ borderColor: "var(--app-border)" }}>
      <div className="flex items-center gap-2 px-1 text-[13px] font-semibold uppercase tracking-wide" style={{ color: "var(--app-ink-3)" }}>
        <MapPin className="h-4 w-4 shrink-0" aria-hidden />
        <span>Search Area</span>
      </div>
      
      {/* Edge-to-edge horizontal scrolling chips */}
      <div className="-mx-4 flex overflow-x-auto px-4 pb-2 sm:-mx-6 sm:px-6 lg:mx-0 lg:px-0 [&::-webkit-scrollbar]:hidden" style={{ scrollbarWidth: "none" }}>
        <LayoutGroup id="search-refinements">
          <div className="flex gap-2">
            {options.map((opt) => {
              const isSelected = currentValue === opt.slug;
              return (
                <button
                  key={opt.slug}
                  onClick={() => handleSelect(opt.slug)}
                  disabled={pending || !ready}
                  className="tap-44-y relative shrink-0 rounded-full px-4 py-2 text-[14px] font-medium transition active:scale-[0.98] disabled:opacity-60"
                  style={{
                    color: isSelected ? "var(--app-on-brand)" : "var(--app-ink)",
                    border: isSelected ? "1px solid transparent" : "1px solid var(--app-border)",
                    background: isSelected ? "transparent" : "var(--app-bg-inset)"
                  }}
                >
                  {isSelected && (
                    <motion.div
                      layoutId="active-refinement-pill"
                      className="absolute inset-0 rounded-full"
                      style={{ background: "var(--app-brand)", boxShadow: "var(--app-shadow-1)" }}
                      transition={{ type: "spring", bounce: 0.15, duration: 0.5 }}
                    />
                  )}
                  <span className="relative z-10">{opt.name}</span>
                </button>
              );
            })}
          </div>
        </LayoutGroup>
      </div>
      
      <p role="status" className="px-1 text-[12px]" style={{ color: "var(--app-ink-2)" }}>
        {pending ? "Updating matches…" : town ? "Only matches in this area are shown." : "Search across Frederick City and the county."}
      </p>
    </div>
  );
}
