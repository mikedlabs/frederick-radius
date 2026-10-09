import { getLocalHeadlinesResult, type NewsHeadlinesResult } from "@/lib/integrations/news";
import { getCivicPressReleasesResult, type CivicPressResult } from "@/lib/integrations/civic-press";
import { withDeadlineFallback } from "@/lib/promise-deadline";
import LocalNewsBriefView from "./LocalNewsBriefView";

export { LocalNewsLoading } from "./LocalNewsBriefView";
export const LOCAL_NEWS_BRIEF_DEADLINE_MS = 2_500;

/** Streams independently of Pulse and the rest of Today. Existing adapters
 * retain their own cache, cancellation, source set, and safety-lane ownership. */
export default async function LocalNewsBrief() {
  const [news, press] = await Promise.all([
    withDeadlineFallback<NewsHeadlinesResult>(getLocalHeadlinesResult(), LOCAL_NEWS_BRIEF_DEADLINE_MS, {
      items: [], status: "unavailable",
    }),
    withDeadlineFallback<CivicPressResult>(getCivicPressReleasesResult(), LOCAL_NEWS_BRIEF_DEADLINE_MS, {
      items: [], sourceHealth: { degraded: true, unavailable: ["City of Frederick", "Frederick County"] },
    }),
  ]);
  return (
    <LocalNewsBriefView news={news} official={{
      items: press.items.filter((item) => item.lane === "civic"),
      status: press.sourceHealth.unavailable.length === 2 ? "unavailable"
        : press.sourceHealth.degraded ? "partial" : "available",
    }} />
  );
}
