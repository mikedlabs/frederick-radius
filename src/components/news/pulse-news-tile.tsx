import type { ReactNode } from "react";
import type { PulseTile } from "@/components/pulse/PulseBoard";
import type { NewsHeadlinesResult } from "@/lib/integrations/news";
import type { OfficialNewsResult } from "./LocalNewsBriefView";

/** Project the existing Google News and official-newsroom reading onto Pulse. */
export function pulseNewsTile(news: NewsHeadlinesResult, official: OfficialNewsResult, body: ReactNode): PulseTile {
  const availability = news.status === "available" && official.status === "available"
    ? "current" : news.status === "unavailable" && official.status === "unavailable"
      ? "unavailable" : "partial";
  return {
    key: "news", label: "In the news", iconName: "Newspaper",
    countLabel: news.items.length > 0 ? `${news.items.length} ${news.items.length === 1 ? "story" : "stories"}`
      : official.items.length > 0 ? "Official updates"
      : availability === "unavailable" ? "Unavailable" : "No headlines returned",
    accent: "var(--app-cool)", active: false, attention: false,
    availability, degraded: availability !== "current",
    kind: "status", sourceLabel: "Google News · City & county newsrooms",
    peek: news.items[0]?.title ?? official.items[0]?.title,
    body,
  };
}
