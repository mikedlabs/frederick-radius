import type { CSSProperties, ReactNode } from "react";
import type { LucideIcon } from "lucide-react";

/**
 * Shared presentation for the "I want…" specimen-stamp tiles, so the Link
 * tiles (FieldTag) and the button tile (MoreSheetTile, which opens the More
 * drawer instead of navigating) render identically and can never drift.
 * Pure + presentational (no hooks/handlers), so it's safe in both a server
 * and a client component.
 */

export const craveTileClass =
  "tactile-interactive relative flex flex-col items-center justify-center gap-1 overflow-hidden rounded-[var(--app-radius-sm)] px-1 py-[7px] text-center";

export function craveTileStyle(ink: string): CSSProperties {
  return {
    // Tinted field-card stock washed in the tile's own craving color, so the
    // compact grid reads as a colorful sheet of specimen stamps.
    backgroundColor: `color-mix(in srgb, ${ink} 12%, var(--app-bg-elevated-solid))`,
    backgroundImage: "var(--app-paper-light)",
    border: `1px solid color-mix(in srgb, ${ink} 26%, var(--app-border))`,
    boxShadow: "var(--app-elev-1), var(--app-hi)",
  };
}

/** The struck color stamp (glyph reversed out of a solid plate) + the label. */
export function CraveTileInner({ icon: Icon, label, ink }: { icon: LucideIcon; label: ReactNode; ink: string }) {
  return (
    <>
      <span
        aria-hidden
        className="grid h-[27px] w-[27px] shrink-0 place-items-center rounded-[7px]"
        style={{
          background: ink,
          boxShadow: `inset 0 1px 0 color-mix(in srgb, #fff 22%, transparent), 0 1.5px 3px -0.5px color-mix(in srgb, ${ink} 42%, transparent)`,
          color: "var(--app-on-brand)",
        }}
      >
        <Icon className="h-[15px] w-[15px]" strokeWidth={2.25} />
      </span>
      <span className="max-w-full truncate text-[11px] font-semibold leading-tight" style={{ color: "var(--app-ink)" }}>
        {label}
      </span>
    </>
  );
}
