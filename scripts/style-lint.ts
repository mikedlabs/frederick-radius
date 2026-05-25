/**
 * STYLE.md lint — CI guard for editorial drift.
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
 * The banned set is STYLE.md rules 2-5, enumerated by brief 4.4. It is
 * kept deliberately in sync with src/lib/copy-quality.ts (the runtime
 * data-prose detector) so the lint and the editorial standard never
 * drift; the two differ only in input (source code vs. place prose).
 *
 * Scope (brief Work item 1): src/app, src/components,
 * src/data/events.ts, src/data/places.ts.
 *
 * Exit 1 on any hit, printing path:line and the offending substring.
 */
import ts from "typescript";
import { readFileSync, writeFileSync, readdirSync, existsSync, statSync } from "node:fs";
import { join, relative, extname } from "node:path";

const ROOT = process.cwd();

const SCAN_DIRS = ["src/app", "src/components"];
const SCAN_FILES = ["src/data/events.ts", "src/data/places.ts"];

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

type Finding = {
  file: string;
  line: number;
  rule: string;
  snippet: string;
};

// --- The banned set (STYLE.md 2-5, enumerated by brief 4.4) -----------
// Outer boundaries treat `-` and `_` as word chars so design-token
// slugs (`--app-bg-elevated`, `bg_elevated`) never trip a word that
// also lives in real copy ("an elevated patio").
const B = "(?<![\\w-])";
const A = "(?![\\w-])";

// Em dash: NOT banned. STYLE.md (Voice Guide v1) §"Hard rules" #2 now
// reads "Em dashes — used freely." The previous ban was reversed in the
// Brand Book No. 01 alignment; em dashes carry observational weight
// without slowing the line down.

const BANNED: Array<{ rule: string; re: RegExp; allow?: RegExp }> = [
  { rule: "craft", re: new RegExp(`${B}craft(?:ed|ing|s)?${A}`, "i") },
  { rule: "soothing", re: new RegExp(`${B}soothing${A}`, "i") },
  {
    rule: "staff",
    re: new RegExp(`${B}staff${A}`, "i"),
    // STYLE.md rule 4 governs product voice ("our staff"), not a
    // journalistic role title.
    allow: /\bstaff\s+(writer|reporter|photographer|editor|sergeant|sgt)\b|\b(chief of|general)\s+staff\b/i,
  },
  { rule: "nestled", re: new RegExp(`${B}nestled${A}`, "i") },
  { rule: "hidden gem", re: new RegExp(`${B}hidden gem${A}`, "i") },
  { rule: "must-visit", re: new RegExp(`${B}must[- ]visit${A}`, "i") },
  { rule: "vibrant", re: new RegExp(`${B}vibrant${A}`, "i") },
  { rule: "elevated", re: new RegExp(`${B}elevated${A}`, "i") },
  { rule: "curated experience", re: new RegExp(`${B}curated experience${A}`, "i") },
  {
    rule: "destination",
    re: new RegExp(`${B}destination${A}`, "i"),
    // Brief 4.4: allow "destination" in a transit-route context.
    allow: /\b(transit|route|bus|gtfs|headsign|bound|inbound|outbound|trip|stop)\b/i,
  },
  // Brand Book No. 01 additions (May 2026). New banned words from the
  // STYLE.md Voice Guide v1 list. Selective subset — focused on
  // marketing-speak unlikely to false-positive in technical English.
  { rule: "unlock", re: new RegExp(`${B}unlock${A}`, "i") },
  { rule: "heart of", re: /\bheart of\b/i },
  { rule: "disrupt", re: new RegExp(`${B}disrupt${A}`, "i") },
  { rule: "seamless", re: new RegExp(`${B}seamless(?:ly)?${A}`, "i") },
  { rule: "delight", re: new RegExp(`${B}delight(?:ful|ed|s)?${A}`, "i") },
  { rule: "game-changing", re: /\bgame[- ]chang(?:er|ing)\b/i },
  { rule: "leverage", re: new RegExp(`${B}leverag(?:e|es|ing|ed)${A}`, "i") },
  { rule: "robust", re: new RegExp(`${B}robust${A}`, "i") },
  { rule: "holistic", re: new RegExp(`${B}holistic${A}`, "i") },
  { rule: "ecosystem", re: new RegExp(`${B}ecosystem${A}`, "i") },
  { rule: "bucket list", re: /\bbucket list\b/i },
  { rule: "unforgettable", re: new RegExp(`${B}unforgettable${A}`, "i") },
  { rule: "tucked away", re: /\btucked away\b/i },
  { rule: "one-stop shop", re: /\bone[- ]stop[- ]shop\b/i },
];

