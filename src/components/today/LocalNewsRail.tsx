import { ArrowUpRight, Newspaper } from "lucide-react";
import { getLocalNews } from "@/lib/integrations/local-news";

/**
 * LocalNewsRail — "What's new in Frederick" surface on /today.
 *
 * v2 layout: one bordered container with hairline dividers between
 * items, source rendered as a small colored chip using each source's
 * brand-token accent. The earlier "6 separate cards" treatment
 * read as a stack of clickable buttons; this reads as one curated
 * section the way a newspaper sidebar would.
 *
 * Every item links OUT to the publisher — we never store or
 * republish body content. RSS is designed for exactly this; the
 * minimum is the morally clean answer.
 *
 * Hides itself entirely when every source errors. No "couldn't load
 * news" placeholder — silent absence beats a broken-looking section.
 *
 * Server component. Each source is cached 30 min via Next's
 * `revalidate` so request volume stays sane regardless of traffic.
 */

function relativeTime(epochMs: number): string {
  const diff = Date.now() - epochMs;
  const mins = Math.round(diff / 60_000);
  if (mins < 60) return `${Math.max(1, mins)} min ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days}d ago`;
  const weeks = Math.round(days / 7);
  return `${weeks}w ago`;
}

export default async function LocalNewsRail() {
  const items = await getLocalNews(6);
  if (items.length === 0) return null;

  return (
    <section
      aria-labelledby="local-news-heading"
      className="space-y-2"
    >
      <header className="flex items-baseline gap-2">
        <Newspaper
          aria-hidden
          className="h-3.5 w-3.5 translate-y-px"
          strokeWidth={2.25}
          style={{ color: "var(--app-ink-3)" }}
        />
        <h2
          id="local-news-heading"
          className="eyebrow"
          style={{ color: "var(--app-ink-3)" }}
        >
          What&rsquo;s new in Frederick
        </h2>
      </header>

      <ol
        className="overflow-hidden rounded-[var(--app-radius-lg)] border bg-[var(--app-bg-elevated)]"
        style={{
          borderColor: "var(--app-border)",
          boxShadow: "var(--app-elev-1), var(--app-edge), var(--app-hi)",
        }}
      >
        {items.map((item, i) => (
          <li
            key={item.url}
            className="border-t first:border-t-0"
            style={{ borderColor: "var(--app-border)" }}
          >
            <a
              href={item.url}
              target="_blank"
              rel="noopener noreferrer"
              className="group flex items-start gap-3 px-3.5 py-3 transition-colors hover:bg-[var(--app-bg-sunken)]"
            >
              {/* Source chip — small color-toned pill that anchors
                  each item visually so the eye can scan by publisher.
                  Uses the source's brand-token accent at low opacity
                  on background + full saturation on the dot, so the
                  chip is legible against paper-cream without
                  shouting. */}
              <span
                aria-hidden
                className="mt-0.5 inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5"
                style={{
                  background: `color-mix(in srgb, ${item.source.accent} 10%, transparent)`,
                  color: item.source.accent,
                }}
              >
                <span
                  className="inline-block h-1.5 w-1.5 rounded-full"
                  style={{ background: item.source.accent }}
                />
                <span className="text-[9.5px] font-bold uppercase tracking-[0.1em]">
                  {item.source.label}
                </span>
              </span>

              <span className="min-w-0 flex-1">
                <span
                  className="block text-[13.5px] font-medium leading-snug"
                  style={{ color: "var(--app-ink)" }}
                >
                  {item.title}
                </span>
                <span
                  className="mt-1 block text-[10.5px]"
                  style={{ color: "var(--app-ink-3)" }}
                >
                  {relativeTime(item.publishedAt)}
                </span>
              </span>

              <ArrowUpRight
                aria-hidden
                className="mt-0.5 h-3.5 w-3.5 shrink-0 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5"
                strokeWidth={2}
                style={{ color: "var(--app-ink-3)" }}
              />
            </a>
            {/* Hidden index marker so screen-readers / search engines
                see the ordinal — visually we let the divider line do
                the same job at less visual noise. */}
            <span className="sr-only">Item {i + 1} of {items.length}</span>
          </li>
        ))}
      </ol>

      <p
        className="px-1 text-[10px]"
        style={{ color: "var(--app-ink-3)" }}
      >
        Headlines via RSS · each link opens the publisher&rsquo;s site
      </p>
    </section>
  );
}
