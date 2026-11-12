import { CheckCircle2, Users, Database, NotebookPen } from "lucide-react";
import type { PlaceCardData } from "@/lib/loaders/places";

/**
 * SourceBadge — a small chip telling the user where this record
 * came from. Three audit reviewers asked for it: trust at the card
 * level. The badge says, in one glance, whether this is hand-curated
 * by Frederick Radius, came from a community feed (Downtown Frederick
 * Partnership scrape), or is a Google-verified business record.
 *
 * Compact (`size="sm"`) is a small tinted capsule for cards and the place
 * sheet. Full (`size="md"`) is a glyph and plain text for the place detail
 * header. Self-hides if there's no honest claim to make.
 */
export type SourceBadgeTier = "reviewed" | "checked" | "community" | "official";

export function sourceBadgeTier(place: Pick<PlaceCardData, "source" | "is_verified" | "google_verified">): SourceBadgeTier | null {
  // A seed/manual record was selected or edited in Radius. That does not mean
  // every current business fact was independently hand-verified.
  if (place.source === "seed" || place.source === "manual") return "reviewed";
  // "Official source" — government / county GIS imports. The qualifier is
  // important: it describes the record's source, not this app's status.
  if (place.source === "arcgis" || place.source === "fc-gis") return "official";
  // A source match/check is explicitly weaker than an approved owner claim.
  if (place.is_verified && place.google_verified) return "checked";
  // "Community" — DFP / scraped / discovered. Real but not curated.
  // "discovered" keeps the community badge it always rendered with; the
  // trust change lives in the provenance confidence, not the badge.
  if (place.source === "dfp" || place.source === "google" || place.source === "discovered") return "community";
  return null;
}

export const SOURCE_BADGE_META: Record<SourceBadgeTier, { label: string; color: string; icon: typeof CheckCircle2; explanation: string }> = {
  // The visible labels make the claim legible without hover. Each explanation
  // is also included as screen-reader text instead of relying on `title`.
  //
  // Colors are the text-role tokens, because every use here is a label or a
  // glyph: they equal the brand and semantic fills on the light shell and lift
  // to a readable foreground in the dark appearance. Forest shares its value
  // with --app-positive, and Creek with --app-civic.
  //
  // "Reviewed" means a person at Radius selected or edited the record, so it
  // takes the field-note glyph. It must not take a check (the stronger
  // "checked" tier owns that claim) or a sparkle (that reads as generated).
  reviewed:  { label: "Radius reviewed", color: "var(--app-link)", icon: NotebookPen, explanation: "Selected or edited by Frederick Radius; current details can still change." },
  checked:   { label: "Checked at source", color: "var(--app-forest-text)", icon: CheckCircle2, explanation: "Basic details were checked against a source. This is not owner verification." },
  community: { label: "Community source", color: "var(--app-cool-text)", icon: Users, explanation: "Submitted by a local or assembled from a community or mapping source; check important details." },
  official:  { label: "Official source", color: "var(--app-cool-text)", icon: Database, explanation: "Imported from a government source. The source agency does not operate or endorse Frederick Radius." },
};

export function sourceBadgeMeta(
  place: Pick<PlaceCardData, "source" | "is_verified" | "google_verified">,
) {
  const tier = sourceBadgeTier(place);
  return tier ? { tier, ...SOURCE_BADGE_META[tier] } : null;
}

export default function SourceBadge({
  place,
  size = "sm",
}: {
  place: PlaceCardData;
  size?: "sm" | "md";
}) {
  const meta = sourceBadgeMeta(place);
  if (!meta) return null;
  const Icon = meta.icon;
  // Detail header: a plain fact in the decision row beside the open state and
  // price. The glyph carries the tier color and the words stay ink, so the
  // row holds one colored action (Save) and not a second tinted capsule.
  if (size === "md") {
    return (
      <span
        className="inline-flex items-center gap-1 text-xs font-medium"
        style={{ color: "var(--app-ink-2)" }}
      >
        <Icon
          className="h-3.5 w-3.5 shrink-0"
          strokeWidth={2.25}
          style={{ color: meta.color }}
          aria-hidden
        />
        {meta.label}
        <span className="sr-only">. {meta.explanation}</span>
      </span>
    );
  }
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em]"
      style={{
        background: `color-mix(in srgb, ${meta.color} 14%, transparent)`,
        color: meta.color,
      }}
    >
      <Icon className="h-2.5 w-2.5" strokeWidth={2.5} aria-hidden />
      {meta.label}
      <span className="sr-only">. {meta.explanation}</span>
    </span>
  );
}
