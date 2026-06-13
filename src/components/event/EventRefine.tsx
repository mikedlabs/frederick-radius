"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { SlidersHorizontal, Check } from "lucide-react";
import BottomDrawer from "@/components/ui/BottomDrawer";

/** A single toggle row in the Refine sheet (module-level so it isn't
 *  re-created on every render). */
function RefineRow({
  label,
  on,
  onClick,
}: {
  label: string;
  on: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={on}
      className="tap-44 flex w-full items-center justify-between rounded-[var(--app-radius-md)] px-3 py-2.5 text-left text-[14px]"
      style={{
        background: on ? "color-mix(in srgb, var(--app-brand) 12%, transparent)" : "transparent",
        color: "var(--app-ink)",
        fontWeight: on ? 600 : 400,
      }}
    >
      {label}
      {on && <Check className="h-4 w-4" strokeWidth={2.5} style={{ color: "var(--app-brand)" }} aria-hidden />}
    </button>
  );
}

/**
 * EventRefine — the single "Refine" sheet for the P3 agenda (handoff
 * pattern P3): town + sort, and nothing else (search routes to the
 * global command sheet; the five mood chips live inline above the
 * list). It holds toggles only — ZERO text inputs — so /events keeps
 * its <main> input-free.
 *
 * A small client island: it receives the towns list and the current
 * params, never the event array. Picking a town or sort pushes the
 * updated query; the server re-renders the filtered, day-grouped list.
 * The "active" badge on the trigger counts the non-default refinements.
 */
export default function EventRefine({
  towns,
  activeTown,
  activeSort,
}: {
  towns: { slug: string; name: string }[];
  activeTown: string | null;
  activeSort: "soonest" | "az";
}) {
  const router = useRouter();
  const params = useSearchParams();
  const [open, setOpen] = useState(false);

  const activeCount = (activeTown ? 1 : 0) + (activeSort !== "soonest" ? 1 : 0);

  function apply(next: { town?: string | null; sort?: "soonest" | "az" }) {
    const sp = new URLSearchParams(params?.toString() ?? "");
    if ("town" in next) {
      if (next.town) sp.set("m", next.town);
      else sp.delete("m");
    }
    if ("sort" in next) {
      if (next.sort && next.sort !== "soonest") sp.set("sort", next.sort);
      else sp.delete("sort");
    }
    const qs = sp.toString();
    router.push(qs ? `/events?${qs}` : "/events", { scroll: false });
  }

  return (
    <BottomDrawer
      open={open}
      onOpenChange={setOpen}
      title="Refine"
      subtitle="Filter by town and sort the list"
      trigger={
        <button
          type="button"
          className="tactile tactile-interactive inline-flex shrink-0 items-center gap-1.5 rounded-full px-3.5 py-2 text-[13px] font-semibold"
          style={{ background: "var(--app-bg-elevated)", color: "var(--app-ink-2)", boxShadow: "var(--app-edge), var(--app-hi)" }}
        >
          <SlidersHorizontal className="h-3.5 w-3.5" strokeWidth={2.25} aria-hidden />
          Refine
          {activeCount > 0 && (
            <span
              className="grid h-4 min-w-4 place-items-center rounded-full px-1 text-[10px] font-bold tabular-nums"
              style={{ background: "var(--app-brand)", color: "#fff" }}
            >
              {activeCount}
            </span>
          )}
        </button>
      }
    >
      <div className="space-y-4 pb-2">
        <div>
          <p className="eyebrow mb-1.5" style={{ color: "var(--app-ink-3)" }}>Town</p>
          <RefineRow label="All of Frederick County" on={!activeTown} onClick={() => apply({ town: null })} />
          {towns.map((t) => (
            <RefineRow key={t.slug} label={t.name} on={activeTown === t.slug} onClick={() => apply({ town: t.slug })} />
          ))}
        </div>
        <div>
          <p className="eyebrow mb-1.5" style={{ color: "var(--app-ink-3)" }}>Sort</p>
          <RefineRow label="Soonest first" on={activeSort === "soonest"} onClick={() => apply({ sort: "soonest" })} />
          <RefineRow label="A → Z by name" on={activeSort === "az"} onClick={() => apply({ sort: "az" })} />
        </div>
      </div>
    </BottomDrawer>
  );
}
