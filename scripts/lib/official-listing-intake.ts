import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { isIP } from "node:net";
import type { DayOfWeek, Hours } from "../../src/data/places";
import { WEEKDAYS } from "../../src/lib/official-hours";
import { MERCHANT_HOURS_SOURCES, merchantWeeklyHoursWindow, validateMerchantHoursArtifact, type MerchantHoursArtifact } from "../../src/lib/merchant-hours";
import { easternDayKey } from "../../src/lib/tz";
import { parseMerchantOfficialHours } from "./merchant-official-hours";
import { merchantHoursBatchTemplate } from "./review-merchant-hours-batch";

const { JSDOM } = createRequire(import.meta.url)("jsdom") as { JSDOM: new (html: string) => { window: { document: Document } } };
const MAX_BYTES = 512 * 1024;
const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const BUSINESS_TYPES = new Set(["LocalBusiness", "FoodEstablishment", "Restaurant", "BarOrPub", "CafeOrCoffeeShop", "Bakery", "IceCreamShop", "Store", "GroceryStore", "BookStore", "AutomotiveBusiness", "AutoRepair", "AutoWash"]);
type JsonObject = Record<string, unknown>;
export type OfficialListingIdentity = {
  slug: string; name: string; category: string; website?: string; address?: string;
  city?: string; state?: string; postal_code?: string; phone?: string; municipality?: string;
};
/** A complete response captured by an existing transport. No fetch capability. */
export type OfficialListingIntakeEvidence = {
  source_url: string; observed_at: string; source_sha256: string; source_revision: string;
  bytes: number; content_type: string; status: number; identity: OfficialListingIdentity; html: string;
};
export type OfficialListingHeldIntake = {
  schema_version: 1; status: "held";
  provenance: Omit<OfficialListingIntakeEvidence, "html" | "identity"> & { valid: boolean };
  canonical_identity: OfficialListingIdentity;
  identity_state: "exact" | "unmatched" | "ambiguous" | "incomplete";
  reasons: string[];
  candidates: {
    contact?: { name: string; website: string; street: string; city: string; state: string; postal_code: string; phone?: string; email?: string };
    weekly_hours?: { hours: Hours; observed_at: string; expires_at: string; coverage_from: string; coverage_through: string; owner: "official-hours"; review_required: true };
    image_urls?: { url: string; rights: "unverified"; publishable: false }[];
  };
  enrollment_draft?: {
    owner: "official-hours"; status: "held"; slug: string; category: string; source_url: string;
    shape: "jsonld_weekly_location_cards"; schema_type: string; entity_url: string;
    binding: { slug: string; source_name: string; identity: { name: string; street: string; locality: string; region: string; postalCode: string; phone: string } };
    missing_review: ["official_source_ledger_and_exact_registry_binding", "code_reviewed_visible_location_and_weekday_selectors", "complete_visible_week_agrees_with_structured_week_and_notices"];
  };
  review_requirements: string[];
};
const hash = (html: string) => createHash("sha256").update(html).digest("hex");
const object = (value: unknown): JsonObject | undefined => value !== null && typeof value === "object" && !Array.isArray(value) ? value as JsonObject : undefined;
const normalized = (value: string) => value.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");
const phone = (value: unknown) => typeof value === "string" ? value.replace(/\D/g, "").replace(/^1(?=\d{10}$)/, "") : "";
function publicUrl(value: unknown): URL | undefined {
  if (typeof value !== "string") return;
  try {
    const url = new URL(value), host = url.hostname.toLowerCase().replace(/\.$/, "");
    if (url.protocol !== "https:" || url.username || url.password || (url.port && url.port !== "443") || !host.includes(".") || isIP(host)
      || /(?:^|\.)(?:localhost|local|internal|test|invalid)$/.test(host)) return;
    return url;
  } catch { return; }
}
function comparableUrl(value: unknown): string | undefined {
  const url = publicUrl(value); if (!url) return;
  url.hash = ""; url.hostname = url.hostname.replace(/^www\./, "");
  for (const key of [...url.searchParams.keys()]) if (/^utm_/i.test(key)) url.searchParams.delete(key);
  url.pathname = url.pathname.replace(/\/$/, "") || "/";
  return url.toString();
}
function canonicalStreet(identity: OfficialListingIdentity): string {
  const address = normalized(identity.address ?? "");
  const suffix = normalized(`${identity.city ?? ""} ${identity.state ?? ""} ${identity.postal_code ?? ""}`);
  return suffix && address.endsWith(suffix) ? address.slice(0, -suffix.length) : address;
}
function exactIdentity(entity: JsonObject, identity: OfficialListingIdentity): boolean {
  const address = object(entity.address);
  const country = address?.addressCountry;
  const countryName = object(country)?.name ?? country;
  return typeof entity.name === "string" && normalized(entity.name) === normalized(identity.name)
    && comparableUrl(entity.url) === comparableUrl(identity.website)
    && Boolean(address) && typeof address!.streetAddress === "string" && normalized(address!.streetAddress) === canonicalStreet(identity)
    && typeof address!.addressLocality === "string" && normalized(address!.addressLocality) === normalized(identity.city!)
    && typeof address!.addressRegion === "string" && normalized(address!.addressRegion) === normalized(identity.state!)
    && address!.postalCode === identity.postal_code
    && (country === undefined || countryName === "US" || countryName === "United States")
    && (!identity.phone || (phone(identity.phone).length === 10 && phone(entity.telephone) === phone(identity.phone)));
}
function businessEntities(document: Document): JsonObject[] {
  const entities: JsonObject[] = []; let visited = 0;
  const walk = (value: unknown, depth: number) => {
    if (++visited > 10_000 || depth > 24) throw new Error("jsonld_structure_limit");
    if (Array.isArray(value)) { value.forEach((child) => walk(child, depth + 1)); return; }
    const row = object(value); if (!row) return;
    const types = Array.isArray(row["@type"]) ? row["@type"] : [row["@type"]];
    if (types.some((type) => typeof type === "string" && BUSINESS_TYPES.has(type.replace(/^https:\/\/schema\.org\//, "")))) entities.push(row);
    for (const child of Object.values(row)) if (child && typeof child === "object") walk(child, depth + 1);
  };
  const scripts = [...document.querySelectorAll("script")].filter((node) => node.getAttribute("type")?.split(";")[0].trim().toLowerCase() === "application/ld+json");
  if (scripts.length > 32) throw new Error("jsonld_structure_limit");
  for (const script of scripts) {
    for (let node: Element | null = script; node; node = node.parentElement) {
      if (node.hasAttribute("hidden") || node.hasAttribute("inert") || node.getAttribute("aria-hidden") === "true"
        || /display\s*:\s*none|visibility\s*:\s*(?:hidden|collapse)/i.test(node.getAttribute("style") ?? "")) throw new Error("hidden_jsonld_evidence");
    }
    let value: unknown; try { value = JSON.parse(script.textContent ?? ""); } catch { throw new Error("invalid_jsonld"); }
    walk(value, 0);
  }
  return entities;
}
function visibleText(document: Document): string {
  const clone = document.body.cloneNode(true) as HTMLElement;
  clone.querySelectorAll("script,style,noscript,template,[hidden],[inert],[aria-hidden='true']").forEach((node) => node.remove());
  for (const node of [...clone.querySelectorAll("[style]")]) if (/display\s*:\s*none|visibility\s*:\s*(?:hidden|collapse)/i.test(node.getAttribute("style") ?? "")) node.remove();
  return (clone.textContent ?? "").replace(/\s+/g, " ").trim();
}
function weeklyHours(entity: JsonObject): Hours {
  if (["specialOpeningHoursSpecification", "openingHours", "validFrom", "validThrough", "temporalCoverage"].some((key) => key in entity)
    || !Array.isArray(entity.openingHoursSpecification) || !entity.openingHoursSpecification.length || entity.openingHoursSpecification.length > 14) throw new Error("weekly_hours_missing_or_qualified");
  const hours: Hours = {};
  for (const raw of entity.openingHoursSpecification) {
    const row = object(raw);
    if (!row || row["@type"] !== "OpeningHoursSpecification" || Object.keys(row).some((key) => !["@type", "dayOfWeek", "opens", "closes"].includes(key))) throw new Error("weekly_hours_invalid_or_qualified");
    const days = Array.isArray(row.dayOfWeek) ? row.dayOfWeek : [row.dayOfWeek];
    const clock = (value: unknown): value is string => typeof value === "string" && /^(?:[01]\d|2[0-3]):[0-5]\d(?::00)?$/.test(value);
    if (!days.length || days.length > 7 || new Set(days).size !== days.length || !clock(row.opens) || !clock(row.closes)) throw new Error("weekly_hours_invalid_or_qualified");
    const open = row.opens.slice(0, 5), close = row.closes.slice(0, 5);
    // Neither equal-midnight nor a missing weekday proves closure. Those
    // representations need a reviewed source adapter, never a guessed week.
    if (open >= close) throw new Error("weekly_hours_overnight_or_closed_ambiguous");
    for (const value of days) {
      const index = typeof value === "string" ? DAYS.indexOf(value.replace(/^https:\/\/schema\.org\//, "")) : -1;
      if (index < 0) throw new Error("weekly_hours_invalid_or_qualified");
      const day: DayOfWeek = WEEKDAYS[index]; (hours[day] ??= []).push({ open, close });
    }
  }
  for (const day of WEEKDAYS) {
    const slots = hours[day];
    if (!slots || slots.length > 2) throw new Error("weekly_hours_incomplete_or_duplicate");
    slots.sort((a, b) => a.open.localeCompare(b.open));
    if (slots.length === 2 && slots[0].close > slots[1].open) throw new Error("weekly_hours_overlapping");
  }
  return hours;
}
function images(entity: JsonObject): OfficialListingHeldIntake["candidates"]["image_urls"] {
  const values: unknown[] = [entity.image, entity.photo];
  const urls = new Set<string>();
  for (const value of values.flatMap((value) => Array.isArray(value) ? value : [value])) {
    const row = object(value);
    for (const candidate of row ? [row.url, row.contentUrl] : [value]) {
      const url = publicUrl(candidate); if (url && urls.size < 8) urls.add(url.toString());
    }
  }
  // A schema.org license string does not establish rights or exact visual
  // identity. No caller may mistake these discovery URLs for usable photos.
  return [...urls].map((url) => ({ url, rights: "unverified", publishable: false }));
}

/** Project already captured HTML into private HELD review candidates only.
 * No raw HTML, current/verified flag, provider call or public artifact escapes.
 */
export function intakeOfficialListingEvidence(evidence: OfficialListingIntakeEvidence, now = new Date()): OfficialListingHeldIntake {
  const { html, identity } = evidence;
  const metadata = { source_url: evidence.source_url, observed_at: evidence.observed_at, source_sha256: evidence.source_sha256,
    source_revision: evidence.source_revision, bytes: evidence.bytes, content_type: evidence.content_type, status: evidence.status };
  const canonical = { slug: identity.slug, name: identity.name, category: identity.category, website: identity.website,
    address: identity.address, city: identity.city, state: identity.state, postal_code: identity.postal_code, phone: identity.phone, municipality: identity.municipality };
  const result: OfficialListingHeldIntake = { schema_version: 1, status: "held", provenance: { ...metadata, valid: false }, canonical_identity: canonical,
    identity_state: "incomplete", reasons: [], candidates: {}, review_requirements: ["substantive_exact_identity_and_visible_schedule_review", "reviewed_daily_official_hours_enrollment", "explicit_existing_batch_review", "normal_protected_publication"] };
  const reason = (code: string) => { if (!result.reasons.includes(code)) result.reasons.push(code); };
  const source = publicUrl(evidence.source_url), website = publicUrl(identity.website);
  const validStamp = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(evidence.observed_at) && Number.isFinite(Date.parse(evidence.observed_at))
    && new Date(evidence.observed_at).toISOString() === evidence.observed_at;
  if (typeof html !== "string" || !Number.isSafeInteger(evidence.bytes) || evidence.bytes < 1 || evidence.bytes > MAX_BYTES
    || Buffer.byteLength(html) !== evidence.bytes || !/^[a-f0-9]{64}$/.test(evidence.source_sha256) || hash(html) !== evidence.source_sha256
    || evidence.status !== 200 || !/^(?:text\/html|application\/xhtml\+xml)(?:;|$)/i.test(evidence.content_type)
    || !source || !website || source.hostname !== website.hostname || !validStamp || !Number.isFinite(now.getTime()) || Date.parse(evidence.observed_at) > now.getTime()) {
    reason("invalid_original_receipt"); return result;
  }
  if (!/^[a-f0-9]{40}$/.test(evidence.source_revision)) { reason("source_revision_unknown"); return result; }
  result.provenance.valid = true;
  if (![identity.slug, identity.name, identity.category, identity.address, identity.city, identity.state, identity.postal_code].every((value) => typeof value === "string" && value.trim()) || !canonicalStreet(identity)) {
    reason("canonical_identity_incomplete"); return result;
  }
  let document: Document, entities: JsonObject[];
  try { document = new JSDOM(html).window.document; entities = businessEntities(document); }
  catch (error) { reason(error instanceof Error ? error.message : "invalid_jsonld"); return result; }
  const matched = entities.filter((entity) => exactIdentity(entity, identity));
  result.identity_state = matched.length > 1 ? "ambiguous" : matched.length === 1 ? "exact" : "unmatched";
  if (matched.length !== 1) { reason(matched.length > 1 ? "ambiguous_exact_business_entities" : entities.length ? "business_identity_mismatch" : "no_business_jsonld"); return result; }
  const entity = matched[0], address = object(entity.address)!;
  const telephone = phone(entity.telephone);
  const email = typeof entity.email === "string" ? entity.email.replace(/^mailto:/i, "").trim() : "";
  result.candidates.contact = { name: entity.name as string, website: entity.url as string, street: address.streetAddress as string,
    city: address.addressLocality as string, state: address.addressRegion as string, postal_code: address.postalCode as string,
    ...(telephone.length === 10 ? { phone: telephone } : {}), ...(email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? { email } : {}) };
  result.candidates.image_urls = images(entity);
  const notices = /\b(?:temporarily closed|closed (?:today|tomorrow|for)|closing early|early clos(?:e|ure)|holiday|special hours|seasonal|until sold out|drinks only|kitchen hours|by appointment|last admission|last admittance|hours (?:vary|may|subject to))\b|\b(?:pickup|pick-up|delivery|takeout|take-out|online)\s+(?:only|hours)\b/i.test(visibleText(document));
  if (notices) { reason("visible_notice_or_service_qualifier"); return result; }
  try {
    const hours = weeklyHours(entity);
    const window = merchantWeeklyHoursWindow(identity.slug, evidence.observed_at);
    if (now.getTime() >= Date.parse(window.expires_at)) { reason("hours_evidence_expired"); return result; }
    result.candidates.weekly_hours = { hours, observed_at: evidence.observed_at, ...window, coverage_from: easternDayKey(new Date(evidence.observed_at)), owner: "official-hours", review_required: true };
    const schemaTypes = Array.isArray(entity["@type"]) ? entity["@type"] : [entity["@type"]];
    const schemaType = schemaTypes.find((type) => typeof type === "string" && BUSINESS_TYPES.has(type.replace(/^https:\/\/schema\.org\//, ""))) as string;
    if (telephone.length === 10) result.enrollment_draft = {
      owner: "official-hours", status: "held", slug: identity.slug, category: identity.category, source_url: evidence.source_url,
      shape: "jsonld_weekly_location_cards", schema_type: schemaType.replace(/^https:\/\/schema\.org\//, ""), entity_url: entity.url as string,
      binding: { slug: identity.slug, source_name: identity.name, identity: { name: entity.name as string, street: address.streetAddress as string,
        locality: address.addressLocality as string, region: address.addressRegion as string, postalCode: address.postalCode as string, phone: telephone } },
      missing_review: ["official_source_ledger_and_exact_registry_binding", "code_reviewed_visible_location_and_weekday_selectors", "complete_visible_week_agrees_with_structured_week_and_notices"],
    };
    reason("visible_week_and_notices_require_review");
  } catch (error) { reason(error instanceof Error ? error.message : "weekly_hours_unusable"); }
  return result;
}

/** Offline seam into the EXISTING reviewer. It stages no public rows, enrolls
 * no source, and returns only held decisions. New sources need reviewed exact
 * registry/cohort bindings first; a commerce 30-day observation never owns hours.
 */
export function prepareOfficialListingHoursHandoff(artifactBytes: string, inputs: readonly { evidence: OfficialListingIntakeEvidence; evidence_file: string }[], now = new Date()) {
  const previous: unknown = JSON.parse(artifactBytes); validateMerchantHoursArtifact(previous);
  const artifact: MerchantHoursArtifact = structuredClone(previous);
  const staged: string[] = [], blocked: { slug: string; source_url: string; reason: string }[] = [];
  const counts = new Map<string, number>();
  for (const { evidence } of inputs) counts.set(evidence.identity.slug, (counts.get(evidence.identity.slug) ?? 0) + 1);
  for (const { evidence, evidence_file } of inputs) {
    const slug = evidence.identity.slug;
    const block = (reason: string) => blocked.push({ slug, source_url: evidence.source_url, reason });
    if (counts.get(slug)! > 1) { block("multiple_receipts_require_explicit_selection"); continue; }
    const intake = intakeOfficialListingEvidence(evidence, now);
    if (!intake.provenance.valid) { block("exact_original_identity_evidence_required"); continue; }
    const source = MERCHANT_HOURS_SOURCES.find((source) => source.slug === slug);
    if (!source) { block("reviewed_daily_hours_registry_and_parser_enrollment_required"); continue; }
    if (("collection" in source && source.collection === "manual") || source.url !== evidence.source_url || source.category !== evidence.identity.category || !evidence_file.trim()) {
      block("existing_owner_source_or_evidence_file_mismatch"); continue;
    }
    const accepted = previous.places.find((row) => row.slug === slug);
    const pending = previous.review.find((row) => row.slug === slug);
    const priorProofs = [accepted, pending?.candidate].filter((row) => row !== undefined);
    const latest = Math.max(0, ...priorProofs.map((row) => Date.parse(row.observed_at)), pending ? Date.parse(pending.checked_at) : 0);
    if (Date.parse(evidence.observed_at) < latest) { block("older_than_existing_observation_or_review"); continue; }
    if (priorProofs.some((row) => row.observed_at === evidence.observed_at && row.source_sha256 !== evidence.source_sha256)) {
      block("conflicting_proof_at_same_observation"); continue;
    }
    try {
      // Reviewed existing source adapters own their exact identities, visible
      // schedules and notices, including sources without JSON-LD. The generic
      // discovery projection must never become a second, weaker release gate.
      const candidate = parseMerchantOfficialHours(source, { url: source.url, html: evidence.html, observedAt: evidence.observed_at }, now);
      artifact.review = artifact.review.filter((row) => row.slug !== slug);
      artifact.review.push({ slug, checked_at: evidence.observed_at, reason: "pending_acceptance", candidate });
      staged.push(slug);
    } catch { block("registered_daily_hours_parser_rejected_original"); }
  }
  validateMerchantHoursArtifact(artifact);
  const bytes = JSON.stringify(artifact, null, 2) + "\n";
  const plan = merchantHoursBatchTemplate(bytes);
  const files = new Map(inputs.map((input) => [input.evidence.identity.slug, input.evidence_file]));
  for (const decision of plan.decisions) if (staged.includes(decision.slug)) decision.evidence_file = files.get(decision.slug)!;
  return { artifact, artifact_bytes: bytes, plan, staged, blocked, publication_required: false as const };
}
