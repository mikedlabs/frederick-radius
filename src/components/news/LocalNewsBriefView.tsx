import { ChevronRight, ExternalLink } from "lucide-react";
import Link from "next/link";
import type { NewsHeadlinesResult } from "@/lib/integrations/news";
import type { CivicPressItem } from "@/lib/integrations/civic-press";
import styles from "./LocalNewsBrief.module.css";

export type OfficialNewsResult = {
  items: CivicPressItem[];
  status: NewsHeadlinesResult["status"];
};

export type LocalNewsBriefViewProps = {
  news: NewsHeadlinesResult;
  official: OfficialNewsResult;
  /** Pulse keeps its existing six-story reading; Today stays compact. */
  headlineLimit?: number;
  showHeading?: boolean;
};

function publication(value: string | null) {
  if (!value?.trim()) return null;
  const date = new Date(value);
  // The civic adapter's legacy zero timestamp means its pubDate was absent.
  if (!Number.isFinite(date.getTime()) || date.getTime() === 0) return null;
  return {
    dateTime: date.toISOString(),
    label: new Intl.DateTimeFormat("en-US", {
      timeZone: "America/New_York", month: "short", day: "numeric", year: "numeric",
      hour: "numeric", minute: "2-digit", timeZoneName: "short",
    }).format(date),
  };
}

function Publication({ value }: { value: string | null }) {
  const date = publication(value);
  return date
    ? <time dateTime={date.dateTime}>Published {date.label}</time>
    : <span>Publication date unavailable</span>;
}

function NewsLink({ title, source, url, publishedAt, lead = false }: {
  title: string; source: string; url: string; publishedAt: string | null; lead?: boolean;
}) {
  return (
    <a className={styles.story} href={url} target="_blank" rel="noopener noreferrer">
      <span className={styles.storyText}>
        <span className={lead ? styles.lead : styles.title}>{title}</span>
        <span className={styles.byline}>
          <span className={styles.publisher}>{source}</span>
          <Publication value={publishedAt} />
        </span>
      </span>
      <ExternalLink aria-hidden="true" className={styles.outlink} strokeWidth={1.8} />
    </a>
  );
}

export function LocalNewsLoading() {
  return (
    <section aria-label="Local news" aria-busy="true" className={styles.brief}>
      <h2 className={styles.heading}>Local news</h2>
      <p className={styles.note}>Local headlines are loading.</p>
    </section>
  );
}

/** A source-led reading. This view does not fetch, infer dates, or summarize articles. */
export default function LocalNewsBriefView({
  news, official, headlineLimit = 3, showHeading = true,
}: LocalNewsBriefViewProps) {
  const headlines = news.items.slice(0, headlineLimit);
  const updates = official.items.filter((item) => item.lane === "civic").slice(0, 2);
  return (
    <section aria-label="Local news" data-news-state={news.status} className={styles.brief}>
      {showHeading && (
        <header className={styles.header}>
          <h2 className={styles.heading}>Local news</h2>
          <Link href="/pulse?open=news" prefetch={false} className={styles.more}>
            All headlines <ChevronRight aria-hidden="true" size={14} />
          </Link>
        </header>
      )}
      <p className={styles.source}>Headlines via Google News</p>
      {news.status !== "available" && (
        <p className={styles.note}>
          {news.status === "unavailable"
            ? "Local headlines are unavailable right now."
            : headlines.length > 0
              ? "Some local headline feeds are unavailable. Available stories are shown below."
              : "Some local headline feeds are unavailable. No headlines were returned by the feeds that responded."}
        </p>
      )}
      {headlines.length > 0 ? (
        <ol className={styles.stories}>
          {headlines.map((item, index) => (
            <li key={item.url}>
              <NewsLink title={item.title} source={item.source} url={item.url}
                publishedAt={item.published_at} lead={index === 0} />
            </li>
          ))}
        </ol>
      ) : news.status === "available" ? (
        <p className={styles.note}>No local headlines were returned by these feeds.</p>
      ) : null}
      <details className={styles.official}>
        <summary className={styles.summary}>
          <span>Official updates</span>
          <span className={styles.summaryDetail}>
            {official.status === "unavailable" ? "Unavailable"
              : official.status === "partial" ? "Partial" : "City & county"}
          </span>
        </summary>
        {official.status !== "available" && (
          <p className={styles.note}>
            {official.status === "unavailable"
              ? "Official city and county updates are unavailable right now."
              : updates.length > 0
                ? "Some official newsroom feeds are unavailable. Available updates are shown below."
                : "Some official newsroom feeds are unavailable. No civic updates were returned by the newsrooms that responded."}
          </p>
        )}
        {updates.length > 0 ? (
          <ul className={styles.stories}>
            {updates.map((item) => (
              <li key={item.url}>
                <NewsLink title={item.title} source={item.source} url={item.url} publishedAt={item.publishedAt} />
              </li>
            ))}
          </ul>
        ) : official.status === "available" ? (
          <p className={styles.note}>No civic updates were returned by these newsrooms.</p>
        ) : null}
      </details>
    </section>
  );
}
