import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

/**
 * Hours copy must not guess. Confirmed hours state the time
 * ("Open until 9 PM", "Opens 4 PM"). Unconfirmed hours show
 * "Hours not confirmed" or omit the line. docs/VOICE.md.
 *
 * DaypartNeeds.tsx and TodayPlacePreview.tsx stay allowlisted
 * because they are open on #1830. Remove them from the allowlist
 * once that PR drops the banned phrases.
 */

const ROOT = process.cwd();
const SRC = join(ROOT, "src");

const BANNED: Array<{ phrase: string; re: RegExp }> = [
  { phrase: "likely open", re: /\blikely open\b/i },
  { phrase: "likely opens", re: /\blikely opens\b/i },
  { phrase: "call ahead", re: /\bcall ahead\b/i },
  { phrase: "check hours", re: /\bcheck hours\b/i },
  { phrase: "may be open", re: /\bmay be open\b/i },
  { phrase: "probably", re: /\bprobably\b/i },
];

const TEST_FILE = /\.(?:spec|test|stories)\./;

const ALLOWLIST = new Set([
  "src/components/today/DaypartNeeds.tsx",
  "src/components/today/TodayPlacePreview.tsx",
]);

const SKIP_DIR = new Set(["integrations", "loaders"]);

function stripComments(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "))
    .replace(/\/\/[^\n]*/g, "");
}

function walk(dir: string, files: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) {
      if (SKIP_DIR.has(name)) continue;
      walk(full, files);
      continue;
    }
    if (!/\.(?:ts|tsx)$/.test(name)) continue;
    if (TEST_FILE.test(name)) continue;
    files.push(full);
  }
  return files;
}

describe("hours hedging copy", () => {
  it("does not render banned hours-guessing phrases outside tests", () => {
    const files = [
      ...walk(join(SRC, "app")),
      ...walk(join(SRC, "components")),
      ...walk(join(SRC, "lib")),
      join(SRC, "data", "field-notes.json"),
    ];
    const hits: string[] = [];

    for (const file of files) {
      const rel = relative(ROOT, file).replaceAll("\\", "/");
      if (ALLOWLIST.has(rel)) continue;
      const raw = readFileSync(file, "utf8");
      const src = file.endsWith(".json") ? raw : stripComments(raw);
      const lines = src.split("\n");
      lines.forEach((line, i) => {
        for (const { phrase, re } of BANNED) {
          if (re.test(line)) hits.push(`${rel}:${i + 1}  (${phrase})  ${line.trim().slice(0, 120)}`);
        }
      });
    }

    expect(hits, `Banned hours-hedging phrases in rendered UI strings:\n${hits.join("\n")}`).toEqual([]);
  });
});
