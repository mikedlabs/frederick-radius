import { Buffer as NodeBuffer } from "node:buffer";
import { readFileSync } from "node:fs";
import path from "node:path";
import ts from "typescript";
import { afterEach, describe, expect, it, vi } from "vitest";
import { decodeSavedPlanToken, decodeSpec, encodeSpec, MAX_SAVED_PLAN_JSON_BYTES, shareSafeInputs, type PlanInputs, type PlanSpec } from "@/lib/plan/plan-token";

const inputs: PlanInputs = {
  audience: "friends", vibe: "cultural", duration_hours: 6,
  start_at: "2026-10-12T17:00:00.000Z", municipality: "frederick",
  max_distance_m: 2_400, local_only: true, budget: "value",
  require_wheelchair_access: true, parking_priority: false, max_stops: 3,
  anchor_slug: "library", event_anchor_slug: "afternoon-concert",
  require_verified_hours: false, seed: 37,
};

function spec(overrides: Partial<PlanInputs> = {}): PlanSpec {
  return { v: 1, i: { ...inputs, ...overrides }, s: [{ p: "library" }, { e: "afternoon-concert" }, { p: "dinner" }] };
}

function rawToken(value: unknown): string {
  return NodeBuffer.from(JSON.stringify(value), "utf8").toString("base64url");
}

afterEach(() => vi.unstubAllGlobals());

describe("plan token compatibility", () => {
  it("round-trips every original input and ordered place/event reference", () => {
    const original = spec();
    const token = encodeSpec(original);
    expect(token).toBe(rawToken(original));
    expect(decodeSpec(token)).toEqual(original);
    expect(decodeSavedPlanToken(token)).toEqual(original);
  });

  it("removes only exact device coordinates from encoding without mutating inputs", () => {
    const start_near = { lng: -77.412345, lat: 39.412345 };
    const original = spec({ start_near });
    const safe = shareSafeInputs(original.i);
    expect(safe).toEqual(inputs);
    expect(original.i.start_near).toEqual(start_near);
    expect(decodeSpec(encodeSpec(original))).toEqual(spec());
  });

  it("keeps older minimal shared specs valid", () => {
    const original: PlanSpec = { v: 1, i: { audience: "solo", vibe: "easy", duration_hours: 2 }, s: [{ p: "library" }] };
    expect(decodeSpec(encodeSpec(original))).toEqual(original);
    expect(decodeSavedPlanToken(encodeSpec(original))).toEqual(original);
  });

  it.each([160, 200])("preserves an accepted %i-character event identity", (length) => {
    const slug = "a".repeat(length);
    const original = { ...spec({ event_anchor_slug: slug }), s: [{ e: slug }, { p: "library" }] };
    expect(decodeSpec(encodeSpec(original))).toEqual(original);
    expect(decodeSavedPlanToken(encodeSpec(original))).toEqual(original);
  });

  it.each(["constructor", "prototype", "a".repeat(201), "invalid/slug", ""])("retains the event identity refusal for %s", (slug) => {
    const token = rawToken({ ...spec(), s: [{ e: slug }] });
    expect(decodeSpec(token)).toBeNull();
    expect(decodeSavedPlanToken(token)).toBeNull();
    expect(decodeSpec(rawToken(spec({ event_anchor_slug: slug })))).toBeNull();
  });

  it.each([
    null, {}, { v: 2, i: inputs, s: [] }, { v: 1, s: [] },
    { ...spec(), s: null }, { ...spec(), s: Array.from({ length: 9 }, () => ({ p: "library" })) },
    { ...spec(), s: [null] }, { ...spec(), s: [{ p: "" }] },
    { ...spec(), s: [{ p: "a".repeat(160) }] }, { ...spec(), s: [{ e: 12 }] },
    spec({ audience: "crowd" as PlanInputs["audience"] }),
    spec({ vibe: "loud" as PlanInputs["vibe"] }),
    spec({ duration_hours: 5 as PlanInputs["duration_hours"] }),
    spec({ start_at: "not-a-date" }), spec({ municipality: "constructor" }),
  ])("retains malformed spec rejection for %#", (value) => {
    const token = rawToken(value);
    expect(decodeSpec(token)).toBeNull();
    expect(decodeSavedPlanToken(token)).toBeNull();
  });

  it("preserves UTF-8 fields using browser globals without Buffer", () => {
    const original = { ...spec(), s: [{ p: "café" }, { e: "afternoon-concert" }] };
    const token = rawToken(original);
    vi.stubGlobal("Buffer", undefined);
    expect(encodeSpec(original)).toBe(token);
    expect(decodeSpec(token)).toEqual(original);
    expect(decodeSavedPlanToken(token)).toEqual(original);
  });
});

