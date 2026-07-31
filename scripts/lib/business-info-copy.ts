import { lintSourceText } from "../style-lint";

export type ExtractedBusinessInfo = {
  known_for?: string;
  happy_hour?: string;
  specials?: string[];
  hours_text?: string;
  notable?: string;
};

export type BusinessInfoCopyCleanup = {
  info: ExtractedBusinessInfo;
  rewritten: Array<"known_for" | "notable">;
  dropped: Array<{
    field: "known_for" | "notable";
    rules: string[];
  }>;
};

export const BUSINESS_INFO_FACT_LIMITS = {
  happyHourChars: 600,
  hoursTextChars: 1_200,
  specialChars: 300,
  specials: 12,
} as const;

export const BUSINESS_INFO_SHAPE =
  `Extract these facts from this local business's own website. Include only facts ` +
  `clearly stated on the page, and omit any field that is not supported. Return JSON:\n` +
  `{\n` +
  `  "known_for": string, one complete sentence stating the strongest decision-useful fact; add a second fact only when it changes the decision,\n` +
  `  "happy_hour": string, days, times, and discounts as published (for example, "Mon-Fri 4-6pm: $5 drafts, $7 wells"),\n` +
  `  "specials": string[], recurring weekly specials as published,\n` +
  `  "hours_text": string, operating hours as published,\n` +
  `  "notable": string, one complete sentence with another useful supported detail, such as patio access, a dog policy, a recurring music night, or parking\n` +
  `}\n` +
  `Write known_for and notable as calm, plain facts. Translate the source's marketing language instead of copying it. ` +
  `Do not use fragments, slogans, promotional claims, an automatic three-part list, or any of these stock terms: ` +
  `soothing, nestled, must-visit, vibrant, elevated, curated experience, unlock, heart of, disrupt, seamless, delight, ` +
  `game-changing, leverage, robust, holistic, ecosystem, bucket list, unforgettable, tucked away, one-stop shop, ` +
  `effortless, reimagined, immersive, revolutionary, or destination. ` +
  `Do not return URLs; links are collected directly from real page anchors. ` +
  `Never invent prices, times, services, or dishes. If nothing applies, return {}.`;

const PROSE_FIELDS = ["known_for", "notable"] as const;

function normalizeBoundedFact(
  value: unknown,
  maxLength: number,
): string | undefined {
  if (typeof value !== "string") return undefined;
  const normalized = value
    .replace(/[\u0000-\u001f\u007f-\u009f]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!normalized || normalized.length > maxLength) return undefined;
  return normalized;
}

function normalizeSpecials(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;

  const result: string[] = [];
  const seen = new Set<string>();
  for (const candidate of value) {
    const normalized = normalizeBoundedFact(
      candidate,
      BUSINESS_INFO_FACT_LIMITS.specialChars,
    );
    if (!normalized) continue;
    const key = normalized.toLocaleLowerCase("en-US");
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(normalized);
    if (result.length === BUSINESS_INFO_FACT_LIMITS.specials) break;
  }

  return result.length > 0 ? result : undefined;
}

/**
 * These replacements cover source-language patterns that recur on local
 * business sites. They remove the marketing adjective while retaining the
 * supported fact. Anything that still fails the shared public-copy gate is
 * withheld instead of being published or sent through a paid retry.
 */
function rewriteKnownSourcePhrases(value: string): string {
  return value
    .replace(/[\u2014]/g, ",")
    .replace(/\bdining destination\b/gi, "restaurant")
    .replace(/\ban immersive atmosphere\b/gi, "a themed setting")
    .replace(/\bimmersive atmosphere\b/gi, "themed setting")
    .replace(/\bimmersive atmospheres\b/gi, "themed settings")
    .replace(/\bimmersive games?\b/gi, (match) =>
      /games/i.test(match) ? "themed games" : "themed game",
    )
    .replace(/\bmeticulously crafted\b/gi, "detailed")
    .replace(/\bcrafted sets?\b/gi, (match) =>
      /sets/i.test(match) ? "built sets" : "built set",
    )
    .replace(/\bseamless support\b/gi, "support")
    .replace(/\bholistic healing modalities\b/gi, "healing services")
    .replace(/\s+/g, " ")
    .replace(/\s+([,.;:!?])/g, "$1")
    .trim();
}

function copyGateFindings(
  field: (typeof PROSE_FIELDS)[number],
  value: string,
) {
  return lintSourceText(
    "src/data/business-info.json",
    JSON.stringify({ [field]: value }),
  );
}

export function cleanExtractedBusinessInfo(
  value: unknown,
): BusinessInfoCopyCleanup {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { info: {}, rewritten: [], dropped: [] };
  }

  const raw = value as Record<string, unknown>;
  const text = (key: keyof ExtractedBusinessInfo): string | undefined => {
    const candidate = raw[key];
    return typeof candidate === "string" && candidate.trim()
      ? candidate.trim()
      : undefined;
  };
  const happyHour = normalizeBoundedFact(
    raw.happy_hour,
    BUSINESS_INFO_FACT_LIMITS.happyHourChars,
  );
  const hoursText = normalizeBoundedFact(
    raw.hours_text,
    BUSINESS_INFO_FACT_LIMITS.hoursTextChars,
  );
  const specials = normalizeSpecials(raw.specials);

  const info: ExtractedBusinessInfo = {
    ...(happyHour ? { happy_hour: happyHour } : {}),
    ...(specials?.length ? { specials } : {}),
    ...(hoursText ? { hours_text: hoursText } : {}),
  };
  const rewritten: BusinessInfoCopyCleanup["rewritten"] = [];
  const dropped: BusinessInfoCopyCleanup["dropped"] = [];

  for (const field of PROSE_FIELDS) {
    const source = text(field);
    if (!source) continue;
    const cleaned = rewriteKnownSourcePhrases(source);
    const findings = copyGateFindings(field, cleaned);
    if (findings.length > 0) {
      dropped.push({
        field,
        rules: [...new Set(findings.map((finding) => finding.rule))].sort(),
      });
      continue;
    }
    info[field] = cleaned;
    if (cleaned !== source) rewritten.push(field);
  }

  return { info, rewritten, dropped };
}
