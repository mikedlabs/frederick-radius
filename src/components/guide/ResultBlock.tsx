"use client";

import { useState, type ReactNode } from "react";
import { motion, type Variants } from "framer-motion";
import { ChevronDown } from "lucide-react";
import PlaceCard from "@/components/place/PlaceCard";
import type { PlaceCardData } from "@/lib/loaders/places";
import { placeReasons, type PlaceReasonChip } from "@/lib/place-reasons";
import { haptic } from "@/lib/haptics";

/**
 * ResultBlock — one tier of a SELECTED result set (not a directory list).
 *
 * A confident section label + an optional count, then the tier's cards at a
 * single, deliberate rhythm. Editorial discipline over pillowy cards: a
 * hairline rule under the label instead of a heavy shadow, tighter corners,
 * calm surfaces, and a hard cap on how many cards a tier may show. The
 * grouping and explanation live here; ranking/data stay upstream.
 *
 * Reduced-motion safe: the stagger is dropped entirely when the user asks
 * for less motion (the parent owns the entrance; this only governs the
 * "show more" affordance).
 */

/**
 * The single most decision-relevant reason for a card, so a grouped list
 * explains each pick in ONE chip instead of a repeating three-chip column.
 * Derived straight from placeReasons() — never fabricated. Priority order is
 * tuned per tier: the "useful nearby" layer leads with distance/open (the
 * practical question), everything else with the reason placeReasons ranks
 * first (open → distance → fit → quality → freshness).
 */
export function leadReason(
  place: PlaceCardData,
  prefer: "default" | "practical" = "default",
): PlaceReasonChip[] {
  const all = placeReasons(place);
  if (all.length === 0) return [];
  if (prefer === "practical") {
    const practical =
      all.find((r) => r.kind === "near" || r.kind === "walkable") ??
      all.find((r) => r.kind === "open_now" || r.kind === "verified_open");
    return [practical ?? all[0]];
  }
  return [all[0]];
}

function Label({ children, count, accent }: { children: ReactNode; count?: number; accent?: string }) {
  return (
    <div className="mb-3 flex items-baseline gap-2.5">
      {accent && (
        <span aria-hidden className="inline-block h-[14px] w-[3px] shrink-0 translate-y-[2px] rounded-full" style={{ background: accent }} />
      )}
      <h2 className="text-[13px] font-semibold uppercase tracking-[0.06em]" style={{ color: "var(--app-ink)" }}>
        {children}
      </h2>
      {typeof count === "number" && count > 0 && (
        <span className="text-[12px] tabular-nums" style={{ color: "var(--app-ink-3)" }}>
          {count}
        </span>
      )}
      {/* Hairline rule fills the remaining width — an editorial divider that
          separates tiers without the weight of a shadowed card band. */}
      <span aria-hidden className="ml-1 h-px flex-1 self-center" style={{ background: "var(--app-border)" }} />
    </div>
  );
}

export default function ResultBlock({
  label,
  count,
  accent,
  children,
  variants,
}: {
  /** The tier's confident heading (e.g. "Best match", "Useful nearby"). */
  label: ReactNode;
  /** Optional trailing count shown next to the label. */
  count?: number;
  /** Optional accent rail before the label (used to mark the lead tier). */
  accent?: string;
  children: ReactNode;
  /** Entrance variants from the parent's stagger container. */
  variants?: Variants;
}) {
  return (
    <motion.section variants={variants}>
      <Label count={count} accent={accent}>
        {label}
      </Label>
      {children}
    </motion.section>
  );
}

/**
 * A capped column of compact rows with a "+N more" affordance — the
 * "Keep looking" tail. Shows `initial` rows, then reveals the rest in place
 * on tap. Hairline-separated, tight rhythm, no per-row shadow.
 */
export function MoreList({
  places,
  initial = 6,
  reasonFor,
}: {
  places: PlaceCardData[];
  initial?: number;
  reasonFor?: (p: PlaceCardData) => PlaceReasonChip[];
}) {
  const [expanded, setExpanded] = useState(false);
  const shown = expanded ? places : places.slice(0, initial);
  const remaining = places.length - shown.length;

  return (
    <>
      <ul className="overflow-hidden rounded-[var(--app-radius-md)]" style={{ boxShadow: "inset 0 0 0 1px var(--app-border)" }}>
        {shown.map((p, i) => (
          <li
            key={p.slug}
            style={i > 0 ? { boxShadow: "inset 0 1px 0 var(--app-border)" } : undefined}
          >
            <PlaceCard place={p} variant="row" compact showSource={false} reasons={reasonFor?.(p)} />
          </li>
        ))}
      </ul>
      {remaining > 0 && (
        <button
          type="button"
          onClick={() => { haptic("light"); setExpanded(true); }}
          className="tactile-interactive mt-2.5 flex w-full items-center justify-center gap-1 rounded-[var(--app-radius-md)] py-2.5 text-[13px] font-semibold"
          style={{ color: "var(--app-ink-2)", boxShadow: "inset 0 0 0 1px var(--app-border)" }}
        >
          {remaining} more
          <ChevronDown className="h-4 w-4" strokeWidth={2.5} aria-hidden />
        </button>
      )}
    </>
  );
}
