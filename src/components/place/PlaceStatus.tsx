import type { OpenStatus } from "@/lib/hours";
import { formatHoursLine } from "@/lib/hours";

/**
 * PlaceStatus — one calm status line, replacing the old two-element
 * noise (OpenClosedDot's full sentence + a bordered "Unconfirmed" pill)
 * that every list row repeated hundreds of times and made the whole app
 * read as a low-trust directory.
 *
 * The principle: a card should only *speak* when it has something
 * trustworthy and useful to say. So:
 *   - verified open / closing-soon / closed → say it, with confidence
 *     ("Open until 9pm"). This is positive, actionable, worth the ink.
 *   - curated-but-unconfirmed → a quiet "Likely open", no loud pill.
 *   - no posted hours (the common case) → say NOTHING on the card.
 *     Silence is the honest signal — we make no claim — and the full
 *     "No posted hours · call ahead" basis still lives on the detail
 *     sheet where it is actionable. Printing "we don't know" 900 times
 *     is neither calm nor informative.
 *
 * Pure and presentational (no client deps) so it renders in server and
 * client components alike. Trust *basis* belongs on detail surfaces via
 * TrustChip; this is the dense-list voice of the same system.
 */

export default function PlaceStatus({
  status,
  className = "",
}: {
  status: OpenStatus;
  className?: string;
}) {
  // The common, low-information case: no claim is the honest, calm one.
  if (status.state === "unknown") return null;

  const tone =
    status.state === "open"
      ? "var(--app-positive)"
      : status.state === "closing-soon"
        ? "var(--app-warning)"
        : status.state === "unverified"
          ? "var(--app-ink-3)"
          : "var(--app-ink-3)"; // closed

  // "unverified" = curated hours we have not confirmed. Honest, quiet.
  const label =
    status.state === "unverified" ? "Likely open" : formatHoursLine(status);

  return (
    <span
      className={`inline-flex items-center gap-1.5 text-[12px] font-medium ${className}`}
      style={{ color: tone }}
    >
      <span
        aria-hidden
        className="inline-block h-1.5 w-1.5 rounded-full"
        style={{ background: tone }}
      />
      {label}
    </span>
  );
}
