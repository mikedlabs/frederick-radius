/**
 * Voice lint — CI guard for editorial drift.
 *
 * Brief: docs/briefs/2026-05-18-external-audit-actions.md section 4.4.
 * The em-dash slip on /plan would not exist if a lint caught it. This is
 * that lint.
 *
 * It is AST-based, not a grep, on purpose. A grep for "elevated" matches
 * the design token `var(--app-bg-elevated)` hundreds of times and the
 * "zero on main" bar becomes unmeetable. We only inspect text that is
 * actually editorial copy:
 *
 *   - JSX text (the words between tags)
 *   - string / template literals that are NOT a type union, NOT a
 *     className / style / technical attribute, NOT a module specifier,
 *     and NOT a single-token enum / identifier value
 *
 * Comments and TypeScript type literals are skipped, per the brief.
 *
 * The banned set is documented in docs/VOICE.md. `src/lib/copy-quality.ts`
 * applies a related, deliberately broader set of scraped-directory tells to
 * third-party place descriptions; this lint governs prose Radius authors.
 *
 * Scope: routed UI, shared components, the curated event/place copy, and the
 * Ask Radius generation layer. Model instructions are product copy too: a
 * prompt that requests clipped prose or padded lists will reproduce that voice
 * across every generated answer even when the checked-in UI strings are clean.
 *
 * Exit 1 on any hit, printing path:line and the offending substring.
 */