describe("saved token boundary", () => {
  it("retains exact legacy coordinates, extra fields, and object/reference order", () => {
    const original = {
      v: 1, s: [{ e: "afternoon-concert", label: "Original choice" }, { p: "library" }],
      i: { ...inputs, start_near: { lng: -77.412345, lat: 39.412345 }, legacy_note: "Keep this field." },
      legacy_field: "Original metadata",
    };
    const token = rawToken(original);
    const result = decodeSavedPlanToken(token);
    expect(result).toEqual(original);
    expect(JSON.stringify(result)).toBe(JSON.stringify(original));
    expect(rawToken(result)).toBe(token);
  });

  it.each([
    { max_distance_m: 0 }, { max_distance_m: -1 }, { max_distance_m: "2400" },
    { max_stops: 0 }, { max_stops: 2.5 }, { max_stops: 9 },
    { seed: Number.MAX_SAFE_INTEGER + 1 }, { seed: 1.5 },
    { budget: "expensive" }, { local_only: "true" }, { require_wheelchair_access: 1 },
    { parking_priority: null }, { require_verified_hours: "false" },
    { start_at: 1791824400000 }, { start_at: "" }, { municipality: "" },
    { anchor_slug: "" }, { anchor_slug: "a".repeat(160) }, { anchor_slug: 12 },
    { start_near: null }, { start_near: [] }, { start_near: { lng: -181, lat: 39 } },
    { start_near: { lng: -77, lat: 91 } }, { start_near: { lng: "-77", lat: 39 } },
    { start_near: { lng: -77 } },
  ])("refuses invalid optional fields without changing legacy decoding: %#", (overrides) => {
    const original = spec(overrides as Partial<PlanInputs>);
    const token = rawToken(original);
    // Extraction must not tighten the general planner contract incidentally.
    expect(decodeSpec(token)).toEqual(original);
    expect(decodeSavedPlanToken(token)).toBeNull();
  });

  it("refuses an ambiguous dual place/event reference without choosing a side", () => {
    const original = { ...spec(), s: [{ p: "library", e: "afternoon-concert" }] };
    const token = rawToken(original);
    expect(decodeSpec(token)).toEqual(original);
    expect(decodeSavedPlanToken(token)).toBeNull();
  });

  it.each([null, undefined, 12, {}, "", "a", "!invalid", "{not-json}"])("refuses malformed raw input for %#", (token) => {
    expect(decodeSavedPlanToken(token)).toBeNull();
  });

  it("rejects non-URL-safe, padded, and alternate-bit tokens without normalizing identity", () => {
    const original = { v: 1, i: { audience: "solo", vibe: "easy", duration_hours: 2 }, s: [{ p: "a" }] };
    const token = rawToken(original);
    expect(token.length % 4).not.toBe(0);
    const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
    const last = alphabet.indexOf(token.at(-1)!);
    const alternate = token.slice(0, -1) + alphabet[last + 1];
    expect(decodeSpec(alternate)).toEqual(original);
    expect(decodeSavedPlanToken(alternate)).toBeNull();
    expect(decodeSavedPlanToken(token + "=")).toBeNull();
    expect(decodeSavedPlanToken(" " + token)).toBeNull();
    expect(decodeSavedPlanToken(token + "\n")).toBeNull();
  });

  it("rejects invalid UTF-8 before persistence in both runtime branches", () => {
    const prefix = NodeBuffer.from('{"v":1,"i":{"audience":"solo","vibe":"easy","duration_hours":2},"s":[{"p":"');
    const suffix = NodeBuffer.from('"}]}');
    const token = NodeBuffer.concat([prefix, NodeBuffer.from([0xff]), suffix]).toString("base64url");
    expect(decodeSpec(token)?.s).toEqual([{ p: "�" }]);
    expect(decodeSavedPlanToken(token)).toBeNull();
    vi.stubGlobal("Buffer", undefined);
    expect(decodeSpec(token)).toBeNull();
    expect(decodeSavedPlanToken(token)).toBeNull();
  });

  it("bounds raw input before decode and permits the exact decoded-byte boundary", () => {
    const atobSpy = vi.spyOn(globalThis, "atob");
    try {
      expect(decodeSavedPlanToken("a".repeat(8_001))).toBeNull();
      expect(atobSpy).not.toHaveBeenCalled();
    } finally {
      atobSpy.mockRestore();
    }
    const base = { ...spec(), bounded_metadata: "" };
    const size = NodeBuffer.byteLength(JSON.stringify(base), "utf8");
    const bounded = { ...base, bounded_metadata: "x".repeat(MAX_SAVED_PLAN_JSON_BYTES - size) };
    const token = rawToken(bounded);
    expect(token).toHaveLength(8_000);
    expect(decodeSavedPlanToken(token)).toEqual(bounded);
    const tooLarge = rawToken({ ...bounded, bounded_metadata: bounded.bounded_metadata + "x" });
    expect(decodeSpec(tooLarge)).toBeNull();
    expect(decodeSavedPlanToken(tooLarge)).toBeNull();
  });

  it("keeps runtime dependencies catalog-free and browser-safe", () => {
    const visited = new Set<string>();
    function visit(relative: string) {
      if (visited.has(relative)) return;
      visited.add(relative);
      const source = readFileSync(path.join(process.cwd(), relative), "utf8");
      const emitted = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
      const parsed = ts.createSourceFile(relative, emitted, ts.ScriptTarget.ES2022, true);
      function inspect(node: ts.Node) {
        let dependency: string | undefined;
        if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) dependency = node.moduleSpecifier.text;
        if (ts.isCallExpression(node) && (node.expression.kind === ts.SyntaxKind.ImportKeyword || (ts.isIdentifier(node.expression) && node.expression.text === "require"))) {
          expect(node.arguments).toHaveLength(1);
          expect(ts.isStringLiteral(node.arguments[0])).toBe(true);
          dependency = (node.arguments[0] as ts.StringLiteral).text;
        }
        if (dependency) {
          expect(dependency).toMatch(/^@\//);
          visit(`src/${dependency.slice(2)}.ts`);
        }
        ts.forEachChild(node, inspect);
      }
      inspect(parsed);
    }
    visit("src/lib/plan/plan-token.ts");
    expect([...visited].sort()).toEqual([
      "src/data/municipalities.ts",
      "src/lib/events/resolvable-event-slug.ts",
      "src/lib/plan/plan-token.ts",
    ]);
  });
});
