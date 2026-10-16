/** Exact CivicPlus subscriptions verified against the official RSS indexes. */
export const CIVIC_PRESS_SOURCES = [
  { id: "city_official_news", source: "City of Frederick", short: "City", scope: "city", channel: "news", label: "City newsroom",
    host: "cityoffrederickmd.gov",
    url: "https://www.cityoffrederickmd.gov/RSSFeed.aspx?ModID=1&CID=Frederick-News-1" },
  { id: "county_official_news", source: "Frederick County", short: "County", scope: "county", channel: "news", label: "County newsroom",
    host: "frederickcountymd.gov",
    url: "https://www.frederickcountymd.gov/RSSFeed.aspx?ModID=1&CID=All-newsflash.xml" },
  { id: "city_official_releases", source: "City of Frederick", short: "City", scope: "city", channel: "safety", label: "City releases",
    host: "cityoffrederickmd.gov",
    url: "https://www.cityoffrederickmd.gov/RSSFeed.aspx?ModID=1&CID=All-newsflash.xml" },
] as const;
export type CivicPressSource = (typeof CIVIC_PRESS_SOURCES)[number];
