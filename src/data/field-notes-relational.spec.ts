import { describe, it, expect } from "vitest";
import FIELD_NOTES from "@/data/field-notes.json";

/**
 * Relational-claim guard for the Field Notes moat.
 *
 * Field Notes are the VERIFIED layer — their value is that you can trust them.
 * The one class of claim an agent (or a human) gets wrong is a RELATIONSHIP it
 * can't confirm from a single source: "next door", "same owners", "sister
 * spot", "shares a lot". On 2026-06-17 a note on Isabella's claimed Pistarros
 * was "next door" with the "same owners" (stamped confidence: high) — both
 * false (different streets, ~0.3 mi apart), and the agent had cross-linked the
 * two and written the same wrong claim on BOTH pages.
 *
 * This test flags every note that asserts such a relationship. A new one fails
 * the build until a human either VERIFIES it against a second source and adds
 * it to REVIEWED below (with its status), or removes the claim. The point is
 * that a cross-business relational assertion can never ship unreviewed at
 * "high" confidence again.
 */

// Phrases that assert a relationship across businesses / a specific adjacency
// or ownership an agent can't confirm from one site.
const RELATIONAL = new RegExp(
  [
    "next door",
    "next-door",
    "same owner",
    "same owners",
    "sister (?:spot|restaurant|bar|shop|venue|location)",
    "owned by",
    "run by the same",
    "team behind",
    "from the (?:team|folks) behind",
    "shares? a (?:lot|wall|space|kitchen|building)",
    "shared with",
    "right next to",
    "a few doors",
    "doors down",
  ].join("|"),
  "i",
);

// Slugs whose relational claims have been REVIEWED. Each must stay verifiable.
//   self-ref / true  — the claim is about the venue's OWN sibling operation or
//                       a public landmark; low risk.
//   pending verify   — a named-owner / shared-lot claim consciously LEFT on
//                       2026-06-17 for owner verification (not yet confirmed).
// Do NOT add a slug here without checking the claim against a second source.
const REVIEWED = new Set<string>([
  "jojos-restaurant-tap-house",      // self-ref: parking by JoJo's own address
  "mcclintocks-back-bar",            // true: it IS McClintock Distilling's bar
  "olde-mother-brewing-frederick",   // pending verify: lot "shared with Gravel & Grind"
  "six-wicket-vineyards-myersville", // pending verify: "Family-owned by Ed and Kathy O'Laughlin"
  "the-banyan-frederick",            // pending verify: "Owned by Dan and Staci Caiola"
]);

function textsFor(block: unknown): string[] {
  const out: string[] = [];
  const walk = (v: unknown, key?: string) => {
    if (typeof v === "string") {
      if (key !== "source_url") out.push(v);
    } else if (Array.isArray(v)) {
      v.forEach((x) => walk(x));
    } else if (v && typeof v === "object") {
      for (const [k, val] of Object.entries(v as Record<string, unknown>)) walk(val, k);
    }
  };
  walk(block);
  return out;
}

describe("Field Notes: relational claims must be reviewed", () => {
  const notes = FIELD_NOTES as Record<string, unknown>;

  it("flags no UNREVIEWED next-door / same-owner / sister-spot / shared-lot claim", () => {
    const offenders: Array<{ slug: string; text: string }> = [];
    for (const [slug, block] of Object.entries(notes)) {
      if (REVIEWED.has(slug)) continue;
      for (const t of textsFor(block)) {
        if (RELATIONAL.test(t)) {
          offenders.push({ slug, text: t.slice(0, 120) });
          break;
        }
      }
    }
    expect(
      offenders,
      `Unreviewed relational claim(s) in field-notes.json — verify against a ` +
        `second source and add the slug to REVIEWED (with status), or remove ` +
        `the claim:\n${offenders.map((o) => `  ${o.slug}: ${o.text}`).join("\n")}`,
    ).toEqual([]);
  });

  it("keeps the REVIEWED allowlist honest (no stale entries that no longer carry a relational claim)", () => {
    // If a reviewed claim is later removed, drop its slug from REVIEWED so the
    // allowlist never grants a free pass to a slug that could regain one.
    const stale: string[] = [];
    for (const slug of REVIEWED) {
      const block = notes[slug];
      const has = block ? textsFor(block).some((t) => RELATIONAL.test(t)) : false;
      if (!has) stale.push(slug);
    }
    expect(stale, `REVIEWED has slugs with no current relational claim: ${stale.join(", ")}`).toEqual([]);
  });
});
