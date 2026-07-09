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
 * ExploreDeck — the field-guide index as a deck of wallet cards.
 *
 * The cards FAN IN on open (each from its own rotation, staggered) and settle
 * into a readable stack where every card's title lip is tappable and the last
 * card shows in full. Replaces the flat icon-tile grid for the Explore
 * ("Around the county") cluster; keeps the wallet visual language the saved /
 * deals / Keys decks already use. Motion is reduced-motion safe (lands settled).
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
          background: `linear-gradient(150deg, color-mix(in srgb, ${it.color} 85%, var(--app-ink)), color-mix(in srgb, ${it.color} 54%, var(--app-ink)))`,
          // Custom props drive the staggered fan-in (see .ex-card in globals.css).
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
              <span aria-hidden className="ex-sheen" />
              <span aria-hidden className="ex-seal">
                <Icon className="h-9 w-9" strokeWidth={1.5} style={{ color: "#fff" }} />
              </span>
              <span className="relative block">
                <span className="block font-serif text-[19px] font-semibold leading-tight tracking-tight">
                  {it.label}
                </span>
                <span className="mt-1 block max-w-[76%] text-[12px] leading-snug" style={{ opacity: 0.9 }}>
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
