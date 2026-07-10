"use client";

import Link from "next/link";
import type { CSSProperties } from "react";
import type { LucideIcon } from "lucide-react";

export type ExploreItem = {
  href: string;
  label: string;
  description: string;
  icon: LucideIcon;
  /** Palette token; the card gradient is built from it. */
  color: string;
};

/** Engraved-card motifs, rotated per card so the deck reads as a wallet of
 *  distinct cards, not one gradient repeated. Reuses the .sw-m-* patterns. */
const MOTIFS = ["sw-m-topo", "sw-m-strata", "sw-m-grid", "sw-m-emboss", "sw-m-swirl", "sw-m-facet"];

/**
 * ExploreDeck — the field-guide index as numbered PLATES.
 *
 * The cards FAN IN on open (each from its own rotation, staggered) and settle
 * into a readable stack where every card's title lip is tappable and the last
 * card shows in full. Reduced-motion lands settled.
 *
 * The face is deliberately restrained (owner note 2026-07-10: the loud
 * full-gradient version read "cheesy"): every plate shares one deep-ink
 * ground with only a whisper of its hue mixed in, and the COLOR is spent
 * where a fine print series spends it — a spine stripe, a foil-tint plate
 * number, a hairline under the title. The icon is engraved into the corner
 * at low opacity, not stuck on in white. Typography carries the hierarchy,
 * per the aesthetic bar in CLAUDE.md.
 */
export default function ExploreDeck({
  items,
  onNavigate,
}: {
  items: ExploreItem[];
  onNavigate?: () => void;
}) {
  const mid = (items.length - 1) / 2;
  return (
    <div className="ex-deck">
      {items.map((it, i) => {
        const Icon = it.icon;
        const style: CSSProperties = {
          // One whisper of hue over a shared ink ground: the deck reads as a
          // matched series, and the spine stripe carries the identity.
          background: `linear-gradient(168deg, color-mix(in srgb, ${it.color} 26%, #191510), color-mix(in srgb, ${it.color} 10%, #14110C))`,
          // Custom props drive the staggered fan-in and the accent pieces
          // (spine, plate number, hairline) — see .ex-* in globals.css.
          "--exc": it.color,
          "--ex-i": i,
          "--ex-rot": `${Math.round((i - mid) * 5)}deg`,
        } as CSSProperties;
        return (
          <div className="ex-slot" key={it.href} style={{ zIndex: i }}>
            <Link
              href={it.href}
              onClick={onNavigate}
              className="ex-card"
              style={style}
              aria-label={`${it.label}: ${it.description}`}
            >
              <span aria-hidden className={`ex-motif ${MOTIFS[i % MOTIFS.length]}`} />
              <span aria-hidden className="ex-spine" />
              <span aria-hidden className="ex-ghost">
                <Icon className="h-16 w-16" strokeWidth={1.1} />
              </span>
              <span className="relative block">
                <span aria-hidden className="ex-plate">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <span className="block pr-10 font-serif text-[19px] font-semibold leading-tight tracking-tight">
                  {it.label}
                </span>
                <span aria-hidden className="ex-rule" />
                <span className="ex-desc mt-1.5 block max-w-[78%] text-[12px] leading-snug">
                  {it.description}
                </span>
              </span>
            </Link>
          </div>
        );
      })}
    </div>
  );
}
