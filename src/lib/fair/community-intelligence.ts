export type FairFrictionTopic =
  | "accessibility"
  | "arrival"
  | "crowds"
  | "family"
  | "food-rides"
  | "policy"
  | "tickets"
  | "other";

export type FairCommunityLead = {
  id: string;
  title: string;
  url: string;
  publishedAt: string;
  topics: FairFrictionTopic[];
};

const FAIR_TOPIC_RULES: Array<{
  topic: Exclude<FairFrictionTopic, "other">;
  pattern: RegExp;
}> = [
  {
    topic: "accessibility",
    pattern:
      /\b(accessib|ada|wheelchair|scooter|mobility|sensory|quiet|stroller)\w*\b/i,
  },
  {
    topic: "arrival",
    pattern:
      /\b(park(?:ing)?|traffic|exit|gate|shuttle|bus|transit|ride\s?share|uber|lyft|drop.?off|pickup)\b/i,
  },
  {
    topic: "crowds",
    pattern: /\b(crowd|busy|line|queue|wait|packed|overwhelm)\w*\b/i,
  },
  {
    topic: "family",
    pattern: /\b(kid|child|baby|family|parent|nursing|diaper|lost)\w*\b/i,
  },
  {
    topic: "food-rides",
    pattern:
      /\b(food|drink|vendor|ride|midway|wristband|credit|game|animal|barn)\w*\b/i,
  },
  {
    topic: "policy",
    pattern:
      /\b(re.?entry|bag|cooler|allowed|prohibit|policy|pet|service animal|cash|card|apple pay)\w*\b/i,
  },
  {
    topic: "tickets",
    pattern:
      /\b(ticket|etix|admission|concert|grandstand|seat|show|will call|box office)\w*\b/i,
  },
];

function decodeXmlText(value: string): string {
  return value
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&apos;|&#39;/gi, "'")
    .replace(/&#(\d+);/g, (_match, decimal: string) =>
      String.fromCodePoint(Number.parseInt(decimal, 10)),
    )
    .replace(/&#x([0-9a-f]+);/gi, (_match, hex: string) =>
      String.fromCodePoint(Number.parseInt(hex, 16)),
    );
}

export function fairFrictionTopics(title: string): FairFrictionTopic[] {
  const topics = FAIR_TOPIC_RULES.filter(({ pattern }) => pattern.test(title)).map(
    ({ topic }) => topic,
  );
  return topics.length > 0 ? topics : ["other"];
}

/**
 * Parse only the non-personal lead fields Radius needs from Reddit's public
 * Atom search feed. Author names, post bodies, media, and comments are ignored.
 */
export function parseFairCommunityFeed(xml: string): FairCommunityLead[] {
  const leads: FairCommunityLead[] = [];
  const ids = new Set<string>();
  for (const match of xml.matchAll(/<entry>([\s\S]*?)<\/entry>/g)) {
    const entry = match[1];
    const id = entry.match(/<id>(t3_[a-z0-9]+)<\/id>/i)?.[1];
    const title = entry.match(/<title>([\s\S]*?)<\/title>/i)?.[1];
    const href = entry.match(/<link\s+href="([^"]+)"\s*\/?\s*>/i)?.[1];
    const published =
      entry.match(/<published>([^<]+)<\/published>/i)?.[1] ??
      entry.match(/<updated>([^<]+)<\/updated>/i)?.[1];
    if (!id || !title || !href || !published || ids.has(id)) continue;
    const decodedUrl = decodeXmlText(href);
    if (
      !/^https:\/\/www\.reddit\.com\/r\/frederickmd\/comments\/[a-z0-9]+\//i.test(
        decodedUrl,
      )
    ) {
      continue;
    }
    const timestamp = Date.parse(published);
    if (!Number.isFinite(timestamp)) continue;
    const decodedTitle = decodeXmlText(title).replace(/\s+/g, " ").trim();
    if (!decodedTitle) continue;
    ids.add(id);
    leads.push({
      id,
      title: decodedTitle.slice(0, 200),
      url: decodedUrl,
      publishedAt: new Date(timestamp).toISOString(),
      topics: fairFrictionTopics(decodedTitle),
    });
  }
  return leads.sort(
    (left, right) =>
      Date.parse(right.publishedAt) - Date.parse(left.publishedAt),
  );
}
