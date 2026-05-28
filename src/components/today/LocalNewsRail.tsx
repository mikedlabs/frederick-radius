import { ExternalLink, Newspaper } from "lucide-react";
import { getLocalNews } from "@/lib/integrations/local-news";

/**
 * LocalNewsRail — "What's new in Frederick" surface on /now.
 *
 * Surfaces 5-6 most recent headlines across configured sources
 * (Patch, Frederick News-Post, Maryland Matters) with attribution
 * and a relative timestamp. Every card links OUT to the publisher
 * — we never store or republish body content. RSS is designed
 * for exactly this, copyright is respected by doing the minimum.
 *
 * Hides itself entirely when every source errors (returns empty).
 * No "couldn't load news" empty state — silent absence is better
 * than a broken-looking section on the daily-utility page.
 *
 * Server component. Fetches at request time, but each source is
 * cached 30 min via Next's `revalidate` so request volume stays
 * sane regardless of traffic.
 */

function relativeTime(epochMs: number): string {
  const diff = Date.now() - epochMs;
  const mins = Math.round(diff / 60_000);
  if (mins < 60) return `${Math.max(1, mins)} min ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours} hr ago`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days} day${days === 1 ? "" : "s"} ago`;
  const weeks = Math.round(days / 7);
  return `${weeks} wk ago`;
}

export default async function LocalNewsRail() {
  const items = await getLocalNews(6);
  if (items.length === 0) return null;

  return (
    <section
      aria-labelledby="local-news-heading"
      className="space-y-3"
    >
      <header className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Newspaper
            aria-hidden
            className="h-4 w-4"
            strokeWidth={2}
            style={{ color: "var(--app-ink-3)" }}
          />
          <h2
            id="local-news-heading"
            className="eyebrow"
            style={{ color: "var(--app-ink-3)" }}
          >
            What&rsquo;s new in Frederick
          </h2>
        </div>
        <p
          className="text-[10.5px]"
          style={{ color: "var(--app-ink-3)" }}
        >
          via RSS · headlines link out
        </p>
      </header>

      <ul className="space-y-1.5">
        {items.map((item) => (
          <li key={item.url}>
            <a
              href={item.url}
              target="_blank"
              rel="noopener noreferrer"
              className="hover-lift flex items-start gap-3 rounded-[var(--app-radius-md)] border bg-[var(--app-bg-elevated)] p-3 transition"
              style={{
                borderColor: "var(--app-border)",
                boxShadow:
                  "var(--app-elev-1), var(--app-edge), var(--app-hi)",
              }}
            >
              <span className="min-w-0 flex-1">
                <span
                  className="block text-[13px] font-semibold leading-snug"
                  style={{ color: "var(--app-ink)" }}
                >
                  {item.title}
                </span>
                <span
                  className="mt-1 flex flex-wrap items-center gap-x-1.5 text-[11px]"
                  style={{ color: "var(--app-ink-3)" }}
                >
                  <span className="font-semibold">{item.source.label}</span>
                  <span aria-hidden>·</span>
                  <span>{relativeTime(item.publishedAt)}</span>
                </span>
              </span>
              <ExternalLink
                aria-hidden
                className="h-3.5 w-3.5 shrink-0"
                strokeWidth={2}
                style={{ color: "var(--app-ink-3)" }}
              />
            </a>
          </li>
        ))}
      </ul>
    </section>
  );
}
