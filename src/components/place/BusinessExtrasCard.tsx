import { ExternalLink } from "lucide-react";
import type { BusinessInfo } from "@/lib/loaders/businessInfo";
import { freshnessLabel } from "@/lib/loaders/businessInfo";
import PlaceSectionLabel, { PLACE_SECTION_LABEL_CLASS } from "./PlaceSectionLabel";

/**
 * BusinessExtrasCard: the buried-info moat, made visible.
 *
 * Surfaces what the business-info agent (ingest-business-info.ts) pulled
 * from a place's OWN website that Google's listing doesn't carry: happy
 * hour, recurring specials, and one notable detail. Complements
 * KnownForCard (which is review-derived "what people say"). This is
 * "straight from the source," so it carries an explicit attribution and
 * freshness line ("via theirsite.com · updated 2w ago").
 *
 * It is a ruled section on the page ground, not a box: a 13px label over
 * each fact, with the page drawing the one hairline between sections.
 *
 * Renders nothing until the agent has data for this place (it's empty
 * until ANTHROPIC_API_KEY is set and the cron runs), so the place page
 * is unaffected in the meantime.
 */
export default function BusinessExtrasCard({ info }: { info: BusinessInfo | null }) {
  if (!info) return null;
  const knownFor = info.known_for?.trim();
  const happy = info.happy_hour?.trim();
  const specials = (info.specials ?? []).filter(Boolean);
  const notable = info.notable?.trim();
  if (!knownFor && !happy && specials.length === 0 && !notable) return null;
  // A commerce-only refresh record intentionally has no prose source. It can
  // still power Menu/Order actions, but it must never render a sourced-facts
  // card without a source for those facts.
  if (!info.source) return null;
  const source = info.source;

  const host = (() => {
    try {
      return new URL(source.url).hostname.replace(/^www\./, "");
    } catch {
      return "their site";
    }
  })();
  const fresh = freshnessLabel(source.fetchedAt);

  return (
    <section aria-labelledby="extras-heading" className="space-y-3">
      <PlaceSectionLabel as="h3" id="extras-heading">
        Good to know
      </PlaceSectionLabel>

      <dl className="space-y-3">
        {/* What they're known for, straight from their own site, is the most
            on-point answer to "what do they offer?" It leads the section. */}
        {knownFor && <Row label="Known for" value={knownFor} />}
        {happy && <Row label="Happy hour" value={happy} />}
        {specials.length > 0 && <Row label="Specials" value={specials.join(" · ")} />}
        {notable && <Row label="Notable" value={notable} />}
      </dl>

      <a
        href={source.url}
        target="_blank"
        rel="noopener noreferrer"
        className="tap-44-y inline-flex items-center gap-1 text-[13px] underline-offset-2 hover:underline"
        style={{ color: "var(--app-ink-2)" }}
      >
        via {host}
        {fresh ? ` · ${fresh}` : ""}
        <ExternalLink className="h-3 w-3" strokeWidth={2} aria-hidden />
      </a>
    </section>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className={PLACE_SECTION_LABEL_CLASS} style={{ color: "var(--app-ink-3)" }}>
        {label}
      </dt>
      <dd className="mt-0.5 text-[15px] leading-snug" style={{ color: "var(--app-ink)" }}>
        {value}
      </dd>
    </div>
  );
}
