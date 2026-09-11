/**
 * Voice guard for hand-authored field-notes.json. The ESLint no-em-dash rule
 * only covers JSXText, and curated JSON bypasses cleanFeedText — so em dashes
 * authored into field notes used to render raw to users. fieldNotes.ts now
 * deep-cleans every string on read (the boundary, per CLAUDE.md); this asserts
 * the loader output carries no em/en dash, locking the invariant against
 * regressions and against a new dash slipping into the JSON.
 */
import { describe, it, expect } from "vitest";
import RAW from "@/data/field-notes.json" with { type: "json" };
import { fieldNotesFor } from "@/lib/loaders/fieldNotes";

const EM_OR_EN = /[—–]/; // — or –

function collectStrings(value: unknown, out: string[] = []): string[] {
  if (typeof value === "string") out.push(value);
  else if (Array.isArray(value)) for (const v of value) collectStrings(v, out);
  else if (value && typeof value === "object") for (const v of Object.values(value)) collectStrings(v, out);
  return out;
}

describe("field-notes loader sanitizes em/en dashes at the boundary", () => {
  it("no loaded field-note string contains an em or en dash", () => {
    const offenders: string[] = [];
    for (const slug of Object.keys(RAW as Record<string, unknown>)) {
      const fn = fieldNotesFor(slug);
      if (!fn) continue;
      for (const s of collectStrings(fn)) {
        if (EM_OR_EN.test(s)) offenders.push(`${slug}: ${s}`);
      }
    }
    expect(offenders).toEqual([]);
  });
});
