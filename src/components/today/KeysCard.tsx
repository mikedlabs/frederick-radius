import Link from "next/link";
import type { CSSProperties } from "react";
import type { EventWithMeta } from "@/lib/loaders/events";
// Data-free formatter (never the loader) so this stays a light leaf.
import { eventDateBlock } from "@/lib/events/format";
import { keysOpponent, keysTicketUrl } from "@/lib/today/keysEvent";
import { statusLabel } from "@/lib/event-status";
import LiveCountdown from "@/components/ui/LiveCountdown";

/**
 * KeysCard — the Frederick Keys home game, dressed in the TEAM's colors instead
 * of the generic sports EventCard. A home-whites specimen plate carrying the Keys
 * identity, the matchup ("vs Brooklyn Cyclones"), first-pitch time, and Nymeo
 * Field — with the orange accents and a baseball motif that read as a special
 * team card sitting inside the paper field guide (not a SaaS box, not a clash).
 *
 * Detection lives in lib/today/keysEvent (isKeysEvent); /today branches to this
 * card so the generic EventCard everywhere else is untouched.
 *
 * The Keys palette is a deliberate branded EXCEPTION to the "always var(--app-*)"
 * rule (same license the marketing shell + the Saved wallet's per-issuer hues
 * take): a team card's whole point is the team's own orange/black, which the
 * app tokens don't carry.
 */

// Frederick Keys team palette.
// The Keys in their HOME WHITES: a warm-white plate carrying the team's
// orange (owner call — the dark plate fought the cream page; white-and-orange
// is the look everyone knows from the ballpark). DEEP is the text-safe orange
// (AA on the white plate, and the fill under white text); the pure brand
// orange carries the graphic moments (pennant, stitches, watermark).
const PLATE = "#FFFCF5";
const PLATE_DEEP = "#F5EEDF";
const KEYS_ORANGE = "#DF4601";
const KEYS_ORANGE_DEEP = "#C23D00";
const INK = "#1A150E";

/** A stitched baseball — the card's mark (eyebrow glyph + corner watermark). */
function Baseball({ className, style }: { className?: string; style?: CSSProperties }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" className={className} style={style} aria-hidden>
      <circle cx="12" cy="12" r="9.2" />
      <path d="M5.2 5.6c3 2.6 3 10.2 0 12.8" stroke={KEYS_ORANGE} />
      <path d="M18.8 5.6c-3 2.6-3 10.2 0 12.8" stroke={KEYS_ORANGE} />
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

  // Per-game link via keysTicketUrl: curated ticket_url, else the row's own
  // Ticketmaster event page (feed rows carry it as source_url, never
  // ticket_url), else the official box office.
  const tickets = keysTicketUrl(event);

  return (
    <div
      className="tactile-interactive group relative h-full overflow-hidden rounded-[var(--app-radius-lg)]"
      style={{
        background: `linear-gradient(152deg, ${PLATE} 0%, ${PLATE_DEEP} 100%)`,
        color: INK,
        boxShadow: "var(--app-elev-1), inset 0 0 0 1px rgba(223,70,1,0.22)",
      }}
    >
      {/* Orange pennant rule along the top edge — the team-color signature. */}
      <span aria-hidden className="absolute inset-x-0 top-0 h-[3px]" style={{ background: `linear-gradient(90deg, ${KEYS_ORANGE} 0%, ${KEYS_ORANGE_DEEP} 100%)` }} />
      {/* Oversized baseball watermark, letterpressed off the top-right corner. */}
      <span aria-hidden className="pointer-events-none absolute -right-6 -top-4" style={{ color: INK, opacity: 0.1 }}>
        <Baseball className={compact ? "h-28 w-28" : "h-36 w-36"} />
      </span>

      <div className={compact ? "relative p-3.5" : "relative p-4"}>
        {/* Identity eyebrow — ball glyph + wordmark in gold, a red HOME tag. */}
        <div className="flex items-center gap-2">
          <Baseball className="h-4 w-4" style={{ color: KEYS_ORANGE_DEEP }} />
          <span className="font-mono text-[10px] font-bold uppercase tracking-[0.16em]" style={{ color: KEYS_ORANGE_DEEP }}>
            Frederick Keys
          </span>
          <span
            className="ml-auto shrink-0 rounded-full px-2 py-0.5 font-mono text-[9px] font-bold uppercase tracking-[0.1em]"
            style={{ background: KEYS_ORANGE_DEEP, color: "#FFFDF8" }}
          >
            Home
          </span>
        </div>

        {/* The matchup — the headline. */}
        <h3
          className={`mt-2 font-serif font-semibold leading-[1.1] tracking-tight ${compact ? "line-clamp-2 text-[18px]" : "text-[23px]"}`}
          style={{ color: INK }}
        >
          {heading}
        </h3>

        {statusText && (
          <span
            className="mt-1.5 inline-block rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.1em]"
            style={{ background: KEYS_ORANGE_DEEP, color: "#FFFDF8" }}
          >
            {statusText}
          </span>
        )}

        {/* First pitch (gold, the decision fact) + the date. */}
        <p className="mt-2.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 font-mono text-[11px] tabular-nums">
          {date.time && (
            <>
              <span className="font-bold uppercase tracking-[0.04em]" style={{ color: KEYS_ORANGE_DEEP }}>
                First pitch {date.time}
              </span>
              {/* Quietly ticking time-until — the instrument register. */}
              <LiveCountdown
                targetIso={event.starts_at}
                prefix="in"
                className="font-bold"
                style={{ color: "rgba(26,21,14,0.6)" }}
              />
            </>
          )}
          <span style={{ color: "rgba(26,21,14,0.55)" }} aria-hidden>·</span>
          <span style={{ color: "rgba(26,21,14,0.82)" }}>
            {date.weekday} {date.month} {date.day}
          </span>
        </p>

        {/* The ballpark. */}
        <p className="mt-1 truncate text-[12px] leading-snug" style={{ color: "rgba(26,21,14,0.7)" }}>
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
          style={{ borderColor: KEYS_ORANGE_DEEP, color: KEYS_ORANGE_DEEP }}
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
