"use client";

import type { RefObject } from "react";
import BottomSheet, { SheetHandle } from "@/components/ui/BottomSheet";
import type { NearbyQueryState } from "@/lib/nearby-query";
import NearbyRefinementControls from "./NearbyRefinementControls";
import styles from "./RightNow.module.css";

/**
 * Nearby-only Filters & sort sheet. Kept out of the /today graph by loading
 * this module from RightNow through next/dynamic.
 */
export default function NearbyFiltersSheet({
  present,
  draft,
  facets,
  supportsHours,
  closingSoonCount,
  hasRankingOrigin,
  applying,
  historyLayerId,
  returnFocusRef,
  heading,
  placeLabel,
  canDismiss,
  onDraftChange,
  onReset,
  onApply,
  onClose,
}: {
  present: boolean;
  draft: NearbyQueryState;
  facets: readonly { key: string; label: string }[];
  supportsHours: boolean;
  closingSoonCount: number;
  hasRankingOrigin: boolean;
  applying: boolean;
  historyLayerId: string;
  returnFocusRef: RefObject<HTMLButtonElement | null>;
  heading: string;
  placeLabel: string;
  canDismiss: () => boolean;
  onDraftChange: (patch: Partial<NearbyQueryState>) => void;
  onReset: () => void;
  onApply: (dismiss: () => void) => void;
  onClose: () => void;
}) {
  return (
    <BottomSheet
      present={present}
      ariaLabel="Filters & sort"
      historyLayerId={historyLayerId}
      returnFocusRef={returnFocusRef}
      canDismiss={canDismiss}
      maxHeight="90dvh"
      onClose={onClose}
    >
      {(dismiss) => (
        <>
          <SheetHandle onClose={dismiss} closeLabel="Close filters & sort" />
          <header className={styles.sheetHeader}>
            <h2>Filters &amp; sort</h2>
            <p>{heading} · {placeLabel}</p>
          </header>
          <div className={styles.sheetBody}>
            <NearbyRefinementControls
              value={draft}
              facets={facets}
              supportsHours={supportsHours}
              closingSoonCount={closingSoonCount}
              hasRankingOrigin={hasRankingOrigin}
              onChange={onDraftChange}
            />
          </div>
          <footer className={styles.sheetFooter}>
            <button
              type="button"
              className={styles.resetFilters}
              onClick={onReset}
            >
              Reset
            </button>
            <button
              type="button"
              className={styles.applyFilters}
              disabled={applying}
              onClick={() => onApply(dismiss)}
            >
              Done
            </button>
          </footer>
        </>
      )}
    </BottomSheet>
  );
}
