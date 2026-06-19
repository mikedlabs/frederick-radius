import { dealClauses, emphasizeFigures } from "@/lib/happyHourDeal";

/**
 * DealLines — the one honest way to render a verified deal: each discount as its
 * OWN clause with the figure glued to what it's for, like a menu line. Replaces
 * the old "rip one figure out and headline it" treatment that stranded subjects
 * ("25% OFF" floating, "wine" lost in the body) and truncated sentences.
 *
 *   $4 craft pints
 *   25% off crab legs
 *   $1 oysters
 *
 * Hierarchy comes from the gold mono figure + serif name above, NOT a bullet —
 * so there is no leading symbol and no "+N more" truncation tail (a deal links
 * to its full place page). `tone` flips the palette for photo overlays.
 *
 * `vague` is for the figureless-at-source entries (the venue only says "food
 * and drink specials"): we render their real text as ONE muted, italic line so
 * they read as a visibly lower-confidence class than the gold-figure deals,
 * never dressed up as a concrete discount.
 */
export default function DealLines({
  deal,
  max = 3,
  tone = "ink",
  vague = false,
  className = "",
}: {
  deal: string | null | undefined;
  /** Cap visible clauses (the full deal lives on the place page). */
  max?: number;
  tone?: "ink" | "onPhoto";
  /** The deal names no figure — render as one muted "specials vary" line. */
  vague?: boolean;
  className?: string;
}) {
  const clauses = dealClauses(deal);
  if (clauses.length === 0) return null;

  const subColor = tone === "onPhoto" ? "rgba(255,255,255,0.92)" : "var(--app-ink-2)";
  const figColor = tone === "onPhoto" ? "color-mix(in srgb, var(--app-accent) 72%, #fff)" : "var(--app-accent-press)";
  const vagueColor = tone === "onPhoto" ? "rgba(255,255,255,0.78)" : "var(--app-ink-3)";

  // Figureless at source: one honest, visibly-muted line, never gold figures.
  if (vague) {
    return (
      <p className={`italic leading-snug ${className}`} style={{ color: vagueColor }}>
        {clauses.join(" · ")}
      </p>
    );
  }

  return (
    <ul className={className} style={{ color: subColor }}>
      {clauses.slice(0, max).map((clause, i) => (
        <li key={i} className="leading-snug">
          {emphasizeFigures(clause).map((part, j) =>
            part.figure ? (
              <span key={j} className="font-mono font-bold tabular-nums" style={{ color: figColor }}>
                {part.text}
              </span>
            ) : (
              <span key={j}>{part.text}</span>
            ),
          )}
        </li>
      ))}
    </ul>
  );
}
