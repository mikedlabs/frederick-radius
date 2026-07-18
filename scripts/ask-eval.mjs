#!/usr/bin/env node
/**
 * Golden-question eval for Ask Frederick (/api/ask).
 *
 * Born from the July 2026 Reddit screenshot ("I don't have today's date in
 * the data") — every failure class we've shipped a fix for becomes a
 * standing question here, so the NEXT regression is caught by this script
 * instead of by a stranger with a screenshot. Run it against prod after
 * every deploy that touches ask, events, or hours:
 *
 *   BASE_URL=https://frederickradius.app COOKIE_JAR=/path/to/beta.jar node scripts/ask-eval.mjs
 *
 * COOKIE_JAR is a Netscape-format jar (curl -c) holding the beta cookie;
 * omit it for a non-gated environment. Exits 1 if any check fails.
 * Note the route's rate limit (15/min per IP) — the question list must
 * stay under it.
 */

const BASE = process.env.BASE_URL ?? "https://frederickradius.app";

// Failures that are NEVER acceptable in any answer, whatever the question.
const NEVER = [
  { re: /don'?t (have|know) (today'?s|the) date/i, why: "date-blindness (the original Reddit failure)" },
  { re: /\*\*|(^|\s)\*\S[^*]*\*/m, why: "raw markdown emphasis reached the user" },
  { re: /`/, why: "raw backticks reached the user" },
  { re: /—/, why: "em dash (voice ban, cleaned at the cache boundary)" },
  { re: /as an ai\b/i, why: "chatbot voice" },
  { re: /\[[^\]]+\]\([^)]*\)/, why: "raw markdown link" },
];

const QUESTIONS = [
  {
    q: "Music tonight",
    must: [{ re: /\b\d{1,2}(:\d{2})?\s?(AM|PM)\b/i, why: "a tonight answer names a clock time" }],
  },
  {
    q: "are there any bands playing in frederick today",
    must: [{ re: /music|band|jam|concert|karaoke|no listed/i, why: "answers the music question (or honestly says none)" }],
  },
  {
    q: "coffee open now",
    must: [{ re: /open|closed|hours/i, why: "an open-now answer speaks to open state" }],
  },
  { q: "what should we do this weekend with kids" },
  {
    q: "how do I report a pothole",
    must: [{ re: /report|pothole|city|county/i, why: "civic action grounding" }],
  },
  {
    q: "where can I park downtown",
    must: [{ re: /garage|deck/i, why: "the verified garage dataset is routed in now" }],
  },
  {
    q: "will it rain this weekend",
    must: [{ re: /rain|shower|storm|sunny|clear|cloud|°|degrees/i, why: "the live NWS forecast is routed in now" }],
  },
  { q: "best coffee in frederick" },
  {
    // Tier 2 want-intent planner: "breakfast" is a meal, not a keyword — no
    // place is NAMED breakfast, so this failed with a shrug before the
    // buildWantAnswer routing. The answer must engage the meal, not deflect.
    q: "good breakfast spot downtown",
    must: [{ re: /breakfast|brunch|coffee|caf[eé]|bak(ery|ed)|diner/i, why: "the ranked breakfast picks are routed in now" }],
  },
  {
    // A show can be a fixed appointment, not something Radius was asked to
    // discover. This once fell into the live-music fallback and ignored the
    // dinner job entirely.
    q: "I need a quiet dinner downtown before a 7:30 show tonight",
    must: [
      { re: /dinner|restaurant/i, why: "answers the dinner job" },
      { re: /7:30|before (?:the |a )?show/i, why: "keeps the fixed show deadline" },
    ],
    mustNot: [
      { re: /live[- ]music|music calendar/i, why: "does not invent a live-music request" },
    ],
  },
];

import { readFileSync } from "node:fs";

function cookieHeaderFromJar(path) {
  try {
    return readFileSync(path, "utf8")
      .split("\n")
      .filter((l) => l && !l.startsWith("#"))
      .map((l) => l.split("\t"))
      .filter((f) => f.length >= 7)
      .map((f) => `${f[5]}=${f[6]}`)
      .join("; ");
  } catch {
    return "";
  }
}

const cookie = process.env.COOKIE_JAR ? cookieHeaderFromJar(process.env.COOKIE_JAR) : "";

let failures = 0;
for (const { q, must = [], mustNot = [] } of QUESTIONS) {
  const started = Date.now();
  let d;
  try {
    const res = await fetch(`${BASE}/api/ask`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        origin: BASE,
        ...(cookie ? { cookie } : {}),
      },
      body: JSON.stringify({ query: q }),
    });
    d = await res.json();
  } catch (e) {
    console.log(`✗ "${q}" — request failed: ${e}`);
    failures++;
    continue;
  }
  const ms = Date.now() - started;
  const problems = [];
  if (!d.configured) problems.push("configured=false (no AI provider reachable)");
  if (!d.answer) problems.push("no answer");
  if (!Array.isArray(d.sources) || d.sources.length === 0) problems.push("no sources");
  if (d.answer) {
    for (const { re, why } of NEVER) if (re.test(d.answer)) problems.push(`NEVER: ${why}`);
    for (const { re, why } of must) if (!re.test(d.answer)) problems.push(`MISSING: ${why}`);
    for (const { re, why } of mustNot) if (re.test(d.answer)) problems.push(`FORBIDDEN: ${why}`);
  }
  if (problems.length) {
    failures++;
    console.log(`✗ "${q}" (${ms}ms)`);
    for (const p of problems) console.log(`    - ${p}`);
    console.log(`    answer: ${(d.answer ?? "(none)").slice(0, 220)}`);
  } else {
    console.log(`✓ "${q}" (${ms}ms) — ${(d.answer ?? "").slice(0, 90)}...`);
  }
  // Stay well under the 15/min per-IP rate limit.
  await new Promise((r) => setTimeout(r, 3000));
}

console.log(failures === 0 ? "\nPASS — every golden question holds." : `\nFAIL — ${failures} question(s) regressed.`);
process.exit(failures === 0 ? 0 : 1);
