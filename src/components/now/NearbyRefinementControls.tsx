"use client";

import type { NearbyQueryState } from "@/lib/nearby-query";
import styles from "./RightNow.module.css";

/** One set of refinements serves the desktop panel and the mobile draft. */
export default function NearbyRefinementControls({
  value,
  facets,
  supportsHours,
  closingSoonCount,
  hasRankingOrigin,
  onChange,
}: {
  value: NearbyQueryState;
  facets: readonly { key: string; label: string }[];
  supportsHours: boolean;
  closingSoonCount: number;
  hasRankingOrigin: boolean;
  onChange: (patch: Partial<NearbyQueryState>) => void;
}) {
  return (
    <div className={styles.controlGroups}>
      {facets.length > 0 && (
        <fieldset className={styles.controlSection}>
          <legend className={styles.controlTitle}>Type</legend>
          <div className={styles.controlChoices}>
            <FacetChip label="All" active={value.facetKey === null} color="var(--app-brand)" onClick={() => onChange({ facetKey: null })} />
            {facets.map((facet) => (
              <FacetChip key={facet.key} label={facet.label} active={value.facetKey === facet.key} color="var(--app-brand)" onClick={() => onChange({ facetKey: facet.key })} />
            ))}
          </div>
        </fieldset>
      )}
      {supportsHours && (
        <fieldset className={styles.controlSection}>
          <legend className={styles.controlTitle}>Hours</legend>
          <div className={styles.controlChoices}>
            <FacetChip label="Open now" active={value.openOnly} color="var(--app-brand)" onClick={() => onChange({ openOnly: !value.openOnly })} />
            {(value.closingSoonOnly || closingSoonCount > 0) && (
              <FacetChip label="Closing soon" active={value.closingSoonOnly} color="var(--app-brand)" onClick={() => onChange({ closingSoonOnly: !value.closingSoonOnly })} />
            )}
          </div>
          <p className={styles.controlHelp}>Open now includes places with confirmed current hours.</p>
        </fieldset>
      )}
      <fieldset className={styles.controlSection}>
        <legend className={styles.controlTitle}>Sort</legend>
        <div className={styles.controlChoices}>
          <FacetChip label="Smart" active={value.sort === "smart"} color="var(--app-brand)" onClick={() => onChange({ sort: "smart" })} />
          {hasRankingOrigin && (
            <FacetChip label="Nearest" active={value.sort === "nearest"} color="var(--app-brand)" onClick={() => onChange({ sort: "nearest" })} />
          )}
          <FacetChip label="Top rated" active={value.sort === "rated"} color="var(--app-brand)" onClick={() => onChange({ sort: "rated" })} />
        </div>
      </fieldset>
    </div>
  );
}

/** A sub-facet pill on the results page. Active = a wash of the craving's own
 *  ink with an ink label; inactive = a quiet outline. Pure + presentational. */
function FacetChip({
  label,
  active,
  color,
  onClick,
}: {
  label: string;
  active: boolean;
  color: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className="tap-44-y tactile-interactive min-h-11 min-w-11 rounded-full px-2.5 py-1 text-[12.5px] font-semibold"
      style={
        active
          ? {
              background: `color-mix(in srgb, ${color} 15%, transparent)`,
              color: "var(--app-ink)",
              boxShadow: `inset 0 0 0 1px color-mix(in srgb, ${color} 34%, transparent)`,
            }
          : { background: "var(--app-bg-elevated)", color: "var(--app-ink-3)", boxShadow: "inset 0 0 0 1px var(--app-border)" }
      }
    >
      {label}
    </button>
  );
}
