import { Clock3, Tag, Sparkles, Award, ExternalLink } from "lucide-react";
import type { BusinessInfo } from "@/lib/loaders/businessInfo";
import { freshnessLabel } from "@/lib/loaders/businessInfo";

/**
 * BusinessExtrasCard — the buried-info moat, made visible.
 *
 * Surfaces what the business-info agent (ingest-business-info.ts) pulled
 * from a place's OWN website that Google's listing doesn't carry: happy
 * hour, recurring specials, and one notable detail. Complements
 * KnownForCard (which is review-derived "what people say") — this is
 * "straight from the source," so it carries an explicit attribution +
 * freshness line ("via theirsite.com · updated 2w ago").
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
    <section
      aria-labelledby="extras-heading"
      className="rounded-[var(--app-radius-lg)] border bg-[var(--app-bg-elevated)] p-4"
      style={{ borderColor: "var(--app-border)" }}
    >
      <h3
        id="extras-heading"
        className="text-[11px] font-bold uppercase tracking-[0.12em]"
        style={{ color: "var(--app-ink-3)" }}
      >
        Good to know
      </h3>

      <dl className="mt-3 space-y-2.5">
        {/* What they're known for, straight from their own site — the most
            on-point answer to "what do they offer?" Leads the card. */}
        {knownFor && (
          <Row
            icon={<Award className="h-3.5 w-3.5" strokeWidth={2.25} aria-hidden style={{ color: "var(--app-brand-press)" }} />}
            label="Known for"
            value={knownFor}
          />
        )}
        {happy && (
          <Row
            icon={<Clock3 className="h-3.5 w-3.5" strokeWidth={2.25} aria-hidden style={{ color: "var(--app-positive)" }} />}
            label="Happy hour"
            value={happy}
          />
        )}
        {specials.length > 0 && (
          <Row
            icon={<Tag className="h-3.5 w-3.5" strokeWidth={2.25} aria-hidden style={{ color: "var(--app-cool)" }} />}
            label="Specials"
            value={specials.join(" · ")}
          />
        )}
        {notable && (
          <Row
            icon={<Sparkles className="h-3.5 w-3.5" strokeWidth={2.25} aria-hidden style={{ color: "var(--app-accent-press)" }} />}
            label="Notable"
            value={notable}
          />
        )}
      </dl>

      <a
        href={source.url}
        target="_blank"
        rel="noopener noreferrer"
        className="tap-44-y mt-3 inline-flex items-center gap-1 text-[11px]"
        style={{ color: "var(--app-ink-3)" }}
      >
        via {host}
        {fresh ? ` · ${fresh}` : ""}
        <ExternalLink className="h-3 w-3" strokeWidth={2} aria-hidden />
      </a>
    </section>
  );
}

function Row({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt
        className="flex items-start gap-2.5 text-[11px] font-semibold uppercase tracking-[0.08em]"
        style={{ color: "var(--app-ink-3)" }}
      >
        <span className="mt-0.5 shrink-0">{icon}</span>
        <span>{label}</span>
      </dt>
      <dd
        className="ml-6 text-[13px] leading-snug"
        style={{ color: "var(--app-ink)" }}
      >
        {value}
      </dd>
    </div>
  );
}
