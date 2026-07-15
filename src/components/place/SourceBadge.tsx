import { CheckCircle2, Users, Database, Sparkles } from "lucide-react";
import type { PlaceCardData } from "@/lib/loaders/places";

/**
 * SourceBadge — a small chip telling the user where this record
 * came from. Three audit reviewers asked for it: trust at the card
 * level. The badge says, in one glance, whether this is hand-curated
 * by Frederick Radius, came from a community feed (Downtown Frederick
 * Partnership scrape), or is a Google-verified business record.
 *
 * Compact (`size="sm"`) for cards; full (`size="md"`) for the place
 * detail header. Self-hides if there's no honest claim to make.
 */
type Tier = "curated" | "verified" | "community" | "official";

function tierFor(place: PlaceCardData): Tier | null {
  // "Curated" — places.ts seed or manual record. These are the
  // hand-picked editorial canon (wineries, the curated 50-odd
  // marquee venues). Highest confidence.
  if (place.source === "seed" || place.source === "manual") return "curated";
  // "Official source" — government / county GIS imports. The qualifier is
  // important: it describes the record's source, not this app's status.
  if (place.source === "arcgis") return "official";
  // "Confirmed" — Google says it's operational and we've enriched it
  // (rating + hours), so the basics are current. NOTE this is NOT
  // owner-maintained — do not label it "Verified" (which the Trust page
  // reserves for owner/official-maintained records). (Audit #4.)
  if (place.is_verified && place.google_verified) return "verified";
  // "Community" — DFP / scraped / discovered. Real but not curated.
  // "discovered" keeps the community badge it always rendered with; the
  // trust change lives in the provenance confidence, not the badge.
  if (place.source === "dfp" || place.source === "google" || place.source === "discovered") return "community";
  return null;
}

const META: Record<Tier, { label: string; color: string; icon: typeof CheckCircle2; tooltip: string }> = {
  // Tooltip copy answers the stranger question "what does this badge
  // actually mean?" in plain language. The badge label itself stays
  // short (chip width) but the title attribute gives the explanation
  // a hovering desktop user or a curious tap-and-hold mobile user
  // can read. Previously the title was just "Source: Curated" which
  // tells you nothing if you don't already know what curated means.
  curated:   { label: "Hand-picked", color: "var(--app-brand-press)", icon: Sparkles,    tooltip: "We picked this one ourselves." },
  verified:  { label: "Confirmed", color: "var(--app-positive)", icon: CheckCircle2,  tooltip: "Confirmed operational and current. Basics enriched from Google. Not owner-managed." },
  community: { label: "Community", color: "var(--app-cool)", icon: Users,         tooltip: "Submitted by a local or pulled from a community feed. Reliable but not directly verified." },
  official:  { label: "Official source", color: "var(--app-civic)", icon: Database, tooltip: "Imported from a government source. The source agency does not operate or endorse Frederick Radius." },
};

export default function SourceBadge({
  place,
  size = "sm",
}: {
  place: PlaceCardData;
  size?: "sm" | "md";
}) {
  const tier = tierFor(place);
  if (!tier) return null;
  const meta = META[tier];
  const Icon = meta.icon;
  const isSm = size === "sm";
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full font-semibold tracking-tight ${
        isSm
          ? "px-1.5 py-0.5 text-[10px] uppercase tracking-[0.08em]"
          : "px-2.5 py-1 text-[11px]"
      }`}
      style={{
        background: `color-mix(in srgb, ${meta.color} 14%, transparent)`,
        color: meta.color,
      }}
      title={meta.tooltip}
      aria-label={`Source: ${meta.label}`}
    >
      <Icon
        className={isSm ? "h-2.5 w-2.5" : "h-3 w-3"}
        strokeWidth={2.5}
        aria-hidden
      />
      {meta.label}
    </span>
  );
}
