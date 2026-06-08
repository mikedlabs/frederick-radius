"use client";

import Link, { useLinkStatus } from "next/link";
import { Loader2, type LucideIcon } from "lucide-react";
import type { CSSProperties } from "react";
import { haptic } from "@/lib/haptics";

/**
 * Segmented — the canonical joined-segment control (Visual System v2).
 *
 * One primitive for the "pick one of N modes" tablist that was
 * hand-rolled as the events view toggle and the map Radius/Browse
 * toggle. Segments sit in a single rounded, elevated container; the
 * active one fills with the brand. Pass either:
 *   - `value` + `onChange`  → button segments (client-side state), or
 *   - per-item `href`        → link segments (with a pending spinner so
 *                              a slow route swap never feels "stuck").
 *
 * Labels are optional — pass `labelsOn="sm"` to hide labels below the
 * small breakpoint (icon-only on tight rows, icon+label with room).
 */

export type SegmentItem<K extends string> = {
  key: K;
  label: string;
  icon?: LucideIcon;
  href?: string;
};

const SEG_BASE =
  "inline-flex items-center justify-center gap-1.5 font-semibold transition active:scale-[0.96]";
const SEG_SIZE: Record<"sm" | "md", string> = {
  md: "min-h-[40px] px-3.5 py-2 text-[12px]",
  sm: "min-h-[30px] px-2.5 py-1 text-[11px]",
};

function segStyle(active: boolean): CSSProperties {
  return {
    background: active ? "var(--app-brand)" : "transparent",
    color: active ? "#fff" : "var(--app-ink-2)",
  };
}

/** Link segment: reads useLinkStatus() (valid inside a <Link>) to show
 *  a spinner the instant its navigation begins. */
function LinkSegment<K extends string>({
  item,
  active,
  labelCls,
  size,
}: {
  item: SegmentItem<K>;
  active: boolean;
  labelCls: string;
  size: "sm" | "md";
}) {
  const { pending } = useLinkStatus();
  const Icon = item.icon;
  return (
    <Link
      role="tab"
      aria-selected={active}
      href={item.href!}
      className={`${SEG_BASE} ${SEG_SIZE[size]}`}
      style={segStyle(active)}
    >
      {pending ? (
        <Loader2 className="h-3.5 w-3.5 animate-spin" strokeWidth={2.25} aria-hidden />
      ) : (
        Icon && <Icon className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
      )}
      <span className={labelCls}>{item.label}</span>
    </Link>
  );
}

export default function Segmented<K extends string>({
  items,
  value,
  onChange,
  labelsOn = "always",
  ariaLabel = "View",
  className = "",
  size = "md",
}: {
  items: ReadonlyArray<SegmentItem<K>>;
  value?: K;
  onChange?: (key: K) => void;
  /** When labels show. "always" | "sm" (hidden below the sm breakpoint). */
  labelsOn?: "always" | "sm";
  ariaLabel?: string;
  className?: string;
  /** Control density. "md" (default) | "sm" (compact, e.g. the map nav). */
  size?: "sm" | "md";
}) {
  const labelCls = labelsOn === "sm" ? "hidden sm:inline" : "inline";
  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      className={`tactile inline-flex shrink-0 overflow-hidden rounded-full ${className}`.trim()}
    >
      {items.map((item) => {
        const active = value === item.key;
        if (item.href) {
          // Each link segment is its own component so its useLinkStatus
          // hook is scoped to that <Link>.
          return <LinkSegment key={item.key} item={item} active={active} labelCls={labelCls} size={size} />;
        }
        const Icon = item.icon;
        return (
          <button
            key={item.key}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => {
              haptic("light");
              onChange?.(item.key);
            }}
            className={`${SEG_BASE} ${SEG_SIZE[size]}`}
            style={segStyle(active)}
          >
            {Icon && <Icon className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />}
            <span className={labelCls}>{item.label}</span>
          </button>
        );
      })}
    </div>
  );
}
