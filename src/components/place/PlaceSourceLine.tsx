import type { ReactNode } from "react";
import type { PlaceCardData } from "@/lib/loaders/places";
import SourceBadge, { sourceBadgeTier } from "@/components/place/SourceBadge";
import FreshnessChip from "@/components/ui/FreshnessChip";
import { formatChecked, formatCheckedDay, placeFreshnessEvidence } from "@/lib/trust";

/**
 * PlaceSourceLine — the one muted line of record provenance on a place page
 * and in the place sheet. It sits after the content, so the status line under
 * the title can carry the answer and its caveat without a stack of badges
 * ahead of it (November 2026 detail audit).
 *
 * In order: where the record came from (SourceBadge), the Google listing
 * match when it is not first-party hours, the listing check date
 * (last_verified_at), then the record's own "Updated on" date when it names
 * a different day. Each date says what it dates, so the two never read as
 * one fact with two answers, and no provenance is dropped.
 *
 * Attribution tied to a single fact stays with that fact and does not move
 * here: the description credit, the hours provenance inside HoursBlock, each
 * field note's own date and link, and the commerce source label.
 */
export default function PlaceSourceLine({
  place,
  children,
  className = "",
}: {
  place: PlaceCardData;
  /** Trailing items on the same line, such as the sheet's correction link. */
  children?: ReactNode;
  className?: string;
}) {
  const hasBadge = sourceBadgeTier(place) !== null;
  const googleMatch = Boolean(place.google_verified) && place.hours_source !== "first_party";
  const { listing } = placeFreshnessEvidence(place);
  const sameDay = Boolean(listing && place.updated_at
    && formatCheckedDay(listing) === formatCheckedDay(place.updated_at));
  const updated = sameDay ? null : formatChecked(place.updated_at);
  return (
    <p
      data-place-source-line
      className={`flex flex-wrap items-center gap-x-2 gap-y-1 text-xs leading-snug ${className}`}
      style={{ color: "var(--app-ink-3)" }}
    >
      {hasBadge && (
        <span className={ITEM}>
          <SourceBadge place={place} size="md" />
        </span>
      )}
      {googleMatch && <span className={ITEM}>Confirmed by Google</span>}
      {listing && (
        // FreshnessChip renders nothing before hydration; the wrapper then
        // collapses with its separator instead of leaving an orphaned dot.
        <span className={ITEM}>
          <FreshnessChip iso={listing} subject="Listing" />
        </span>
      )}
      {updated && <span className={ITEM}>{updated}</span>}
      {children ? <span className={ITEM}>{children}</span> : null}
    </p>
  );
}

/** Each item owns the separator before it, so a missing or not-yet-hydrated
 * item never leaves a dangling middle dot. The first item has none. */
const ITEM =
  "inline-flex min-w-0 items-center gap-2 empty:hidden [&:not(:first-child)]:before:content-['·']";
