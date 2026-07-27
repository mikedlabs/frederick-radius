import type { Metadata } from "next";
import Link from "next/link";
import { Croissant, ExternalLink, Clock } from "lucide-react";
import { brunchSpots, type BrunchSpot } from "@/lib/loaders/brunch";
import PageBloom from "@/components/ui/PageBloom";
import FieldStamp from "@/components/ui/FieldStamp";
import CollapsibleSection from "@/components/ui/CollapsibleSection";
import { PlaceMedallion } from "@/components/place/PlaceMedallion";
import { clientPlaceBySlug } from "@/lib/loaders/places-client";

export const metadata: Metadata = {
  alternates: { canonical: "/brunch" },
  title: "Brunch in Frederick County",
  description:
    "Where to get brunch around Frederick County: a source-checked list of spots with a real weekend brunch, with days and hours.",
};

export const revalidate = 3600;

function BrunchIdentity({ spot }: { spot: BrunchSpot }) {
  const place = spot.slug ? clientPlaceBySlug(spot.slug) : undefined;
  if (place) return <PlaceMedallion place={place} size={44} />;

  return (
    <span
      aria-hidden
      data-place-media="fallback"
      className="grid h-11 w-11 shrink-0 place-items-center rounded-[var(--app-radius-sm)]"
      style={{
        color: "var(--app-accent-press)",
        background:
          "color-mix(in srgb, var(--app-accent) 12%, var(--app-bg-elevated-solid))",
        boxShadow:
          "inset 0 0 0 1px color-mix(in srgb, var(--app-accent) 20%, transparent), var(--app-edge)",
      }}
    >
      <Croissant className="h-5 w-5" strokeWidth={1.9} />
    </span>
  );
}

/**
 * /brunch — the verified brunch layer of the Field Notes moat. Every spot is
 * agent-researched and confirmed at the VENUE'S OWN source (a real brunch
 * service + days/hours), grouped by town. Links to the place page when the
 * venue is in the directory. A wrong brunch is worse than none.
 */
export default function BrunchPage() {
  const spots = brunchSpots();
  const byTown = spots.reduce<Record<string, BrunchSpot[]>>((acc, s) => {
    (acc[s.town] ??= []).push(s);
    return acc;
  }, {});
  const towns = Object.keys(byTown).sort((a, b) => byTown[b].length - byTown[a].length || a.localeCompare(b));

  return (
    <div className="relative space-y-5">
      <PageBloom variant="warm-cool" />

      <header className="pt-0.5">
        <div aria-hidden className="h-px" style={{ background: "linear-gradient(90deg, transparent, var(--app-border) 14%, var(--app-border) 86%, transparent)" }} />
        <div className="flex items-center justify-between py-2.5">
          <span className="font-mono text-[10px] uppercase tracking-[0.2em]" style={{ color: "var(--app-ink-2)" }}>Frederick County</span>
          <span className="font-mono text-[10.5px] tabular-nums tracking-[0.06em]" style={{ color: "var(--app-ink-2)" }}>
            {spots.length} spot{spots.length === 1 ? "" : "s"}
          </span>
        </div>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="flex items-center gap-2.5 font-serif text-[30px] font-semibold leading-[0.98] tracking-[-0.02em]" style={{ color: "var(--app-ink)" }}>
              <Croissant className="h-7 w-7 shrink-0" strokeWidth={1.75} style={{ color: "var(--app-accent)" }} aria-hidden />
              Brunch
            </h1>
            <p className="mt-2 max-w-prose text-[13px] leading-snug" style={{ color: "var(--app-ink-3)" }}>
              Every spot in the county with a real brunch, checked at the source.
              We use the venue&rsquo;s own menu, not a directory listing.
            </p>
            <div aria-hidden className="mt-2.5 h-[3px] w-[42px] rounded-full" style={{ background: "var(--app-accent)" }} />
          </div>
          <FieldStamp id="brunch" top="CHECKED AT SOURCE" bottom="FIELD NOTES" size={80} className="mt-0.5" />
        </div>
      </header>

      {spots.length === 0 ? (
        <p className="rounded-[var(--app-radius-md)] border border-dashed px-4 py-10 text-center text-[13px]" style={{ borderColor: "var(--app-border)", color: "var(--app-ink-3)" }}>
          No brunch spots are on file. Do you know one? <Link href="/submit/place" className="font-semibold underline">Tell us.</Link>
        </p>
      ) : (
        <div className="space-y-6">
          {towns.map((town, index) => (
            <CollapsibleSection
              key={town}
              title={town}
              count={byTown[town].length}
              countLabel={byTown[town].length === 1 ? "spot" : "spots"}
              headingLevel={2}
              storageKey={`fr.brunch.${town.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`}
              defaultOpen={index === 0}
            >
              <ul className="space-y-2">
                {byTown[town].map((s) => {
                  const Title = (
                    <span className="font-serif text-[16px] font-semibold leading-tight tracking-tight" style={{ color: "var(--app-ink)" }}>
                      {s.name}
                    </span>
                  );
                  return (
                    <li
                      key={`${s.name}-${s.town}`}
                      className="rounded-[var(--app-radius-md)] border bg-[var(--app-bg-elevated)] p-3.5"
                      style={{ borderColor: "var(--app-border)" }}
                    >
                      <div className="flex items-start gap-3">
                        <BrunchIdentity spot={s} />
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1">
                            {s.slug ? (
                              <Link href={`/places/${s.slug}`} className="tap-44-y inline-flex min-w-0 flex-1 hover:underline">{Title}</Link>
                            ) : (
                              Title
                            )}
                            {s.confidence === "high" && (
                              <span
                                className="max-w-full shrink-0 rounded-full px-2 py-0.5 font-mono text-[9.5px] font-bold uppercase tracking-[0.1em]"
                                style={{ background: "color-mix(in srgb, var(--app-positive) 14%, transparent)", color: "var(--app-positive)" }}
                              >
                                Checked at source
                              </span>
                            )}
                          </div>
                          <p className="mt-1.5 flex items-center gap-1.5 font-mono text-[12px] tabular-nums" style={{ color: "var(--app-ink-2)" }}>
                            <Clock className="h-3 w-3 shrink-0" strokeWidth={2} aria-hidden style={{ color: "var(--app-accent)" }} />
                            {s.days} · {s.hours}
                          </p>
                          {s.note && (
                            <p className="mt-1 text-[12.5px] leading-snug" style={{ color: "var(--app-ink-3)" }}>{s.note}</p>
                          )}
                          <a
                            href={s.sourceUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            aria-label={`Open the brunch source for ${s.name}`}
                            className="tap-44-y mt-2 inline-flex items-center gap-1 text-[11px]"
                            style={{ color: "var(--app-ink-3)" }}
                          >
                            Source
                            <ExternalLink className="h-3 w-3" strokeWidth={2} aria-hidden />
                          </a>
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </CollapsibleSection>
          ))}
        </div>
      )}

      <p className="px-1 text-[11px] leading-relaxed" style={{ color: "var(--app-ink-3)" }}>
        Hours change. Each spot links to its source so you can double-check before you go. Spot something wrong?{" "}
        <Link href="/submit/event" className="underline" style={{ color: "var(--app-cool)" }}>Tell us</Link>.
      </p>
    </div>
  );
}
