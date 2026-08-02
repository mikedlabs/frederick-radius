import { createHash } from "node:crypto";
import { normalizeSourceContent } from "./source-content-fingerprint";

export type ApifySourceSignalFingerprint = {
  contentHash: string;
  contentLength: number;
  dates: {
    hash: string;
    count: number;
  };
  times: {
    hash: string;
    count: number;
  };
  eventLinks: {
    hash: string;
    count: number;
  };
};

export type ApifySourceFingerprintField =
  "content" | "dates" | "times" | "event-links";

const NAMED_DATE_PATTERN =
  /\b(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\s+\d{1,2}(?:st|nd|rd|th)?(?:,?\s+\d{2,4})?\b/gi;
const NUMERIC_DATE_PATTERN =
  /\b(?:\d{4}-\d{1,2}-\d{1,2}|\d{1,2}[\/.]\d{1,2}(?:[\/.]\d{2,4})?)\b/g;
const TIME_PATTERN =
  /\b(?:[01]?\d|2[0-3])(?::[0-5]\d)?\s*(?:a\.?m\.?|p\.?m\.?)\b|\b(?:[01]?\d|2[0-3]):[0-5]\d\b/gi;
// Publishers commonly omit the meridiem from the first endpoint of a range
// (for example, "7–9 pm"). Capture that otherwise-bare endpoint separately so
// moving an event's start still changes the time-signal fingerprint.
const MERIDIEM_RANGE_START_PATTERN =
  /(?<![:\d])\b(?:[01]?\d|2[0-3])(?=\s*(?:[-\u2012-\u2014]|\bto\b)\s*(?:[01]?\d|2[0-3])(?::[0-5]\d)?\s*(?:a\.?m\.?|p\.?m\.?)\b)/gi;
const EVENT_PATH_PATTERN =
  /\/(?:event|events|calendar|calendars|performance|performances|show|shows|ticket|tickets)(?:[/.]|$)/i;

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function canonicalHost(url: string): string {
  return new URL(url).hostname.toLowerCase().replace(/^www\./, "");
}

export { normalizeSourceContent as normalizeApifySourceContent };

function normalizeSignalToken(value: string): string {
  return value
    .normalize("NFKC")
    .toLowerCase()
    .replace(/\b(\d{1,2})(?:st|nd|rd|th)\b/g, "$1")
    .replace(/[.,]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function collectMatches(value: string, patterns: readonly RegExp[]): string[] {
  const matches: string[] = [];
  for (const pattern of patterns) {
    for (const match of value.matchAll(pattern)) {
      if (match[0]) matches.push(normalizeSignalToken(match[0]));
    }
  }
  return matches.sort();
}

export function canonicalApifyEventLinks(
  links: readonly string[],
  sourceUrl: string,
): string[] {
  const sourceHost = canonicalHost(sourceUrl);
  const kept = new Set<string>();
  for (const value of links) {
    try {
      const parsed = new URL(value, sourceUrl);
      if (
        parsed.protocol !== "https:" ||
        canonicalHost(parsed.href) !== sourceHost
      ) {
        continue;
      }
      parsed.username = "";
      parsed.password = "";
      parsed.search = "";
      parsed.hash = "";
      if (!EVENT_PATH_PATTERN.test(parsed.pathname)) continue;
      kept.add(parsed.toString());
    } catch {
      // Provider-returned links are only optional change signals.
    }
  }
  return [...kept].sort();
}

function signalSummary(values: readonly string[]): {
  hash: string;
  count: number;
} {
  return {
    hash: sha256(values.join("\u001f")),
    count: values.length,
  };
}

/**
 * Build compact, deterministic change evidence without retaining publisher
 * prose. Date and time tokens are hashed immediately and never returned.
 */
export function fingerprintApifySource(
  markdown: string,
  links: readonly string[],
  sourceUrl: string,
): ApifySourceSignalFingerprint {
  const normalized = normalizeSourceContent(markdown);
  const dates = collectMatches(normalized, [
    NAMED_DATE_PATTERN,
    NUMERIC_DATE_PATTERN,
  ]);
  const times = collectMatches(normalized, [
    TIME_PATTERN,
    MERIDIEM_RANGE_START_PATTERN,
  ]);
  const eventLinks = canonicalApifyEventLinks(links, sourceUrl);
  return {
    contentHash: sha256(normalized),
    contentLength: normalized.length,
    dates: signalSummary(dates),
    times: signalSummary(times),
    eventLinks: signalSummary(eventLinks),
  };
}

export function changedApifySourceFingerprintFields(
  previous: ApifySourceSignalFingerprint,
  current: ApifySourceSignalFingerprint,
): ApifySourceFingerprintField[] {
  const changed: ApifySourceFingerprintField[] = [];
  if (previous.contentHash !== current.contentHash) changed.push("content");
  if (previous.dates.hash !== current.dates.hash) changed.push("dates");
  if (previous.times.hash !== current.times.hash) changed.push("times");
  if (previous.eventLinks.hash !== current.eventLinks.hash) {
    changed.push("event-links");
  }
  return changed;
}
