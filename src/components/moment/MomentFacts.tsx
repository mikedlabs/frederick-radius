import type { MomentSpotlightFact } from "@/data/civic-moments";
import { sourceHost, sourcedMomentFacts } from "./momentGuide";

/**
 * MomentFacts sets a moment's decision facts as 2-up tiles on Cream. Each
 * tile is a sentence-case label, the value in title type (wrapped, never
 * truncated), and the site that published it. A fact without a source is
 * not shown at all, so a tile can never state something nobody published.
 */
export default function MomentFacts({
  facts,
}: {
  facts: readonly MomentSpotlightFact[] | undefined;
}) {
  const shown = sourcedMomentFacts(facts);
  if (shown.length === 0) return null;
  return (
    <dl className="grid grid-cols-2 gap-2" data-moment-facts>
      {shown.map((fact) => (
        <div
          key={fact.label}
          data-moment-fact={fact.label}
          className="flex min-w-0 flex-col rounded-[var(--app-radius-md)] border p-3"
          style={{ borderColor: "var(--app-border)" }}
        >
          <dt className="text-meta-lg" style={{ color: "var(--app-ink-3)" }}>
            {fact.label}
          </dt>
          <dd
            className="text-title mt-1 [overflow-wrap:anywhere]"
            style={{ color: "var(--app-ink)" }}
          >
            {fact.value}
          </dd>
          <dd className="mt-auto pt-2">
            <a
              href={fact.source_url}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={`Source for ${fact.label.toLowerCase()}: ${sourceHost(fact.source_url)}`}
              className="tap-44 inline-block text-caption underline underline-offset-2"
              style={{ color: "var(--app-ink-3)" }}
            >
              {sourceHost(fact.source_url)}
            </a>
          </dd>
        </div>
      ))}
    </dl>
  );
}
