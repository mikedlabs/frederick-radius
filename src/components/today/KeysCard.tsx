import Link from "next/link";
import type { CSSProperties } from "react";
import type { EventWithMeta } from "@/lib/loaders/events";
// Data-free formatter (never the loader) so this stays a light leaf.
import { eventDateBlock } from "@/lib/events/format";
import { keysOpponent } from "@/lib/today/keysEvent";
import { statusLabel } from "@/lib/event-status";

/**
 * KeysCard — the Frederick Keys home game, dressed in the TEAM's colors instead
 * of the generic sports EventCard. A navy specimen plate carrying the Keys
 * identity, the matchup ("vs Brooklyn Cyclones"), first-pitch time, and Nymeo
 * Field — with the red/gold accents and a baseball motif that read as a special
 * team card sitting inside the paper field guide (not a SaaS box, not a clash).
 *
 * Detection lives in lib/today/keysEvent (isKeysEvent); /today branches to this
 * card so the generic EventCard everywhere else is untouched.
 *
 * The Keys palette is a deliberate branded EXCEPTION to the "always var(--app-*)"
 * rule (same license the marketing shell + the Saved wallet's per-issuer hues
 * take): a team card's whole point is the team's own navy/red/gold, which the
 * app tokens don't carry.
 */

// Frederick Keys team palette.
const NAVY = "#13284B";
const NAVY_DEEP = "#0B182F";
const KEYS_RED = "#C8102E";
const KEYS_GOLD = "#FDB927";
const CREAM = "#F3ECDC";

/** A stitched baseball — the card's mark (eyebrow glyph + corner watermark). */
function Baseball({ className, style }: { className?: string; style?: CSSProperties }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" className={className} style={style} aria-hidden>
      <circle cx="12" cy="12" r="9.2" />
      <path d="M5.2 5.6c3 2.6 3 10.2 0 12.8" stroke={KEYS_RED} />
      <path d="M18.8 5.6c-3 2.6-3 10.2 0 12.8" stroke={KEYS_RED} />
    </svg>
  );
}

export default function KeysCard({
  event,
  variant = "feature",
}: {
  event: EventWithMeta;
  /** `feature` = the full-width lead; `tile` = the 280px rail card. */
  variant?: "feature" | "tile";
}) {
  const date = eventDateBlock(event);
  const opponent = keysOpponent(event.title);
  const status = event.status ?? "scheduled";
  const statusText = statusLabel(status);
  const venue = event.venue_name || "Nymeo Field at Harry Grove Stadium";
  const compact = variant === "tile";
  const heading = opponent ? `vs ${opponent}` : event.title;

  // Prefer the game's own Ticketmaster link (the merged feed row carries one
  // when Ticketmaster lists the game); fall back to the official box office.
  const tickets = event.ticket_url || "https://www.milb.com/frederick/tickets";

  return (
    <div
      className="tactile-interactive group relative h-full overflow-hidden rounded-[var(--app-radius-lg)]"
      style={{
        background: `linear-gradient(152deg, ${NAVY} 0%, ${NAVY_DEEP} 100%)`,
        color: CREAM,
        boxShadow: "var(--app-elev-1), var(--app-edge)",
      }}
    >
      {/* Red→gold pennant rule along the top edge — the team-color signature. */}
      <span aria-hidden className="absolute inset-x-0 top-0 h-[3px]" style={{ background: `linear-gradient(90deg, ${KEYS_RED} 0%, ${KEYS_GOLD} 100%)` }} />
      {/* Oversized baseball watermark, letterpressed off the top-right corner. */}
      <span aria-hidden className="pointer-events-none absolute -right-6 -top-4" style={{ color: CREAM, opacity: 0.1 }}>
        <Baseball className={compact ? "h-28 w-28" : "h-36 w-36"} />
      </span>

      <div className={compact ? "relative p-3.5" : "relative p-4"}>
        {/* Identity eyebrow — ball glyph + wordmark in gold, a red HOME tag. */}
        <div className="flex items-center gap-2">
          <Baseball className="h-4 w-4" style={{ color: KEYS_GOLD }} />
          <span className="font-mono text-[10px] font-bold uppercase tracking-[0.16em]" style={{ color: KEYS_GOLD }}>
            Frederick Keys
          </span>
          <span
            className="ml-auto shrink-0 rounded-full px-2 py-0.5 font-mono text-[9px] font-bold uppercase tracking-[0.1em]"
            style={{ background: KEYS_RED, color: "#fff" }}
          >
            Home
          </span>
        </div>

        {/* The matchup — the headline. */}
        <h3
          className={`mt-2 font-serif font-semibold leading-[1.1] tracking-tight ${compact ? "line-clamp-2 text-[18px]" : "text-[23px]"}`}
          style={{ color: CREAM }}
        >
          {heading}
        </h3>

        {statusText && (
          <span
            className="mt-1.5 inline-block rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.1em]"
            style={{ background: KEYS_RED, color: "#fff" }}
          >
            {statusText}
          </span>
        )}

        {/* First pitch (gold, the decision fact) + the date. */}
        <p className="mt-2.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 font-mono text-[11px] tabular-nums">
          {date.time && (
            <span className="font-bold uppercase tracking-[0.04em]" style={{ color: KEYS_GOLD }}>
              First pitch {date.time}
            </span>
          )}
          <span style={{ color: "rgba(243,236,220,0.55)" }} aria-hidden>·</span>
          <span style={{ color: "rgba(243,236,220,0.82)" }}>
            {date.weekday} {date.month} {date.day}
          </span>
        </p>

        {/* The ballpark. */}
        <p className="mt-1 truncate text-[12px] leading-snug" style={{ color: "rgba(243,236,220,0.7)" }}>
          {venue}
        </p>

        {/* Tickets — the per-game Ticketmaster link when the feed has one,
            else the official box office. Sits ABOVE the stretched card link
            (z-2 vs z-1), so it never fights the card tap. */}
        <a
          href={tickets}
          target="_blank"
          rel="noopener noreferrer"
          className="tap-44-y relative z-[2] mt-2.5 inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 font-mono text-[10px] font-bold uppercase tracking-[0.1em]"
          style={{ borderColor: KEYS_GOLD, color: KEYS_GOLD }}
        >
          Get tickets
        </a>
      </div>

      {/* The card's primary action — the event page. A stretched link keeps
          the whole plate tappable without nesting an anchor in an anchor. */}
      <Link
        href={`/events/${event.slug}`}
        aria-label={`Frederick Keys ${opponent ? `versus ${opponent}` : "home game"}${date.time ? `, first pitch ${date.time}` : ""}, at ${venue}`}
        className="absolute inset-0 z-[1]"
      />
    </div>
  );
}
