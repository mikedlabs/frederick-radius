"use client";

import { useIsSaved, useToggleSave, useMounted } from "@/hooks/useSaved";
import { FAMILY_BY_KEY, type StyleFamily } from "@/data/beers";

/**
 * A directory beer rendered as a tap-to-save chip. Tapping toggles the beer in
 * "My taps" (the shared saved store); saved chips fill with the brand color.
 * Pre-mount it renders the unsaved state so SSR and hydration match.
 */
export default function BeerPill({
  savedKey,
  name,
  family,
  abv,
}: {
  savedKey: string;
  name: string;
  family: StyleFamily;
  abv: number | null;
}) {
  const mounted = useMounted();
  const saved = useIsSaved("beer", savedKey);
  const toggle = useToggleSave("beer", savedKey);
  const on = mounted && saved;
  const fam = FAMILY_BY_KEY[family];
  return (
    <button
      type="button"
      onClick={toggle}
      aria-pressed={on}
      aria-label={on ? `Remove ${name} from My taps` : `Save ${name} to My taps`}
      className="tap-44 inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[12px] font-medium transition"
      style={{
        background: on ? "var(--app-brand)" : "var(--app-bg-sunken)",
        color: on ? "var(--app-on-brand)" : "var(--app-ink-2)",
        border: `1px solid ${on ? "var(--app-brand)" : "var(--app-border)"}`,
      }}
    >
      <span
        aria-hidden
        className="h-2 w-2 shrink-0 rounded-full"
        style={{ background: on ? "var(--app-on-brand)" : fam.base }}
      />
      {name}
      {abv != null && (
        <span
          className="font-mono text-[10px] tabular-nums"
          style={{ color: on ? "var(--app-on-brand)" : "var(--app-ink-3)" }}
        >
          {abv.toFixed(1)}%
        </span>
      )}
    </button>
  );
}
