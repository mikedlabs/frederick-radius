import { ChevronRight, ExternalLink, Newspaper } from "lucide-react";
import Link from "next/link";
import type { NewsHeadlinesResult } from "@/lib/integrations/news";
import type { OfficialCivicNewsResult } from "@/lib/integrations/civic-press";
import { CIVIC_PRESS_SOURCES, type CivicPressSource } from "@/data/civic-press-sources";
import { newsArticleUrl } from "@/lib/news-article-url";
import { officialNewsSelection } from "./official-news-selection";
import styles from "./LocalNewsBrief.module.css";

export type OfficialNewsResult = OfficialCivicNewsResult;

export type LocalNewsBriefViewProps = {
  news: NewsHeadlinesResult;
  official: OfficialNewsResult;
  /** Pulse keeps its existing six-story reading; Today stays compact. */
  headlineLimit?: number;
  showHeading?: boolean;
  officialLimit?: number;
};

const publicationFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/New_York", month: "short", day: "numeric", year: "numeric",
  hour: "numeric", minute: "2-digit", timeZoneName: "short",
});
const clockFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/New_York", hour: "numeric", minute: "2-digit", timeZoneName: "short",
});

function publication(value: string | null) {
  if (!value?.trim()) return null;
  const date = new Date(value);
  // The civic adapter's legacy zero timestamp means its pubDate was absent.
  if (!Number.isFinite(date.getTime()) || date.getTime() === 0) return null;
  const parts = publicationFormatter.formatToParts(date);
  return {
    dateTime: date.toISOString(),
    label: publicationFormatter.format(date),
    month: parts.find((part) => part.type === "month")?.value,
    day: parts.find((part) => part.type === "day")?.value,
    year: parts.find((part) => part.type === "year")?.value,
    clock: clockFormatter.format(date),
  };
}

function NewsLink({ title, source, url, publishedAt, sourceId, lead = false, showDateline = false }: {
  title: string; source: string; url: string; publishedAt: string | null;
  sourceId?: CivicPressSource["id"]; lead?: boolean; showDateline?: boolean;
}) {
  const subscription = CIVIC_PRESS_SOURCES.find((feed) => feed.id === sourceId);
  const href = newsArticleUrl(url);
  const date = publication(publishedAt);
  const content = (
    <>
      {showDateline && <span className={styles.dateMark} data-publication-dateline="" aria-hidden="true">
        {date ? <>
          <span>{date.month}</span>
          <strong>{date.day}</strong>
          <span>{date.year}</span>
        </> : <Newspaper size={24} />}
      </span>}
      <span className={styles.storyText}>
        <span className={styles.publisher}>{source}</span>
        <span className={lead ? styles.lead : styles.title}>{title}</span>
        <span className={styles.byline}>
          {subscription && <span>{subscription.label}</span>}
          {date ? <time dateTime={date.dateTime}>
            {showDateline ? <>
              <span className="sr-only">Published {date.label}</span>
              <span aria-hidden="true">{date.clock}</span>
            </> : <>Published {date.label}</>}
          </time> : <span>Publication date unavailable</span>}
          {!href && <span>Article link unavailable</span>}
        </span>
      </span>
    </>
  );
  return href ? (
    <a className={styles.story} data-news-source-id={sourceId} href={href} target="_blank" rel="noopener noreferrer">
      {content}
      <ExternalLink aria-hidden="true" className={styles.outlink} strokeWidth={1.8} />
    </a>
  ) : <div className={styles.story}>{content}</div>;
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
  news, official, headlineLimit = 3, showHeading = true, officialLimit = 2,
}: LocalNewsBriefViewProps) {
  const headlines = news.items.slice(0, headlineLimit);
  const updates = officialNewsSelection(official, officialLimit);
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
      <div className={styles.columns} data-news-columns={showHeading || undefined}>
        <div className={styles.headlines}>
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
                    publishedAt={item.published_at} lead={index === 0} showDateline={showHeading} />
                </li>
              ))}
            </ol>
          ) : news.status === "available" ? (
            // The loader keeps only the past week (NEWS_MAX_AGE_DAYS), so an
            // empty healthy read means the week was quiet, not that a feed failed.
            <p className={styles.note}>Radius found no local headlines in Google News from the past week.</p>
          ) : null}
        </div>
        <details className={styles.official} open={updates.length > 0}>
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
                ? updates.length > 0
                  ? "Official newsroom feeds cannot be verified right now. Previously fetched updates are shown below."
                  : "Official city and county updates are unavailable right now."
                : updates.length > 0
                  ? "Some official newsroom feeds are unavailable. Available updates are shown below."
                  : "Some official newsroom feeds are unavailable. No civic updates were returned by the newsrooms that responded."}
            </p>
          )}
          {updates.length > 0 ? (
            <ul className={styles.stories}>
              {updates.map((item) => (
                <li key={item.url}>
                  <NewsLink title={item.title} source={item.source} url={item.url} publishedAt={item.publishedAt} sourceId={item.sourceId} />
                </li>
              ))}
            </ul>
          ) : official.status === "available" ? (
            <p className={styles.note}>No civic updates were returned by these newsrooms.</p>
          ) : null}
          {official.sources && official.sources.length > 0 && (
            <details className={styles.sourceDetails}>
              <summary className={styles.sourceSummary}>Newsroom source checks <ChevronRight aria-hidden="true" size={15} /></summary>
              <ul className={styles.checks} aria-label="Official newsroom source checks">
                {official.sources.map((source) => {
                  const checked = publication(source.checkedAt);
                  const latest = publication(source.latestPublishedAt);
                  return <li key={source.id} data-source-id={source.id} data-source-state={source.status}>
                    <span className={styles.publisher}>{source.source}</span>{". "}
                    {CIVIC_PRESS_SOURCES.find((feed) => feed.id === source.id)?.label}{". "}
                    {source.status === "unavailable" && (source.reason === "stale" ? "The last check is older. " : "Unable to verify this feed. ")}
                    {checked ? <time dateTime={checked.dateTime}>
                      {source.status === "unavailable" && source.reason !== "stale" ? "Attempted" : "Checked"} {checked.label}
                    </time> : <span>Check time unavailable</span>}
                    {source.status !== "unavailable" && source.status === "empty" && ". No updates returned"}
                    {latest && <>. <time dateTime={latest.dateTime}>Latest publication {latest.label}</time></>}
                  </li>;
                })}
              </ul>
            </details>
          )}
        </details>
      </div>
    </section>
  );
}
