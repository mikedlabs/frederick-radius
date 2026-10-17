import RAW from "@/data/municipal-civic.json" with { type: "json" };
import { MUNICIPALITIES } from "@/data/municipalities";
import { municipalCheckedDate, normalizeMunicipalContact, normalizeMunicipalContacts, type CivicContact } from "@/lib/municipal-civic-contact";
export type { CivicContact } from "@/lib/municipal-civic-contact";

/**
 * Per-municipality civic data — the parity layer.
 *
 * The City of Frederick and the County have full department directories
 * (departments.ts). The other towns don't publish feeds, so this data
 * is produced by the extraction agent (scripts/ingest-municipal-civic.ts):
 * it fetches each town's gov page(s) and uses Claude to pull structured
 * fields, writing them here with a SOURCE url + FETCHED-AT timestamp so
 * every answer can show provenance and freshness (North Star law #4).
 *
 * This loader is the read side: typed access for the answer engine and
 * the /m/[municipality] hubs. The file starts empty ({}) — nothing is
 * fabricated; entries appear as the agent populates them.
 */

export type MunicipalCivic = {
  slug: string;
  name: string;
  townHall?: CivicContact;
  publicWorks?: CivicContact;
  police?: CivicContact;
  trashRecycling?: CivicContact;
  permits?: CivicContact;
  utilities?: CivicContact;
  /** Anything else worth surfacing the agent found. */
  extras?: CivicContact[];
  /** Provenance — REQUIRED so the UI can cite source + freshness. */
  source: {
    url: string;
    fetchedAt: string;
    /** Present on records refreshed by the provenance-aware extractor. */
    requestedUrl?: string;
    /** Present on records refreshed by the provenance-aware extractor. */
    finalUrl?: string;
  };
};

const DATA = Object.fromEntries(Object.entries(RAW).map(([slug, rec]) => [slug, normalizeMunicipalContacts(rec)])) as unknown as Record<string, MunicipalCivic>;

/** Civic record for a municipality slug, or null if not yet ingested. */
export function municipalCivicFor(slug: string): MunicipalCivic | null {
  return DATA[slug] ?? null;
}

/** All municipalities that currently have any civic data. */
export function municipalitiesWithCivic(): string[] {
  return Object.keys(DATA);
}

/** The named contact fields, in display order, that exist on a record. */
export function civicContacts(rec: MunicipalCivic): CivicContact[] {
  const ordered: (CivicContact | undefined)[] = [
    rec.townHall,
    rec.trashRecycling,
    rec.publicWorks,
    rec.permits,
    rec.utilities,
    rec.police,
    ...(rec.extras ?? []),
  ];
  return ordered.map(normalizeMunicipalContact).filter((c): c is CivicContact => Boolean(c));
}

/**
 * Town-aware civic answer for the "ask Frederick" engine. If the query
 * names a town we have civic data for, return the contact(s) matching
 * the civic intent in the query (trash → trash, hall → town hall, …) —
 * or the town hall as the default. Returns the town name + records so
 * the UI can render "Brunswick · Trash & Recycling" with source. Empty
 * until the extraction agent populates a town (never fabricated).
 */
export function findMunicipalCivic(
  query: string,
  contextMunicipality?: string | null,
): { town: string; rec: MunicipalCivic; contacts: CivicContact[]; matchedIntent: boolean } | null {
  const lq = query.toLowerCase().trim();
  if (lq.length < 3) return null;

  const namedMuni = MUNICIPALITIES.find((m) => {
    const named = lq.includes(m.name.toLowerCase()) || lq.includes(m.slug.replace(/-/g, " "));
    return named && !(m.slug === "frederick" && /\bfrederick county\b/.test(lq));
  });
  const contextualMuni = !/\b(?:frederick\s+)?county\b/.test(lq)
    ? MUNICIPALITIES.find((m) => m.slug === contextMunicipality)
    : undefined;
  const muni = namedMuni ?? contextualMuni;
  if (!muni) return null;
  const rec = municipalCivicFor(muni.slug);
  if (!rec) return null;

  const pick = (k: keyof MunicipalCivic) => rec[k] as CivicContact | undefined;
  // Fields are tried in order, so an intent can name the office that actually
  // does the work when a town has no dedicated contact for it. Refuse is the
  // case that matters: several towns publish no trashRecycling record, and
  // falling straight through to the town hall answered "who handles trash in
  // Brunswick?" with the town's front door. Public works is the right office.
  const intentMap: { terms: string[]; fields: (keyof MunicipalCivic)[] }[] = [
    { terms: ["trash", "garbage", "recycl", "refuse", "yard"], fields: ["trashRecycling", "publicWorks"] },
    { terms: ["permit", "zoning", "building"], fields: ["permits"] },
    { terms: ["water", "sewer", "utility", "bill"], fields: ["utilities", "publicWorks"] },
    { terms: ["public works", "pothole", "road", "snow"], fields: ["publicWorks"] },
    { terms: ["police", "crime"], fields: ["police"] },
    { terms: ["hall", "mayor", "clerk", "council", "hours"], fields: ["townHall"] },
  ];
  for (const { terms, fields } of intentMap) {
    if (!terms.some((t) => lq.includes(t))) continue;
    for (const field of fields) {
      const c = pick(field);
      if (c) return { town: rec.name, rec, contacts: [c], matchedIntent: true };
    }
  }
  // Town named but no specific intent → lead with the hall + whatever exists.
  return { town: rec.name, rec, contacts: civicContacts(rec).slice(0, 2), matchedIntent: false };
}

/** Dated provenance without treating an invalid future clock as a fresh check. */
export function freshnessLabel(fetchedAt: string, now = new Date()): string {
  const checked = municipalCheckedDate(fetchedAt, now);
  return checked ? `Source checked ${checked}` : "Source check date is unavailable";
}