import ts from "typescript";
import { readFileSync, writeFileSync, readdirSync, existsSync, statSync } from "node:fs";
import { join, relative, extname, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const ROOT = process.cwd();

const SCAN_DIRS = [
  "src/app",
  "src/components",
  "src/data",
  "src/lib/answers",
  "src/lib/ask",
  "src/lib/search",
];
const SCAN_FILES = [
  "src/lib/beer-experience.ts",
  "src/lib/event-pairings.ts",
  "src/lib/integrations/planner.ts",
  "src/lib/integrations/wikimedia.ts",
  "src/lib/loaders/amenities.ts",
  "src/lib/locations.ts",
  "src/lib/place-reasons.ts",
  "src/lib/push-topics.ts",
  "src/lib/trust.ts",
  "src/lib/weather-verdict.ts",
];
// These registries contain historical titles or internal source-audit notes,
// not prose authored for a product surface.
const EXCLUDED_COPY_FILES = new Set([
  "src/data/loc-archive.ts",
  "src/data/town-websites.ts",
]);

// Only these JSON files contain owner-authored prose that ships directly to a
// public surface. The other JSON files are maps, raw feeds, generated search
// candidates, compact factual labels, or maintainer instructions.
const COPY_JSON_FILES = new Set([
  "src/data/beers.json",
  "src/data/brunch.json",
  "src/data/business-info.json",
  "src/data/event-notices.json",
  "src/data/field-notes.json",
  "src/data/place-status-overrides.json",
  "src/data/places-overrides.json",
  "src/data/town-cliffnotes.json",
]);

/** JSX attributes and object keys whose string value is never prose. */
const NON_COPY_ATTRS = new Set([
  "classname",
  "class",
  "style",
  "href",
  "src",
  "srcset",
  "id",
  "key",
  "ref",
  "role",
  "name",
  "htmlfor",
  "type",
  "rel",
  "target",
  "as",
  "slot",
  "method",
  "action",
  "enctype",
  "accept",
  "pattern",
  "autocomplete",
  "inputmode",
  "charset",
  "viewbox",
  "d",
  "fill",
  "stroke",
  "points",
  "transform",
  "cx",
  "cy",
  "x",
  "y",
  "r",
  "width",
  "height",
  "color",
  "fontfamily",
  "datatestid",
]);

/** Helpers that compose CSS class names; their string args are not copy. */
const CLASSNAME_FNS = new Set(["clsx", "cn", "cva", "tv", "twmerge", "classnames", "tw"]);

export type Finding = {
  file: string;
  line: number;
  rule: string;
  snippet: string;
};

// --- The banned set (docs/VOICE.md) -----------------------------------
// Outer boundaries treat `-` and `_` as word chars so design-token
// slugs (`--app-bg-elevated`, `bg_elevated`) never trip a word that
// also lives in real copy ("an elevated patio").
const B = "(?<![\\w-])";
const A = "(?![\\w-])";

const BANNED: Array<{ rule: string; re: RegExp; allow?: RegExp }> = [
  { rule: "em dash", re: /—/ },
  {
    rule: "craft",
    re: new RegExp(`${B}craft(?:ed|ing|s)?${A}`, "i"),
    // These are literal industry and event names, not lifestyle filler.
    allow: /\bcraft (?:and art|beer|beers|beverage|brewery|breweries|brews|cocktails?|distillery|draft|drafts|pints?|spirits?)\b|\bMaryland Craft Beer Festival\b|\bcrafts\b|\bbring your own craft\b/i,
  },
  { rule: "soothing", re: new RegExp(`${B}soothing${A}`, "i") },
  {
    rule: "staff",
    re: new RegExp(`${B}staff${A}`, "i"),
    // The voice rule governs product voice ("our staff"), not a
    // journalistic role title.
    allow: /\bstaff\s+(writer|reporter|photographer|editor|sergeant|sgt)\b|\b(chief of|general|city|county|school|restaurant|venue)\s+staff\b|\bask (?:the )?staff\b/i,
  },
  { rule: "nestled", re: new RegExp(`${B}nestled${A}`, "i") },
  {
    rule: "hidden gem",
    re: new RegExp(`${B}hidden gem${A}`, "i"),
    // This exact chip names a real editorial flag. The rule still rejects the
    // phrase when it is used as generic promotional prose.
    allow: /^\s*Hidden gem\s*$/i,
  },
  { rule: "must-visit", re: new RegExp(`${B}must[- ]visit${A}`, "i") },
  { rule: "vibrant", re: new RegExp(`${B}vibrant${A}`, "i") },
  { rule: "elevated", re: new RegExp(`${B}elevated${A}`, "i") },
  { rule: "curated experience", re: new RegExp(`${B}curated experience${A}`, "i") },
  {
    rule: "destination",
    re: new RegExp(`${B}destination${A}`, "i"),
    // Brief 4.4: allow "destination" in a transit-route context. Also
    // allow property access (`req.destination`): the service worker
    // source lives in a template literal, so the Web Request API's
    // `.destination` is code, not editorial copy. A leading dot never
    // occurs in real prose ("your destination" has a space).
    allow: /\b(?:transit|route|bus|gtfs|headsign|bound|inbound|outbound|trip|stop)\b[^.!?]{0,60}\bdestination\b|\bdestination\b[^.!?]{0,60}\b(?:transit|route|bus|gtfs|headsign|bound|inbound|outbound|trip|stop)\b|\.destination\b/i,
  },
  // Brand Book No. 01 additions (May 2026). New banned words from the
  // Voice Guide list. Selective subset — focused on
  // marketing-speak unlikely to false-positive in technical English.
  { rule: "unlock", re: new RegExp(`${B}unlock${A}`, "i") },
  { rule: "heart of", re: /\bheart of\b/i },
  { rule: "disrupt", re: new RegExp(`${B}disrupt${A}`, "i") },
  { rule: "seamless", re: new RegExp(`${B}seamless(?:ly)?${A}`, "i") },
  {
    rule: "delight",
    re: new RegExp(`${B}delight(?:ful|ed|s)?${A}`, "i"),
    allow: /\bD['’]s Delights\b/i,
  },
  { rule: "game-changing", re: /\bgame[- ]chang(?:er|ing)\b/i },
  { rule: "leverage", re: new RegExp(`${B}leverag(?:e|es|ing|ed)${A}`, "i") },
  { rule: "robust", re: new RegExp(`${B}robust${A}`, "i"), allow: /\brobust porter\b/i },
  { rule: "holistic", re: new RegExp(`${B}holistic${A}`, "i") },
  { rule: "ecosystem", re: new RegExp(`${B}ecosystem${A}`, "i") },
  { rule: "bucket list", re: /\bbucket list\b/i },
  { rule: "unforgettable", re: new RegExp(`${B}unforgettable${A}`, "i") },
  { rule: "tucked away", re: /\btucked away\b/i },
  { rule: "one-stop shop", re: /\bone[- ]stop[- ]shop\b/i },
  { rule: "effortless", re: new RegExp(`${B}effortless(?:ly)?${A}`, "i") },
  { rule: "reimagined", re: new RegExp(`${B}reimagined${A}`, "i") },
  { rule: "immersive", re: new RegExp(`${B}immersive${A}`, "i") },
  { rule: "revolutionary", re: new RegExp(`${B}revolutionary${A}`, "i") },
  { rule: "your gateway to", re: /\byour gateway to\b/i },
  { rule: "powered by", re: /\bpowered by\b/i },
  { rule: "the future of", re: /\bthe future of\b/i },
  { rule: "we've got you covered", re: /\bwe(?:'|’| have) got you covered\b/i },
  { rule: "everything you need", re: /\beverything you need\b/i },
  { rule: "at your fingertips", re: /\bat your fingertips\b/i },
  { rule: "dive in", re: /\bdive in\b/i },
  { rule: "level up", re: /\blevel up\b/i },
];

const SENTENCE_END_RE = /[^.!?]+[.!?]+/g;
const LIKELY_VERB_RE = /\b(?:am|are|is|was|were|be|been|being|isn't|aren't|wasn't|weren't|can|can't|cannot|could|couldn't|do|does|doesn't|don't|did|didn't|find|finds|found|get|gets|got|give|gives|gave|go|goes|went|had|has|hasn't|have|haven't|help|helps|keep|keeps|know|knows|lead|leads|let|lets|make|makes|made|may|might|must|need|needs|needed|open|opens|opened|plan|plans|planned|save|saves|saved|see|sees|seen|show|shows|shown|should|shouldn't|start|starts|started|stay|stays|stayed|take|takes|took|tell|tells|told|try|tries|tried|use|uses|used|want|wants|wanted|will|won't|would|wouldn't|you(?:'re|'ll|'ve)|we(?:'re|'ll|'ve)|it(?:'s|'ll)|there(?:'s|'re)|access|accesses|allow|allows|appear|appears|arrive|arrives|ask|asks|book|books|browse|browses|build|builds|call|calls|change|changes|check|checks|choose|chooses|click|clicks|close|closes|compare|compares|connect|connects|contact|contacts|continue|continues|cover|covers|discover|discovers|download|downloads|drink|drinks|drive|drives|earn|earns|eat|eats|email|emails|enable|enables|end|ends|enjoy|enjoys|enter|enters|explain|explains|explore|explores|feature|features|fit|fits|flag|flags|focus|focuses|fold|folds|follow|follows|grow|grows|grew|hand|hands|happen|happens|include|includes|join|joins|land|lands|learn|learns|leave|leaves|lie|lies|list|lists|live|lives|load|loads|look|looks|mark|marks|match|matches|meet|meets|move|moves|offer|offers|order|orders|park|parks|pay|pays|pick|picks|provide|provides|rank|ranks|reach|reaches|read|reads|recompute|recomputes|record|records|report|reports|review|reviews|return|returns|ride|rides|run|runs|scrub|scrubs|search|searches|select|selects|send|sends|serve|serves|share|shares|sign|signs|sit|sits|spend|spends|stop|stops|submit|submits|suggest|suggests|support|supports|tap|taps|turn|turns|unify|unifies|update|updates|verify|verifies|view|views|visit|visits|wait|waits|walk|walks|watch|watches|work|works)\b/i;
const ADDITIONAL_VERB_RE = /\b(?:accept|accepts|add|adds|anchor|anchors|belong|belongs|brew|brews|bring|brings|capture|captures|carry|carries|expect|expects|feel|feels|fill|fills|highlight|highlights|host|hosts|hosted|lean|leans|occupy|occupies|operate|operates|package|packages|pair|pairs|peak|peaks|pour|pours|publish|publishes|range|ranges|say|says|specialize|specializes)\b/i;

function hasLikelyVerb(sentence: string): boolean {
  const normalized = sentence
    .replace(/[’]/g, "'")
    .replace(/&(?:apos|rsquo);/gi, "'")
    .replace(/&(?:quot|ldquo|rdquo);/gi, '"');
  if (LIKELY_VERB_RE.test(normalized) || ADDITIONAL_VERB_RE.test(normalized)) return true;

  return false;
}

/** Fields that contain authored prose and therefore require sentences. */
const PROSE_KEYS = new Set([
  "a",
  "answer",
  "blurb",
  "body",
  "caption",
  "copy",
  "description",
  "descriptions",
  "detail",
  "details",
  "empty",
  "explanation",
  "fact",
  "facts",
  "helper",
  "helpertext",
  "hint",
  "insight",
  "insights",
  "intro",
  "introduction",
  "knownfor",
  "line",
  "longdescription",
  "message",
  "note",
  "notes",
  "notable",
  "oneliner",
  "outro",
  "question",
  "reason",
  "reasons",
  "shortblurb",
  "shortdescription",
  "summary",
  "tagline",
  "text",
  "tip",
  "tips",
  "why",
]);

/** These keys unambiguously hold prose, so missing terminal punctuation is an
 * error. More flexible keys such as `text`, `caption`, and `hint` are also
 * checked when they look like sentences, but may legitimately be UI labels. */
const STRICT_PROSE_KEYS = new Set([
  "answer",
  "body",
  "copy",
  "description",
  "descriptions",
  "explanation",
  "fact",
  "facts",
  "insight",
  "insights",
  "intro",
  "introduction",
  "knownfor",
  "longdescription",
  "message",
  "note",
  "notes",
  "notable",
  "oneliner",
  "outro",
  "question",
  "shortblurb",
  "shortdescription",
  "tagline",
  "tip",
  "tips",
  "why",
]);

// In curated data registries these fields are descriptive prose. In component
// models the same names often hold compact labels such as source credits,
// filter chips, or distance reasons, which should remain phrases.
const DATA_STRICT_PROSE_KEYS = new Set([
  "blurb",
  "detail",
  "details",
  "reason",
  "reasons",
]);

/** Factual labels in data registries are not prose and must remain verbatim. */
const DATA_LABEL_KEYS = new Set([
  "actionlabel",
  "address",
  "buttonlabel",
  "category",
  "cta",
  "eventname",
  "eyebrow",
  "heading",
  "kicker",
  "label",
  "location",
  "name",
  "overline",
  "placename",
  "schedule",
  "source",
  "title",
  "town",
]);

const ACTION_COPY_KEYS = new Set([
  "actionlabel",
  "buttonlabel",
  "cta",
  "primaryaction",
  "primaryuse",
]);

const LOCKED_TAGLINE = "Around here.";

function normalizeKey(key: string): string {
  return key.toLowerCase().replace(/[\s'"_-]/g, "");
}

function nearestPropertyKey(node: ts.Node): string | null {
  let cursor: ts.Node | undefined = node;
  while (cursor.parent) {
    const parent: ts.Node = cursor.parent;
    if (ts.isPropertyAssignment(parent)) {
      if (parent.name === cursor) return null;
      return normalizeKey(parent.name.getText());
    }
    if (
      ts.isArrayLiteralExpression(parent) ||
      ts.isParenthesizedExpression(parent) ||
      ts.isConditionalExpression(parent) ||
      ts.isAsExpression(parent) ||
      ts.isSatisfiesExpression(parent)
    ) {
      cursor = parent;
      continue;
    }
    break;
  }
  return null;
}

function belongsToPrivateJsonField(node: ts.Node): boolean {
  let cursor: ts.Node | undefined = node;
  while (cursor.parent) {
    const parent: ts.Node = cursor.parent;
    if (ts.isPropertyAssignment(parent)) {
      const raw = parent.name.getText().replace(/^['"]|['"]$/g, "");
      return raw.startsWith("_");
    }
    if (ts.isArrayLiteralExpression(parent) || ts.isParenthesizedExpression(parent)) {
      cursor = parent;
      continue;
    }
    break;
  }
  return false;
}

function proseJsxContainer(node: ts.Node): boolean {
  let cursor: ts.Node | undefined = node;
  while (cursor.parent) {
    const parent: ts.Node = cursor.parent;
    if (ts.isJsxAttribute(parent)) {
      return PROSE_KEYS.has(normalizeKey(parent.name.getText()));
    }
    if (ts.isJsxElement(parent)) {
      const tag = parent.openingElement.tagName.getText().toLowerCase();
      if (tag !== "p") return false;
      const meaningfulChildren = parent.children.filter(
        (child) => !ts.isJsxText(child) || child.text.trim().length > 0,
      );
      return meaningfulChildren.length === 1;
    }
    if (
      ts.isJsxExpression(parent) ||
      ts.isParenthesizedExpression(parent) ||
      ts.isConditionalExpression(parent)
    ) {
      cursor = parent;
      continue;
    }
    break;
  }
  return false;
}

function isInsideActionElement(node: ts.Node): boolean {
  let cursor: ts.Node | undefined = node;
  while (cursor?.parent) {
    const parent: ts.Node = cursor.parent;
    if (ts.isJsxElement(parent)) {
      const tag = parent.openingElement.tagName.getText().toLowerCase();
      if (tag === "button" || tag === "a" || tag === "link") return true;
    }
    if (ts.isJsxAttribute(parent)) {
      const attr = normalizeKey(parent.name.getText());
      return attr === "arialabel" || attr === "ariadescription";
    }
    cursor = parent;
  }
  return false;
}

function isActionCopyContext(node: ts.Node): boolean {
  const key = nearestPropertyKey(node);
  return (key !== null && ACTION_COPY_KEYS.has(key)) || isInsideActionElement(node);
}

function contextualMarketingHits(
  node: ts.Node,
  raw: string,
  file: string,
  forceProse = false,
): Array<{ rule: string; snippet: string }> {
  const text = raw.trim();
  if (!text) return [];

  // "Discover" and "Explore" remain useful search vocabulary and can name a
  // literal route or data concept. They become template copy when they are an
  // instruction to the reader, either in an action or at the start of prose.
  const directImperative = /^\s*(discover|explore)\b/i.exec(raw);
  if (
    directImperative &&
    (forceProse || isActionCopyContext(node) || requiresCompleteSentence(node, raw, file))
  ) {
    return [
      {
        rule: `${directImperative[1].toLowerCase()} as generic action`,
        snippet: context(raw, directImperative.index, directImperative[0].length),
      },
    ];
  }

  // These words have legitimate factual meanings (live music, a real-time bus
  // position, a smart meter). Only the vague marketing constructions are
  // mechanically rejected.
  const vague = /\b(?:smart|live|real[- ]time)\s+(?:experience|solution|lifestyle|journey|platform|possibilities)\b/i.exec(raw);
  if (vague) {
    return [
      {
        rule: "vague marketing claim",
        snippet: context(raw, vague.index, vague[0].length),
      },
    ];
  }

  return [];
}

function requiresCompleteSentence(node: ts.Node, raw: string, file: string): boolean {
  if (file.startsWith("src/app/admin/")) return false;
  if (raw.trim() === LOCKED_TAGLINE) return false;
  const key = nearestPropertyKey(node);
  if (extname(file) === ".json" && key === "a") return true;
  if (key !== null && STRICT_PROSE_KEYS.has(key)) return true;
  if (file.startsWith("src/data/") && key !== null && DATA_STRICT_PROSE_KEYS.has(key)) return true;
  const looksLikeSentence = /[.!?][\])}'\"]*$/.test(raw.trim());
  return (
    (key !== null && PROSE_KEYS.has(key) && looksLikeSentence) ||
    (proseJsxContainer(node) && looksLikeSentence)
  );
}

function wordsIn(sentence: string): string[] {
  return sentence
    .replace(/[.!?]+$/g, "")
    .trim()
    .match(/[A-Za-z][A-Za-z'\u2019-]*/g) ?? [];
}

/**
 * Structural voice checks are intentionally conservative. They only inspect a
 * complete literal made entirely of two-to-four short sentences. This avoids
 * flagging timestamps, URLs, technical diagnostics, abbreviations, or a short
 * sentence embedded in otherwise normal prose.
 */
function structuralHit(
  raw: string,
  requireSentence = false,
  checkFragments = true,
): { rule: string; snippet: string } | null {
  const text = raw.replace(/\s+/g, " ").trim();
  if (!text || /(?:https?:\/\/|[{}<>])/.test(text)) return null;

  const words = wordsIn(text);
  if (requireSentence && words.length >= 1 && !/[.!?][\])}'\"]*$/.test(text)) {
    return { rule: "missing sentence punctuation", snippet: context(text, 0, text.length) };
  }

  const sentences = text.match(SENTENCE_END_RE) ?? [];
  const consumed = sentences.join("").replace(/\s+/g, " ").trim();
  if (
    requireSentence &&
    checkFragments &&
    sentences.length === 1 &&
    consumed === text &&
    words.length >= 2 &&
    words.length <= 12 &&
    !hasLikelyVerb(sentences[0])
  ) {
    return { rule: "sentence fragment", snippet: context(text, 0, text.length) };
  }

  if (sentences.length < 2 || sentences.length > 4 || consumed !== text) return null;

  // Numbers and dotted abbreviations make sentence boundaries too ambiguous
  // for the broad rhythm checks below. Field-scoped sentence checks above are
  // still applied to those strings.
  if (/\d|\b\w+\.\w+\b/.test(text)) return null;

  const wordSets = sentences.map(wordsIn);
  if (wordSets.some((words) => words.length === 0 || words.length > 7)) return null;

  // The familiar generated rhythm: three complete, similarly short beats.
  // Single-word fact labels ("Free. Outdoor. Dogs welcome.") are excluded.
  if (
    sentences.length === 3 &&
    wordSets.every((words) => words.length >= 2 && words.length <= 6) &&
    Math.max(...wordSets.map((words) => words.length)) - Math.min(...wordSets.map((words) => words.length)) <= 2
  ) {
    return { rule: "three short sentences", snippet: context(text, 0, text.length) };
  }

  // Two or more clipped beats with no likely verb read as authored fragments,
  // not ordinary guidance. Require every sentence to be very short and at
  // least two to lack a verb so regular concise instructions are left alone.
  const fragmentCount = sentences.filter((sentence) => !hasLikelyVerb(sentence)).length;
  if (checkFragments && fragmentCount >= 2 && wordSets.every((words) => words.length <= 5)) {
    return { rule: "stacked fragments", snippet: context(text, 0, text.length) };
  }

  return null;
}

function scanText(
  raw: string,
  includeStructure = true,
  requireSentence = false,
  checkFragments = true,
): Array<{ rule: string; snippet: string }> {
  const hits: Array<{ rule: string; snippet: string }> = [];
  const text = raw;
  for (const { rule, re, allow } of BANNED) {
    const forbidden = [...text.matchAll(asGlobal(re))];
    if (forbidden.length === 0) continue;
    const allowed = allow ? [...text.matchAll(asGlobal(allow))] : [];
    for (const match of forbidden) {
      const start = match.index;
      const end = start + match[0].length;
      const isAllowedOccurrence = allowed.some((candidate) => {
        const allowStart = candidate.index;
        const allowEnd = allowStart + candidate[0].length;
        return start < allowEnd && end > allowStart;
      });
      if (!isAllowedOccurrence) {
        hits.push({ rule, snippet: context(text, start, match[0].length) });
      }
    }
  }
  if (includeStructure) {
    const structural = structuralHit(text, requireSentence, checkFragments);
    if (structural) hits.push(structural);
  }
  return hits;
}

function asGlobal(re: RegExp): RegExp {
  return new RegExp(re.source, re.flags.includes("g") ? re.flags : `${re.flags}g`);
}

function context(text: string, idx: number, len: number): string {
  const s = Math.max(0, idx - 24);
  const e = Math.min(text.length, idx + len + 24);
  const slice = text.slice(s, e).replace(/\s+/g, " ").trim();
  return `${s > 0 ? "…" : ""}${slice}${e < text.length ? "…" : ""}`;
}

/** A single-token value ("elevated", "vibrant") is an enum/identifier,
 * never prose. Real copy has whitespace. */
function isEnumLike(v: string | undefined): boolean {
  return !!v && /^[\w-]+$/.test(v.trim());
}

/** True when the literal sits inside a TypeScript type (union, alias,
 * literal type). Those are not copy. */
function inTypeContext(node: ts.Node): boolean {
  let p: ts.Node | undefined = node.parent;
  while (p) {
    if (
      ts.isTypeNode(p) ||
      ts.isTypeAliasDeclaration(p) ||
      ts.isTypeReferenceNode(p) ||
      (ts.isLiteralTypeNode(p) as boolean)
    ) {
      return true;
    }
    p = p.parent;
  }
  return false;
}

/** True when the literal is a className/style/technical attribute value,
 * a CSS-ish value, a module specifier, or a class-name helper arg.
 * `v` is the representative text (joined for template expressions). */
function isNonCopyContext(node: ts.Node, v: string, file: string): boolean {

  // URLs and bare paths are never editorial copy. Real prose never
  // contains "://", and a spaceless slash-path or query string is a
  // route, not a sentence. (Catches the Google Maps "&destination="
  // directions link, etc.)
  if (/:\/\//.test(v)) return true;
  if (!/\s/.test(v.trim()) && (/^\/?[\w.-]+\/[\w./-]*$/.test(v.trim()) || /\?[\w%]+=/.test(v)))
    return true;

  const parent = node.parent;
  if (extname(file) === ".json" && belongsToPrivateJsonField(node)) return true;
  const dataKey = nearestPropertyKey(node);
  if (
    file.startsWith("src/data/") &&
    dataKey &&
    DATA_LABEL_KEYS.has(dataKey) &&
    !ACTION_COPY_KEYS.has(dataKey)
  ) {
    return true;
  }

  // import x from "..." / export ... from "..." / dynamic import.
  if (
    parent &&
    (ts.isImportDeclaration(parent) ||
      ts.isExportDeclaration(parent) ||
      (ts.isCallExpression(parent) &&
        parent.expression.kind === ts.SyntaxKind.ImportKeyword))
  ) {
    return true;
  }

  // JSX attribute value: <a href="..."> etc.
  if (parent && ts.isJsxAttribute(parent)) {
    const attr = parent.name.getText().toLowerCase().replace(/[-_]/g, "");
    if (NON_COPY_ATTRS.has(attr)) return true;
    if (attr.startsWith("data")) return true;
    if (attr.startsWith("aria") && !["arialabel", "ariadescription", "ariaplaceholder", "ariaroledescription", "ariavaluetext"].includes(attr))
      return true;
    if (
      isEnumLike(v) &&
      !STRICT_PROSE_KEYS.has(attr) &&
      !ACTION_COPY_KEYS.has(attr)
    ) {
      return true; // variant="elevated", size="lg"
    }
    return false;
  }

  // {"..."} expression container used as a className/style attribute.
  if (parent && ts.isJsxExpression(parent) && parent.parent && ts.isJsxAttribute(parent.parent)) {
    const attr = parent.parent.name.getText().toLowerCase().replace(/[-_]/g, "");
    if (NON_COPY_ATTRS.has(attr)) return true;
  }

  // clsx("...", ...) / cva(...) / cn(...) argument.
  if (parent && ts.isCallExpression(parent)) {
    const fn = parent.expression.getText().toLowerCase().replace(/[-_]/g, "");
    if (CLASSNAME_FNS.has(fn)) return true;
  }

  // Object property: skip the key; for the value, skip enum-like tokens
  // and known non-copy keys (className, accent, icon, slug, …).
  if (parent && ts.isPropertyAssignment(parent)) {
    if (parent.name === node) return true; // it's the key
    const key = normalizeKey(parent.name.getText());
    if (
      NON_COPY_ATTRS.has(key) ||
      ["accent", "icon", "slug", "kind", "variant", "tone", "size", "key", "url"].includes(key)
    )
      return true;
    const strictProse =
      STRICT_PROSE_KEYS.has(key) ||
      (file.startsWith("src/data/") && DATA_STRICT_PROSE_KEYS.has(key));
    if (
      isEnumLike(v) &&
      !strictProse &&
      !ACTION_COPY_KEYS.has(key)
    ) {
      return true;
    }
    return false;
  }

  return false;
}

function templateSurfaceText(node: ts.TemplateExpression): string {
  let text = node.head.text;
  for (const span of node.templateSpans) {
    text += `value${span.literal.text}`;
  }
  return text;
}

function jsxSurfaceText(node: ts.Node): string {
  if (ts.isJsxText(node)) return node.text;
  if (ts.isJsxExpression(node)) {
    const expression = node.expression;
    if (!expression) return "";
    if (ts.isStringLiteral(expression) || ts.isNoSubstitutionTemplateLiteral(expression)) {
      return expression.text;
    }
    if (ts.isTemplateExpression(expression)) return templateSurfaceText(expression);
    return "value";
  }
  if (ts.isJsxElement(node) || ts.isJsxFragment(node)) {
    return node.children.map(jsxSurfaceText).join("");
  }
  if (ts.isJsxSelfClosingElement(node)) {
    return node.tagName.getText().toLowerCase() === "br" ? " " : "value";
  }
  return "";
}

function isMultiChildParagraph(node: ts.Node): node is ts.JsxElement {
  if (!ts.isJsxElement(node)) return false;
  if (node.openingElement.tagName.getText().toLowerCase() !== "p") return false;
  const meaningfulChildren = node.children.filter((child) => jsxSurfaceText(child).trim());
  return meaningfulChildren.length > 1;
}

function walk(file: string, source: ts.SourceFile, out: Finding[]) {
  const json = extname(file) === ".json";
  const visit = (node: ts.Node) => {
    if (isMultiChildParagraph(node)) {
      const text = jsxSurfaceText(node);
      // A <p> is also used as a compact metadata row throughout the app. Only
      // classify an assembled multi-child paragraph as prose when the author
      // supplied sentence punctuation; otherwise we cannot distinguish prose
      // from labels without generating noise.
      const looksLikeSentence = /[.!?][\])}'\"]*$/.test(text.trim());
      if (!file.startsWith("src/app/admin/") && looksLikeSentence) {
        const structural = structuralHit(text, true);
        if (structural) {
          out.push({ file, line: lineOf(source, node.getStart(source)), ...structural });
        }
        for (const hit of contextualMarketingHits(node, text, file, true)) {
          out.push({ file, line: lineOf(source, node.getStart(source)), ...hit });
        }
      }
    } else if (ts.isJsxText(node)) {
      const t = node.text;
      if (t.trim()) {
        for (const h of scanText(t, true, requiresCompleteSentence(node, t, file))) {
          out.push({ file, line: lineOf(source, node.getStart(source)), ...h });
        }
        for (const h of contextualMarketingHits(node, t, file)) {
          out.push({ file, line: lineOf(source, node.getStart(source)), ...h });
        }
      }
    } else if (
      ts.isStringLiteral(node) ||
      ts.isNoSubstitutionTemplateLiteral(node)
    ) {
      const sentenceRequired = requiresCompleteSentence(node, node.text, file);
      if (
        (!json || sentenceRequired) &&
        !inTypeContext(node) &&
        !isNonCopyContext(node, node.text, file)
      ) {
        for (const h of scanText(node.text, true, sentenceRequired)) {
          out.push({ file, line: lineOf(source, node.getStart(source)), ...h });
        }
        for (const h of contextualMarketingHits(node, node.text, file)) {
          out.push({ file, line: lineOf(source, node.getStart(source)), ...h });
        }
      }
    } else if (ts.isTemplateExpression(node)) {
      const text = templateSurfaceText(node);
      if (!inTypeContext(node) && !isNonCopyContext(node, text, file)) {
        const lastLiteral = node.templateSpans.at(-1)?.literal.text ?? node.head.text;
        const authoredWords = wordsIn(
          [node.head.text, ...node.templateSpans.map((span) => span.literal.text)].join(" "),
        );
        const sentenceRequired =
          lastLiteral.length > 0 &&
          authoredWords.length >= 3 &&
          requiresCompleteSentence(node, text, file);
        // The placeholder represents an expression whose grammar is unknowable
        // at lint time. We can still enforce stock language, terminal
        // punctuation, and three-beat rhythm without declaring the placeholder
        // itself an ungrammatical fragment.
        for (const h of scanText(text, true, sentenceRequired, false)) {
          out.push({ file, line: lineOf(source, node.getStart(source)), ...h });
        }
        for (const h of contextualMarketingHits(node, text, file)) {
          out.push({ file, line: lineOf(source, node.getStart(source)), ...h });
        }
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
}

function lineOf(source: ts.SourceFile, pos: number): number {
  return source.getLineAndCharacterOfPosition(pos).line + 1;
}

/** Public test seam: lint one in-memory TS/TSX source without running the CLI. */
export function lintSourceText(file: string, text: string): Finding[] {
  const extension = extname(file);
  const source = ts.createSourceFile(
    file,
    text,
    ts.ScriptTarget.Latest,
    true,
    extension === ".tsx"
      ? ts.ScriptKind.TSX
      : extension === ".json"
        ? ts.ScriptKind.JSON
        : ts.ScriptKind.TS,
  );
  const findings: Finding[] = [];
  walk(file, source, findings);
  return findings;
}

function listSourceFiles(): string[] {
  const files: string[] = [];
  for (const dir of SCAN_DIRS) {
    const abs = join(ROOT, dir);
    if (!existsSync(abs)) continue;
    const stack = [abs];
    while (stack.length) {
      const cur = stack.pop()!;
      for (const ent of readdirSync(cur, { withFileTypes: true })) {
        const p = join(cur, ent.name);
        if (ent.isDirectory()) {
          stack.push(p);
        } else if (
          ent.isFile() &&
          /\.(ts|tsx|json)$/.test(ent.name) &&
          !ent.name.endsWith(".d.ts") &&
          !ent.name.endsWith(".spec.ts") &&
          !ent.name.endsWith(".test.ts") &&
          !ent.name.endsWith(".spec.tsx") &&
          !ent.name.endsWith(".test.tsx")
        ) {
          const rel = relative(ROOT, p);
          if (
            !EXCLUDED_COPY_FILES.has(rel) &&
            (extname(rel) !== ".json" || COPY_JSON_FILES.has(rel))
          ) {
            files.push(p);
          }
        }
      }
    }
  }
  for (const f of SCAN_FILES) {
    const abs = join(ROOT, f);
    if (existsSync(abs) && statSync(abs).isFile()) files.push(abs);
  }
  return [...new Set(files)].sort();
}

// --- Baseline ratchet -------------------------------------------------
// The committed baseline is a ratchet for any explicitly owner-reviewed
// legacy exception. It is currently empty: new authored-copy violations fail
// CI and must not be hidden by casually regenerating the baseline.
const BASELINE_PATH = join(ROOT, "scripts/style-lint-baseline.json");

/** Line-independent signature so unrelated edits do not churn it. */
function sig(f: Finding): string {
  return `${f.file}|${f.rule}|${f.snippet}`;
}

function loadBaseline(): Set<string> {
  if (!existsSync(BASELINE_PATH)) return new Set();
  try {
    const j = JSON.parse(readFileSync(BASELINE_PATH, "utf8")) as { entries?: string[] };
    return new Set(j.entries ?? []);
  } catch {
    return new Set();
  }
}

function main() {
  const update = process.argv.includes("--update");
  const files = listSourceFiles();
  const findings: Finding[] = [];

  for (const abs of files) {
    const text = readFileSync(abs, "utf8");
    findings.push(...lintSourceText(relative(ROOT, abs), text));
  }
  findings.sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line);

  if (update) {
    const entries = [...new Set(findings.map(sig))].sort();
    writeFileSync(
      BASELINE_PATH,
      JSON.stringify(
        { note: "Pre-existing voice debt. Burn down, owner-reviewed; do not grow.", generated: new Date().toISOString(), count: entries.length, entries },
        null,
        2,
      ) + "\n",
    );
    console.log(`style-lint: baseline updated, ${entries.length} entr(ies) recorded.`);
    process.exit(0);
  }

  const baseline = loadBaseline();
  const fresh = findings.filter((f) => !baseline.has(sig(f)));
  const presentSigs = new Set(findings.map(sig));
  const resolved = [...baseline].filter((s) => !presentSigs.has(s)).length;

  for (const f of fresh) {
    console.error(`${f.file}:${f.line}  [${f.rule}]  ${f.snippet}`);
  }

  const baselined = findings.length - fresh.length;
  if (fresh.length === 0) {
    console.log(
      `style-lint: ${files.length} files scanned, 0 new violations` +
        (baselined ? ` (${baselined} pre-existing, baselined)` : "") +
        (resolved ? `; ${resolved} baseline entr(ies) now resolved — run \`npm run style:lint -- --update\` to prune.` : "") +
        ".",
    );
    process.exit(0);
  }

  console.error(
    `\nstyle-lint: ${fresh.length} NEW violation(s) across ${
      new Set(fresh.map((f) => f.file)).size
    } file(s). See docs/VOICE.md. New editorial drift is blocked; ` +
      `fix the lines above. (${baselined} pre-existing issues are baselined.)`,
  );
  process.exit(1);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main();
}
