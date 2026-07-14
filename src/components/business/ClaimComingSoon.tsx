/**
 * ClaimComingSoon — the business-claim affordance as a designed promise.
 *
 * The claim -> manage -> post -> push backend exists, but switching it on
 * for owners is a deferred owner decision. Until then every "claim this
 * business" entry reads as a calm coming-soon promise rather than a live
 * link or a broken form. It borrows the exact register of the Saved
 * wallet's "PTS · soon" gold slot and the disabled "Notify · soon" bell:
 * a quiet line that completes with a gold mono "soon" tag — a promise,
 * never a dead end.
 *
 * Non-interactive by design; ordinary text exposes the same complete promise
 * to visual and screen-reader users.
 */
export default function ClaimComingSoon({
  lead = "Own this business?",
}: {
  /** The opening question, matched to the surrounding voice. */
  lead?: string;
}) {
  return (
    <span className="inline-flex items-center gap-1.5" style={{ color: "var(--app-ink-3)" }}>
      <span>{lead} Claiming is coming</span>
      <span
        style={{
          fontFamily: "var(--font-mono, monospace)",
          fontSize: "8.5px",
          fontWeight: 700,
          letterSpacing: "0.12em",
          textTransform: "uppercase",
          color: "var(--app-accent-press)",
          border:
            "1px solid color-mix(in srgb, var(--app-accent) 45%, transparent)",
          borderRadius: "4px",
          padding: "1px 4px",
        }}
      >
        soon
      </span>
      <span className="sr-only">.</span>
    </span>
  );
}
