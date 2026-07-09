"use client";

/**
 * DealsWallet — "Today's specials" as a WALLET CARD STACK, mirroring the Saved
 * page's deck (SavedWallet) so the app reads as one system. Each verified
 * special is a laminated card in its venue category's jewel hue that tucks to a
 * lip showing the deal headline, the venue, and the time/terms as a mono lip
 * fact; tapping a lip raises the card (accordion, one at a time) to reveal the
 * full offer, an insider note, and an Open-page action.
 *
 * This REUSES the shipped `.sw-*` visual language verbatim (stack / slot / card
 * / face / lipfact / facebody / stub) — the same fan geometry, lamination, foil,
 * and motif set the Saved deck uses — so the two decks are visibly one family.
 * Vermilion stays on its diet: no brand-red here, just the darkened category
 * ground and the gold deal tag.
 */

import { useState, type CSSProperties } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import CategoryIcon from "@/components/place/CategoryIcon";
import { CATEGORY_BY_SLUG } from "@/data/categories";
import DealLines from "@/components/happy/DealLines";
import type { TodaysDeal } from "@/lib/loaders/todaysDeals";

/**
 * Wallet card GROUND per deal category — the same jewel-tone register the Saved
 * deck's WALLET_GROUND uses, scoped to the food/drink families deals actually
 * come from. Darkened as a gradient inline so cream text clears AA; falls back
 * to the category ink, then a wine red.
 */
const DEAL_GROUND: Record<string, string> = {
  restaurant: "#C23A22", pizza: "#D2481F", bakery: "#C77A1E", coffee: "#6F4A2F",
  cafe: "#6F4A2F", bar: "#8A2433", brewery: "#C0871F", winery: "#7A2D5A",
  distillery: "#A6602E", cidery: "#B5651D", "ice-cream": "#C85C86",
  market: "#3E8E41", agritourism: "#6B8E23",
};

// Drink families get the prism facet motif; everything else the guilloché
// swirl — the same .sw-m-* marks that make the Saved deck read as distinct cards.
const DRINK = new Set(["bar", "brewery", "winery", "distillery", "cidery", "coffee", "cafe"]);
function motifClass(category?: string): string {
  return DRINK.has(category ?? "") ? "sw-m-facet" : "sw-m-swirl";
}