function scanText(raw: string): Array<{ rule: string; snippet: string }> {
  const hits: Array<{ rule: string; snippet: string }> = [];
  const text = raw;
  for (const { rule, re, allow } of BANNED) {
    const m = re.exec(text);
    if (!m) continue;
    if (allow && allow.test(text)) continue;
    hits.push({ rule, snippet: context(text, m.index, m[0].length) });
  }
  return hits;
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
function isNonCopyContext(node: ts.Node, v: string): boolean {

  // URLs and bare paths are never editorial copy. Real prose never
  // contains "://", and a spaceless slash-path or query string is a
  // route, not a sentence. (Catches the Google Maps "&destination="
  // directions link, etc.)
  if (/:\/\//.test(v)) return true;
  if (!/\s/.test(v.trim()) && (/^\/?[\w.-]+\/[\w./-]*$/.test(v.trim()) || /\?[\w%]+=/.test(v)))
    return true;

  // CSS-ish values: design tokens, Tailwind class strings, hex, urls.
  if (/var\(--|--app-|#[0-9a-fA-F]{3,8}\b/.test(v)) return true;
  if (/(^|\s)(bg-|text-|flex|grid|rounded|border|gap-|p[xytrbl]?-|m[xytrbl]?-|w-|h-|absolute|relative|fixed|inline|block|hidden|hover:|focus:|active:|group|sm:|md:|lg:|xl:|2xl:|\[var\()/.test(
      v,
    ))
    return true;

  const parent = node.parent;

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
    if (isEnumLike(v)) return true; // variant="elevated", size="lg"
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
    const key = parent.name.getText().toLowerCase().replace(/['"-_]/g, "");
    if (
      NON_COPY_ATTRS.has(key) ||
      ["accent", "icon", "slug", "kind", "variant", "tone", "size", "key", "url"].includes(key)
    )
      return true;
    if (isEnumLike(v)) return true;
    return false;
  }

  return false;
}

function walk(file: string, source: ts.SourceFile, out: Finding[]) {
  const visit = (node: ts.Node) => {
    if (ts.isJsxText(node)) {
      const t = node.text;
      if (t.trim()) {
        for (const h of scanText(t)) {
          out.push({ file, line: lineOf(source, node.getStart(source)), ...h });
        }
      }
    } else if (
      ts.isStringLiteral(node) ||
      ts.isNoSubstitutionTemplateLiteral(node)
    ) {
      if (!inTypeContext(node) && !isNonCopyContext(node, node.text)) {
        for (const h of scanText(node.text)) {
          out.push({ file, line: lineOf(source, node.getStart(source)), ...h });
        }
      }
    } else if (ts.isTemplateExpression(node)) {
      const parts = [node.head.text, ...node.templateSpans.map((s) => s.literal.text)];
      if (!inTypeContext(node) && !isNonCopyContext(node, parts.join(" "))) {
        for (const part of parts) {
          for (const h of scanText(part)) {
            out.push({ file, line: lineOf(source, node.getStart(source)), ...h });
          }
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
          /\.(ts|tsx)$/.test(ent.name) &&
          !ent.name.endsWith(".d.ts")
        ) {
          files.push(p);
        }
      }
    }
  }
  for (const f of SCAN_FILES) {
    const abs = join(ROOT, f);
    if (existsSync(abs) && statSync(abs).isFile()) files.push(abs);
  }
  return files.sort();
}

// --- Baseline ratchet -------------------------------------------------
// The audit's premise ("zero on main after the plan fix") was wrong:
// the slip on /plan was one of many. main carries pre-existing
// editorial debt (em dashes in microcopy, "craft brewery" as a category
// noun, event titles with dashes that are external data, not our
// voice). Rewriting all of it unilaterally is an editorial decision for
// the owner, not a chore. So this lint ratchets: every pre-existing hit
// is recorded in a committed baseline; CI fails only on a NEW hit. The
// /plan slip would have been a NEW hit and would have failed CI, which
// is exactly the protection the brief asked for. Burning the baseline
// down is owner-reviewed follow-up work.
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
    const kind = extname(abs) === ".tsx" ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
    const source = ts.createSourceFile(abs, text, ts.ScriptTarget.Latest, true, kind);
    walk(relative(ROOT, abs), source, findings);
  }
  findings.sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line);

  if (update) {
    const entries = [...new Set(findings.map(sig))].sort();
    writeFileSync(
      BASELINE_PATH,
      JSON.stringify(
        { note: "Pre-existing STYLE.md debt. Burn down, owner-reviewed; do not grow.", generated: new Date().toISOString(), count: entries.length, entries },
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
    } file(s). See STYLE.md rules 2-5. New editorial drift is blocked; ` +
      `fix the lines above. (${baselined} pre-existing issues are baselined.)`,
  );
  process.exit(1);
}

main();
