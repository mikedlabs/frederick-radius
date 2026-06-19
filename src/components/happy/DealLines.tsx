import { dealClauses, emphasizeFigures } from "@/lib/happyHourDeal";

/**
 * DealLines — the one honest way to render a verified deal: each discount as its
 * OWN clause with the figure glued to what it's for, like a menu line. Replaces
 * the old "rip one figure out and headline it" treatment that stranded subjects
 * ("25% OFF" floating, "wine" lost in the body) and truncated sentences.
 *
 *   $4  craft pints
 *   25% off  crab legs
 *   $1  oysters
 *
 * The figure is emphasized in place (gold mono); the subject stays attached and
 * legible. `tone` flips the palette for photo overlays (white) vs paper (ink).
 */
export default function DealLines({
  deal,
  max = 3,
  tone = "ink",
  className = "",
}: {
  deal: string | null | undefined;
  /** Cap visible clauses; a "+N more" tail notes the rest (full deal on the place page). */
  max?: number;
  tone?: "ink" | "onPhoto";
  className?: string;
}) {
  const clauses = dealClauses(deal);
  if (clauses.length === 0) return null;

  const shown = clauses.slice(0, max);
  const overflow = clauses.length - shown.length;

  const subColor = tone === "onPhoto" ? "rgba(255,255,255,0.92)" : "var(--app-ink-2)";
  const figColor = tone === "onPhoto" ? "color-mix(in srgb, var(--app-accent) 72%, #fff)" : "var(--app-accent-press)";
  const moreColor = tone === "onPhoto" ? "rgba(255,255,255,0.66)" : "var(--app-ink-3)";

  return (
    <ul className={className} style={{ color: subColor }}>
      {shown.map((clause, i) => (
        <li key={i} className="flex gap-1.5 leading-snug">
          <span aria-hidden className="select-none" style={{ color: figColor, opacity: 0.7 }}>
            ·
          </span>
          <span className="min-w-0">
            {emphasizeFigures(clause).map((part, j) =>
              part.figure ? (
                <span key={j} className="font-mono font-bold tabular-nums" style={{ color: figColor }}>
                  {part.text}
                </span>
              ) : (
                <span key={j}>{part.text}</span>
              ),
            )}
          </span>
        </li>
      ))}
      {overflow > 0 && (
        <li className="font-mono text-[0.85em] uppercase tracking-[0.06em]" style={{ color: moreColor }}>
          +{overflow} more
        </li>
      )}
    </ul>
  );
}