function DealCard({
  deal: d,
  index,
  open,
  onOpen,
}: {
  deal: TodaysDeal;
  index: number;
  open: boolean;
  onOpen: () => void;
}) {
  const router = useRouter();
  const category = d.category ?? "";
  const hue = DEAL_GROUND[category] ?? CATEGORY_BY_SLUG[category]?.color ?? "#8A2433";
  // The mono lip fact: WHEN, plus any terms qualifier the boundary lifted out
  // of the headline ("4–10 PM · Eat-in only").
  const lip = [d.hours ?? "Today", d.terms].filter(Boolean).join(" · ");
  // "Downtown Frederick" is a neighborhood label; TOWN is Frederick — the
  // shorter true name also stops the stub cell clipping at 390px.
  const town = d.town?.replace(/^Downtown\s+/i, "");
  // Raised body: skip the offer lines when the distilled headline already says
  // the whole offer — the body would just restate the title word for word.
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9$%]+/g, " ").trim();
  const bodyRepeatsHeadline = norm(d.offer) === norm(d.headline);

  function toggle() {
    if (open) {
      // Wallet behavior: a tap on the RAISED card opens its place page.
      router.push(`/places/${d.slug}`);
      return;
    }
    onOpen();
  }
  function onKey(e: React.KeyboardEvent<HTMLDivElement>) {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      toggle();
    }
  }
  const stop = (e: React.MouseEvent) => e.stopPropagation();

  return (
    <div
      role="button"
      tabIndex={0}
      aria-expanded={open}
      aria-label={`${d.name}: ${d.offer}${open ? ", raised. Tap again to open its page" : ", tap to raise"}`}
      onClick={toggle}
      onKeyDown={onKey}
      className={`sw-card${open ? " is-open" : ""}`}
      style={
        {
          background: `linear-gradient(152deg, color-mix(in srgb, ${hue} 60%, #16140E), color-mix(in srgb, ${hue} 34%, #0c0a06))`,
          "--sw-i": index,
        } as CSSProperties
      }
    >
      <span className={`sw-art ${motifClass(category)}`} aria-hidden />
      <span className="sw-holo" aria-hidden />
      <span className="sw-foil-edge" aria-hidden />
      <span className="sw-glyph" aria-hidden>
        <CategoryIcon slug={category} className="h-full w-full" strokeWidth={1.5} />
      </span>

      <div className="sw-face">
        {/* Lip lockup — glyph + the DEAL HEADLINE (serif) left; the time/terms
            as the ONE mono lip fact right (the category tier on raise). */}
        <div className="sw-top">
          <span className="sw-brand">
            <CategoryIcon slug={category} className="h-[21px] w-[21px]" strokeWidth={2.25} />
            <span className="sw-name">{d.headline}</span>
          </span>
          <span className="sw-lipfact">{lip}</span>
          <span className="sw-tier">{(CATEGORY_BY_SLUG[category]?.name ?? "Special").toUpperCase()}</span>
        </div>

        {/* The venue — always visible in the lip, under the headline, so a
            scan of tucked cards reads "deal · where". */}
        <p
          className="mt-1 truncate font-mono text-[10.5px] font-semibold uppercase tracking-[0.08em]"
          style={{ color: "rgba(243,236,220,0.82)" }}
        >
          {d.name}
          {town ? <span style={{ color: "rgba(243,236,220,0.6)" }}>{"  ·  "}{town}</span> : null}
        </p>

        {/* Raised-only: the full offer as clause lines + an insider note. */}
        <div className="sw-facebody">
          {!bodyRepeatsHeadline && (
            <DealLines deal={d.offer} tone="onPhoto" max={3} className="space-y-0.5 text-[13px]" />
          )}
          {d.tip && (
            <>
              <p className="sw-tip">{d.tip}</p>
              <p className="sw-tipsrc">Field note · verified at the source</p>
            </>
          )}
        </div>
      </div>

      {/* THE STUB — cream specimen label with the mono facts + the action. */}
      <div className="sw-stub">
        <div className="sw-stub-grid">
          <dl className="sw-ledger">
            <div className="sw-cell">
              <dt>When</dt>
              <dd>{d.hours ?? "Today"}</dd>
            </div>
            <div className="sw-cell">
              <dt>Town</dt>
              <dd>{town ?? "Frederick County"}</dd>
            </div>
            {d.park && (
              <div className="sw-cell sw-cell-wide">
                <dt>Parking</dt>
                <dd style={{ whiteSpace: "normal" }}>{d.park}</dd>
              </div>
            )}
          </dl>
          <div className="sw-rail">
            <span className="sw-plateseal">Verified</span>
          </div>
        </div>
        <div className="sw-actions">
          <Link href={`/places/${d.slug}`} onClick={stop} tabIndex={open ? 0 : -1} className="sw-act-primary">
            Open page
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" aria-hidden>
              <path d="M5 12h14M13 6l6 6-6 6" />
            </svg>
          </Link>
        </div>
      </div>
    </div>
  );
}

export default function DealsWallet({ deals }: { deals: TodaysDeal[] }) {
  // One card raised at a time (accordion), like the Saved wallet. Keyed by slug
  // so a re-render keeps the SAME card raised. Defaults to the top card.
  // Start fully closed — no card raised until the user taps one.
  const [openSlug, setOpenSlug] = useState<string | null>(null);
  if (deals.length === 0) return null;
  const openValid = deals.some((d) => d.slug === openSlug);
  return (
    <div className="sw-stack sw-deals" role="list" aria-label="Today's specials, as a card wallet">
      {deals.map((d, i) => {
        const open = openValid && d.slug === openSlug;
        return (
          <div role="listitem" key={d.slug} className={`sw-slot${open ? " is-open" : ""}`}>
            <DealCard deal={d} index={i} open={open} onOpen={() => setOpenSlug(d.slug)} />
          </div>
        );
      })}
    </div>
  );
}
