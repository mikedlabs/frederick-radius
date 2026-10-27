import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, readdirSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { classifyOfficialCommerceLinks } from "../scripts/lib/official-commerce-links";
import { mergeCommerceRefresh } from "../scripts/lib/official-commerce-refresh";
import {
  commerceSemanticValue, createNativeCommerceEvidenceWriter, fetchNativeCommercePage, nativeCommerceUrl, parseNativeCommerceOptions,
  runNativeCommerceRefresh, selectNativeCommerceRoster, type NativeCommerceEvidence, type NativeCommercePlace,
} from "../scripts/lib/native-commerce-refresh";
import { main } from "../scripts/refresh-official-commerce-links";
import { intakeOfficialListingEvidence } from "../scripts/lib/official-listing-intake";
import { resolveCommerceLinks, selectCardCommerceActions } from "@/lib/commerce/links";

const NOW = new Date("2026-10-20T12:00:00.000Z");
const REVISION = "a".repeat(40);
const place = (slug = "declared-coffee"): NativeCommercePlace => ({ slug, name: "Declared Coffee", category: "coffee", website: "https://declaredcoffee.com/", postal_code: "21701" });
const html = (body = '<a href="/menu">View menu</a>') => new Response(body, { headers: { "content-type": "text/html; charset=utf-8" } });
const options = { limit: 20, followPages: 0 as const, plan: false };
const run = (patch: Partial<Parameters<typeof runNativeCommerceRefresh>[0]> = {}) => runNativeCommerceRefresh({ places: [place()], existing: {}, excludedDomains: [], now: NOW, observationClock: () => NOW, options, ...patch });
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

describe("native daily deterministic roster", () => {
  it("rotates the full eligible roster before filtering fresh successes with no refill", () => {
    const all = Array.from({ length: 50 }, (_, i) => place(`p-${String(i).padStart(2, "0")}`));
    const first = selectNativeCommerceRoster(all, {}, NOW, [], 20);
    const existing = Object.fromEntries(first.roster.map((p) => [p.slug, { commerce_source: { url: p.website!, checkedAt: NOW.toISOString() } }]));
    const skipped = selectNativeCommerceRoster(all, existing, NOW, [], 20);
    expect(skipped.roster).toEqual(first.roster);
    expect(skipped.selected).toEqual([]);
    const tomorrow = selectNativeCommerceRoster(all, {}, new Date(NOW.getTime() + 86_400_000), [], 20);
    expect(tomorrow.roster.map((p) => p.slug)).not.toEqual(first.roster.map((p) => p.slug));
    const covered = new Set([0, 1, 2].flatMap((day) => selectNativeCommerceRoster(all, {}, new Date(NOW.getTime() + day * 86_400_000), [], 20).roster.map((p) => p.slug)));
    expect(covered.size).toBe(50);
    expect(selectNativeCommerceRoster([...all].reverse(), {}, NOW, [], 20)).toEqual(first);
  });
  it("cannot let permanently failing first sites starve later candidates", async () => {
    const all = Array.from({ length: 40 }, (_, i) => place(`p-${String(i).padStart(2, "0")}`));
    const a = selectNativeCommerceRoster(all, {}, NOW, [], 20);
    const b = selectNativeCommerceRoster(all, {}, new Date(NOW.getTime() + 86_400_000), [], 20);
    expect(a.roster).toHaveLength(20); expect(b.roster).toHaveLength(20);
    expect(new Set([...a.roster, ...b.roster].map((p) => p.slug)).size).toBe(40);
  });
  it("does not treat future observations or another source URL as fresh", () => {
    const p = place();
    for (const source of [{ url: p.website!, checkedAt: "2027-01-01T00:00:00Z" }, { url: "https://elsewhere.com/", checkedAt: NOW.toISOString() }]) expect(selectNativeCommerceRoster([p], { [p.slug]: { commerce_source: source } }, NOW, [], 20).selected).toEqual([p]);
  });
  it("admits only public HTTPS business-owned sites and enforces hard queue inputs", () => {
    const invalid = [place("http"), place("directory"), place("wrong"), { ...place("park"), category: "park" }];
    invalid[0].website = "http://declaredcoffee.com/"; invalid[1].website = "https://yelp.com/declared"; invalid[2].website = "https://unrelated.com/";
    expect(selectNativeCommerceRoster(invalid, {}, NOW, [], 20).eligible).toEqual([]);
    expect(() => selectNativeCommerceRoster([place(), place()], {}, NOW, [])).toThrow("duplicate");
    expect(() => selectNativeCommerceRoster([place()], {}, NOW, [], 21)).toThrow();
    expect(() => selectNativeCommerceRoster([place()], {}, new Date("bad"), [])).toThrow();
  });
  it.each(["--limit=21", "--limit=0", "--force", "--slug=declared", "--max-follow=2", "--concurrency=8", "--live"])("rejects unsafe daily flag %s", (flag) => {
    expect(() => parseNativeCommerceOptions(["--native-daily", flag])).toThrow();
  });
  it("supports the zero-network plan and0/1 follow ceiling", () => {
    expect(parseNativeCommerceOptions(["--native-daily", "--plan", "--max-follow=0", "--limit=2"])).toEqual({ limit: 2, plan: true, followPages: 0 });
    expect(() => parseNativeCommerceOptions(["--native-daily", "--limit=2", "--limit=3"])).toThrow("Duplicate");
  });
});

describe("native free HTTP budget", () => {
  it("gets only the exact reviewed host without credentials, redirects, retries or execution", async () => {
    const fetch = vi.fn<typeof globalThis.fetch>(async () => html('<script>globalThis.unwanted=true</script><a href="/menu">View menu</a>'));
    const page = await fetchNativeCommercePage(place().website!, place().website!, { fetchImpl: fetch });
    expect(page.links).toEqual([{ url: "https://declaredcoffee.com/menu", text: "View menu" }]);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch.mock.calls[0][1]).toMatchObject({ method: "GET", credentials: "omit", redirect: "error", referrerPolicy: "no-referrer" });
    expect((globalThis as Record<string, unknown>).unwanted).toBeUndefined();
  });
  it("holds a response whose reported URL differs from the requested source", async () => {
    const response = html();
    Object.defineProperty(response, "url", { value: "https://elsewhere.example/" });
    const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(response);
    const capture = vi.fn();
    await expect(fetchNativeCommercePage(place().website!, place().website!, { fetchImpl: fetch, onEvidence: capture }))
      .rejects.toThrow("failed or redirected");
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(capture).not.toHaveBeenCalled();
  });
  it.each(["http://declaredcoffee.com/", "https://other.declaredcoffee.com/", "https://user:password@declaredcoffee.com/", "https://127.0.0.1/", "https://declaredcoffee.local/", "https://declaredcoffee.com:444/"])("rejects unsupported destination %s before fetch", async (url) => {
    const fetch = vi.fn();
    await expect(fetchNativeCommercePage(url, place().website!, { fetchImpl: fetch })).rejects.toThrow();
    expect(fetch).not.toHaveBeenCalled();
  });
  it("bounds both declared and streamed bytes and caps extracted anchors at1000", async () => {
    const declared = vi.fn<typeof globalThis.fetch>(async () => new Response("large", { headers: { "content-type": "text/html", "content-length": "524289" } }));
    await expect(fetchNativeCommercePage(place().website!, place().website!, { fetchImpl: declared })).rejects.toThrow("body limit");
    await expect(fetchNativeCommercePage(place().website!, place().website!, { maxBytes: 32, fetchImpl: vi.fn<typeof globalThis.fetch>(async () => html("x".repeat(33))) })).rejects.toThrow("body limit");
    const page = await fetchNativeCommercePage(place().website!, place().website!, { fetchImpl: vi.fn<typeof globalThis.fetch>(async () => html(Array.from({ length: 1005 }, (_, i) => `<a href="/p${i}">Page${i}</a>`).join(""))) });
    expect(page.links).toHaveLength(1000);
  });
  it("bounds an endless zero-length stream and cancels after at most2048 reads", async () => {
    let canceled = false; let reads = 0;
    const stream = new ReadableStream<Uint8Array>({ pull(c) { c.enqueue(new Uint8Array(0)); }, cancel() { canceled = true; } });
    const originalGetReader = stream.getReader.bind(stream);
    const defaultReaderStream = stream as unknown as { getReader(): ReadableStreamDefaultReader<Uint8Array> };
    vi.spyOn(defaultReaderStream, "getReader").mockImplementation(() => {
      const reader = originalGetReader(); const originalRead = reader.read.bind(reader);
      vi.spyOn(reader, "read").mockImplementation(() => { reads++; return originalRead(); });
      return reader;
    });
    const fetch = vi.fn<typeof globalThis.fetch>(async () => new Response(stream, { headers: { "content-type": "text/html" } }));
    await expect(fetchNativeCommercePage(place().website!, place().website!, { fetchImpl: fetch })).rejects.toThrow("stream-read limit");
    expect(reads).toBe(2048); expect(canceled).toBe(true); expect(fetch).toHaveBeenCalledTimes(1);
  });
  it("checks absolute body deadline even when immediate chunks prevent a timer turn", async () => {
    let canceled = false; let reads = 0;
    const nativeNow = Date.now();
    vi.spyOn(Date, "now").mockImplementation(() => nativeNow + (reads >= 3 ? 21_000 : 0));
    const stream = new ReadableStream<Uint8Array>({ pull(c) { reads++; c.enqueue(new Uint8Array(0)); }, cancel() { canceled = true; } });
    const fetch = vi.fn<typeof globalThis.fetch>(async () => new Response(stream, { headers: { "content-type": "text/html" } }));
    await expect(fetchNativeCommercePage(place().website!, place().website!, { fetchImpl: fetch })).rejects.toThrow("deadline");
    expect(reads).toBeLessThanOrEqual(4); expect(canceled).toBe(true);
  });
  it("bounds a hanging response header wait, aborts it, and consumes a late response", async () => {
    let release!: (r: Response) => void; let signal: AbortSignal | undefined; let canceled = false;
    const fetch = vi.fn<typeof globalThis.fetch>((_url, init) => { signal = init?.signal as AbortSignal; return new Promise<Response>((resolve) => { release = resolve; }); });
    await expect(fetchNativeCommercePage(place().website!, place().website!, { fetchImpl: fetch, timeoutMs: 15 })).rejects.toThrow("deadline");
    expect(signal?.aborted).toBe(true);
    release(new Response(new ReadableStream({ cancel() { canceled = true; } }), { headers: { "content-type": "text/html" } }));
    await vi.waitFor(() => expect(canceled).toBe(true));
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it("keeps the deadline through an indefinitely stalled body", async () => {
    let canceled = false;
    const stream = new ReadableStream<Uint8Array>({ start(c) { c.enqueue(new TextEncoder().encode("<html>")); }, cancel() { canceled = true; } });
    const fetch = vi.fn<typeof globalThis.fetch>(async () => new Response(stream, { headers: { "content-type": "text/html" } }));
    await expect(fetchNativeCommercePage(place().website!, place().website!, { fetchImpl: fetch, timeoutMs: 15 })).rejects.toThrow("deadline");
    expect(fetch).toHaveBeenCalledTimes(1);
    await vi.waitFor(() => expect(canceled).toBe(true));
  });
  it.each([302, 403, 404, 429, 500])("does not retry or follow status %s", async (status) => {
    const fetch = vi.fn<typeof globalThis.fetch>(async () => new Response("failure", { status, headers: { "content-type": "text/html", location: "https://elsewhere.com/" } }));
    await expect(fetchNativeCommercePage(place().website!, place().website!, { fetchImpl: fetch })).rejects.toThrow();
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});

describe("private evidence from the existing native GETs", () => {
  it("records the actual response URL without inventing one when transport omits it", async () => {
    const parent = mkdtempSync(join(tmpdir(), "radius-commerce-response-url-"));
    const directory = join(parent, "originals");
    const writer = createNativeCommerceEvidenceWriter(directory, REVISION);
    const p = place();
    const responses = [html(), html()];
    Object.defineProperty(responses[0], "url", { value: p.website });
    const fetch = vi.fn<typeof globalThis.fetch>()
      .mockResolvedValueOnce(responses[0]).mockResolvedValueOnce(responses[1]);
    try {
      const capture = (evidence: Parameters<typeof writer.capture>[0], bytes: Uint8Array) => writer.capture(evidence, bytes);
      for (let i = 0; i < 2; i++) {
        await fetchNativeCommercePage(p.website!, p.website!, {
          fetchImpl: fetch, observationClock: () => NOW,
          onEvidence: (evidence, bytes) => capture({ ...evidence, source_revision: REVISION, identity: p }, bytes),
        });
      }
      const index = JSON.parse(readFileSync(join(directory, "index.json"), "utf8"));
      expect(index.records.map((record: { response_url: string | null }) => record.response_url)).toEqual([p.website, null]);
      expect(fetch).toHaveBeenCalledTimes(2);
    } finally { rmSync(parent, { recursive: true, force: true }); }
  });
  it("preserves an exact complete no-anchor response before retaining the commerce failure", async () => {
    const parent = mkdtempSync(join(tmpdir(), "radius-commerce-evidence-"));
    const directory = join(parent, "originals");
    const body = '<html><script type="application/ld+json">{"name":"Declared Café"}</script></html>';
    const original = Buffer.from(body);
    const intake = vi.fn<(evidence: NativeCommerceEvidence) => unknown>(() => ({ schema_version: 1, status: "held", reason_codes: ["review_required"] }));
    const writer = createNativeCommerceEvidenceWriter(directory, REVISION, intake);
    const fetch = vi.fn<typeof globalThis.fetch>(async () => html(body));
    const p = { ...place(), address: "1 Market Street", city: "Frederick", state: "MD", phone: "3015550100", google_photo_url: "must not enter canonical identity" };
    try {
      const result = await run({ places: [p], sourceRevision: REVISION, onEvidence: writer.capture, fetchImpl: fetch });
      writer.finish(result);
      expect(result).toMatchObject({ requests: 1, checked_count: 0, failed_count: 1, evidence_capture_failed: false });
      expect(result.results[0].reason).toContain("No static source anchors");
      expect(result.results[0].pages_read).toBe(1);
      expect(result.records[p.slug]).toBeUndefined();
      expect(fetch).toHaveBeenCalledTimes(1);
      const index = JSON.parse(readFileSync(join(directory, "index.json"), "utf8"));
      expect(index).toMatchObject({ source_revision: REVISION, collection_complete: true, selected: [p.slug] });
      expect(index.records).toHaveLength(1);
      const receipt = index.records[0];
      expect(receipt).toMatchObject({ source_url: p.website, observed_at: NOW.toISOString(), source_sha256: createHash("sha256").update(original).digest("hex"), bytes: original.byteLength,
        content_type: "text/html; charset=utf-8", status: 200, source_revision: REVISION,
        identity: { slug: p.slug, name: p.name, address: p.address, city: p.city, state: p.state, phone: p.phone } });
      expect(receipt.identity).not.toHaveProperty("google_photo_url");
      expect(receipt).not.toHaveProperty("html");
      expect(readFileSync(join(directory, receipt.evidence_file))).toEqual(original);
      expect(JSON.parse(readFileSync(join(directory, receipt.intake_file), "utf8"))).toMatchObject({ status: "held" });
      expect(intake).toHaveBeenCalledTimes(1);
      expect(intake.mock.calls[0][0]).toMatchObject({ html: body, source_sha256: receipt.source_sha256 });
      expect(JSON.stringify(result)).not.toContain(body);
      expect(statSync(directory).mode & 0o777).toBe(0o700);
      for (const file of readdirSync(directory)) expect(statSync(join(directory, file)).mode & 0o777).toBe(0o600);
      expect(() => createNativeCommerceEvidenceWriter(directory, REVISION)).toThrow();
      expect(readFileSync(join(directory, receipt.evidence_file))).toEqual(original);
    } finally { rmSync(parent, { recursive: true, force: true }); }
  });
  it("retains successful home evidence and its own observation when the follow fails", async () => {
    const captures: Parameters<NonNullable<Parameters<typeof runNativeCommerceRefresh>[0]["onEvidence"]>>[0][] = [];
    const old = { name: place().name, description: "Keep approved facts." };
    const observed = new Date("2026-10-20T12:00:09.000Z");
    const fetch = vi.fn<typeof globalThis.fetch>(async (url) => String(url).endsWith("/dining") ? new Response("failed", { status: 503 }) : html('<a href="/dining">Dining</a><a href="/menu">Menu</a>'));
    const result = await run({ existing: { [place().slug]: old }, options: { ...options, followPages: 1 }, sourceRevision: REVISION,
      observationClock: () => observed, onEvidence: (receipt) => { captures.push(receipt); }, fetchImpl: fetch });
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(result.requests).toBe(2); expect(result.failed_count).toBe(1);
    expect(result.records[place().slug]).toBe(old);
    expect(result.results[0]).toMatchObject({ source_url: place().website, failed_url: "https://declaredcoffee.com/dining" });
    expect(captures).toHaveLength(1);
    expect(captures[0]).toMatchObject({ source_url: place().website, observed_at: observed.toISOString(), source_revision: REVISION });
    expect(Object.isFrozen(captures[0])).toBe(true); expect(Object.isFrozen(captures[0].identity)).toBe(true);
  });
  it("keeps a complete original even if the decoded UTF8 cannot reproduce its byte hash", async () => {
    const parent = mkdtempSync(join(tmpdir(), "radius-commerce-byte-evidence-"));
    const directory = join(parent, "originals");
    const original = Buffer.concat([Buffer.from("<html>"), Buffer.from([0xff]), Buffer.from("</html>")]);
    const writer = createNativeCommerceEvidenceWriter(directory, REVISION);
    try {
      const result = await run({ sourceRevision: REVISION, onEvidence: writer.capture,
        fetchImpl: vi.fn<typeof globalThis.fetch>(async () => new Response(original, { headers: { "content-type": "text/html" } })) });
      writer.finish(result);
      const index = JSON.parse(readFileSync(join(directory, "index.json"), "utf8"));
      const receipt = index.records[0];
      const saved = readFileSync(join(directory, receipt.evidence_file));
      expect(saved).toEqual(original);
      expect(receipt.source_sha256).toBe(createHash("sha256").update(original).digest("hex"));
      expect(createHash("sha256").update(saved.toString("utf8")).digest("hex")).not.toBe(receipt.source_sha256);
      expect(result.records[place().slug]).toBeUndefined();
    } finally { rmSync(parent, { recursive: true, force: true }); }
  });
  it("holds an exceptional listing extractor without blocking valid commerce or losing the original", async () => {
    const parent = mkdtempSync(join(tmpdir(), "radius-commerce-intake-failure-"));
    const directory = join(parent, "originals");
    const original = '<a href="/menu">Menu</a>';
    const writer = createNativeCommerceEvidenceWriter(directory, REVISION, () => { throw new Error("extractor failed"); });
    try {
      const result = await run({ sourceRevision: REVISION, onEvidence: writer.capture, fetchImpl: vi.fn<typeof globalThis.fetch>(async () => html(original)) });
      writer.finish(result);
      expect(result).toMatchObject({ evidence_capture_failed: false, requests: 1, checked_count: 1, failed_count: 0 });
      const index = JSON.parse(readFileSync(join(directory, "index.json"), "utf8"));
      expect(index.collection_complete).toBe(true);
      expect(index.records).toHaveLength(1);
      expect(readFileSync(join(directory, index.records[0].evidence_file), "utf8")).toBe(original);
      const held = JSON.parse(readFileSync(join(directory, index.records[0].intake_file), "utf8"));
      expect(held).toMatchObject({ status: "held", reasons: ["intake_exception"], candidates: {} });
      expect(result.records[place().slug].commerce_links?.[0]).toMatchObject({ type: "menu", url: "https://declaredcoffee.com/menu" });
      expect(writer.summary().held_candidates).toEqual([held]);
      expect(JSON.stringify(writer.summary())).not.toContain(original);
    } finally { rmSync(parent, { recursive: true, force: true }); }
  });
  it("keeps real commerce usable when the listing intake has no structured identity or hours", async () => {
    const parent = mkdtempSync(join(tmpdir(), "radius-commerce-held-intake-"));
    const directory = join(parent, "originals");
    const writer = createNativeCommerceEvidenceWriter(directory, REVISION, (receipt) => intakeOfficialListingEvidence(receipt, NOW));
    try {
      const result = await run({ sourceRevision: REVISION, onEvidence: writer.capture,
        fetchImpl: vi.fn<typeof globalThis.fetch>(async () => html('<a href="/menu">View menu</a><p>Call us for current hours.</p>')) });
      writer.finish(result);
      expect(result).toMatchObject({ checked_count: 1, failed_count: 0, requests: 1, evidence_capture_failed: false });
      expect(result.records[place().slug].commerce_links?.[0].url).toBe("https://declaredcoffee.com/menu");
      expect(writer.summary().held_candidates[0]).toMatchObject({ status: "held", candidates: {} });
      expect(result.records[place().slug]).not.toHaveProperty("hours");
      expect(result.records[place().slug]).not.toHaveProperty("phone");
    } finally { rmSync(parent, { recursive: true, force: true }); }
  });
  it("holds only the source whose original evidence sink fails and continues unrelated records", async () => {
    const old = { description: "Keep approved facts.", commerce_source: { url: place().website!, checkedAt: "2026-08-01T00:00:00Z" } };
    const capture = vi.fn((evidence: NativeCommerceEvidence) => { if (evidence.identity.slug === "a-bad") throw new Error("unavailable original sink"); });
    const fetch = vi.fn<typeof globalThis.fetch>(async () => html());
    const result = await run({ places: [place("a-bad"), place("b-good"), place("c-tail")], existing: { "a-bad": old },
      sourceRevision: REVISION, onEvidence: capture, fetchImpl: fetch });
    expect(result).toMatchObject({ evidence_capture_failed: true, requests: 3, checked_count: 2, failed_count: 1 });
    expect(fetch).toHaveBeenCalledTimes(3); expect(capture).toHaveBeenCalledTimes(3);
    expect(result.records["a-bad"]).toBe(old);
    expect(result.results.find((row) => row.slug === "a-bad")?.reason).toContain("this source is held");
    for (const slug of ["b-good", "c-tail"]) expect(result.records[slug].commerce_links?.[0].url).toBe("https://declaredcoffee.com/menu");
  });
  it("does not retain a failed status or a partial oversized response as complete evidence", async () => {
    const capture = vi.fn();
    for (const response of [new Response("bad", { status: 503 }), html("x".repeat(524289))]) {
      const result = await run({ sourceRevision: REVISION, onEvidence: capture, fetchImpl: vi.fn<typeof globalThis.fetch>(async () => response) });
      expect(result.requests).toBe(1); expect(result.failed_count).toBe(1);
    }
    expect(capture).not.toHaveBeenCalled();
  });
  it("uploads private originals separately without adding them to the public publisher allowlist", () => {
    const workflow = readFileSync(".github/workflows/refresh-commerce-links.yml", "utf8");
    expect(workflow).toContain("NATIVE_COMMERCE_EVIDENCE_DIR: ${{ runner.temp }}/native-commerce-evidence");
    expect(workflow).toContain("name: official-commerce-source-evidence-${{ github.run_id }}-${{ github.run_attempt }}");
    expect(workflow).toContain("path: ${{ runner.temp }}/native-commerce-evidence");
    const publishing = workflow.slice(workflow.indexOf("      - name: Stage exact commerce-link output"));
    expect(publishing).not.toContain("native-commerce-evidence");
    expect(workflow).toContain("--native-daily --limit=20 --max-follow=1");
  });
});

describe("daily records and review handoff", () => {
  it.each([
    { name: "Thai Meric Eatery & Bar", slug: "thai-meric-eatery-bar-frederick", website: "https://www.thaimeric.com/", category: "restaurant", html: '<a href="/menu/khao-soi">Khao Soi</a><a href="/menu">Menu</a><a href="/menu/pad-thai">Pad Thai</a>', expected: "https://www.thaimeric.com/menu" },
    { name: "Tous les Jours Bakery & Cafe", slug: "tous-les-jours-bakery-cafe-frederick", website: "https://tljus.com/stores/frederick-1170-g-west-patrick-st?utm_source=google&utm_medium=gbp&utm_campaign=frederick", category: "bakery", html: '<a href="/menus/all">View Full Menu</a><a href="/menus/bread">BREAD</a><a href="/menus/cakes">CAKES</a>', expected: "https://tljus.com/menus/all" },
  ])("preserves classifier menu priority through actual card-action selection for $name", async (p) => {
    const result = await run({ places: [p], fetchImpl: vi.fn<typeof globalThis.fetch>(async () => html(p.html)) });
    expect(result.checked_count).toBe(1);
    const imported = result.records[p.slug].commerce_links!.map((link) => ({ ...link, provider: "website" as const, source: "imported" as const }));
    const selected = selectCardCommerceActions(resolveCommerceLinks({ slug: p.slug, commerce_links: imported }));
    expect(selected.find((link) => link.type === "menu")?.url).toBe(p.expected);
    expect(result.records[p.slug].commerce_links!.filter((link) => link.type === "menu")[0].url).toBe(p.expected);
  });
  it("holds the entire old Tempo-style record when a bounded read does not reobserve its accepted deep PDF", async () => {
    const p = { ...place("tempo-di-pasta"), name: "Tempo Di Pasta", category: "restaurant", website: "https://www.tempodipasta.com/" };
    const old = { name: p.name, description: "Previously reviewed prose.", source: { url: p.website, fetchedAt: "2026-08-01T00:00:00Z" }, commerce_source: { url: p.website, checkedAt: "2026-08-01T00:00:00Z" }, commerce_links: [{ type: "menu" as const, url: "https://www.tempodipasta.com/_files/ugd/accepted-menu.pdf", anchor_text: "Menu", source_url: p.website }] };
    const before = JSON.stringify(old);
    const capture = vi.fn();
    const result = await run({ places: [p], existing: { [p.slug]: old }, onEvidence: capture, fetchImpl: vi.fn<typeof globalThis.fetch>(async () => html('<a href="/menu">Menu</a>')) });
    expect(result.records[p.slug]).toBe(old); expect(JSON.stringify(result.records[p.slug])).toBe(before);
    expect(result).toMatchObject({ review_required: true, safe_hold_count: 1, checked_count: 1, failed_count: 0 });
    expect(result.results[0]).toMatchObject({ safe_hold: "prior_destinations_not_reobserved", missing_prior_links: [{ type: "menu", url: old.commerce_links[0].url }], candidate: { name: p.name, commerce_source: { url: p.website, checkedAt: NOW.toISOString() }, commerce_links: [{ type: "menu", url: "https://www.tempodipasta.com/menu", source_url: p.website }] } });
    expect(result.results[0].candidate).not.toHaveProperty("description");
    expect(result.results[0].candidate).not.toHaveProperty("source");
    expect(capture).toHaveBeenCalledTimes(1);
    expect(capture.mock.calls[0][0]).toMatchObject({ source_url: p.website, observed_at: NOW.toISOString(), html: '<a href="/menu">Menu</a>' });
  });
  it("renews a commerce observation only when every sanitized prior destination was reobserved", async () => {
    const p = place(); const url = "https://declaredcoffee.com/files/menu.pdf";
    const old = mergeCommerceRefresh({ description: "Keep this.", source: { url: p.website!, fetchedAt: "2026-08-01T00:00:00Z" } }, { name: p.name, links: [{ type: "menu", url, anchor_text: "Menu", source_url: p.website! }], sourceUrl: p.website!, checkedAt: "2026-08-01T00:00:00Z" });
    const result = await run({ existing: { [p.slug]: old }, fetchImpl: vi.fn<typeof globalThis.fetch>(async () => html('<a href="/files/menu.pdf">Menu</a>')) });
    expect(result).toMatchObject({ safe_hold_count: 0, review_required: false, checked_count: 1 });
    expect(result.records[p.slug].commerce_source?.checkedAt).toBe(NOW.toISOString());
    expect(result.records[p.slug].source).toEqual(old.source);
    expect(result.results[0]).not.toHaveProperty("safe_hold");
  });
  it("follows at most one exact-host index and never probes external commerce destinations", async () => {
    const urls: string[] = [];
    const fetch = vi.fn<typeof globalThis.fetch>(async (url) => { urls.push(String(url)); return String(url).endsWith("/dining") ? html('<a href="https://www.opentable.com/r/declared-frederick">Reserve a table</a>') : html('<a href="/dining">Dining</a><a href="/restaurants">Restaurants</a><a href="https://other.declaredcoffee.com/food">Food</a><a href="/menu">View menu</a>'); });
    const result = await run({ options: { ...options, followPages: 1 }, fetchImpl: fetch });
    expect(urls).toEqual(["https://declaredcoffee.com/", "https://declaredcoffee.com/dining"]);
    expect(result).toMatchObject({ checked_count: 1, failed_count: 0, requests: 2, review_required: true, destination_verification: "not_performed" });
    expect(result.records[place().slug].commerce_links?.some((link) => link.type === "reservation")).toBe(true);
    expect(result.records[place().slug].commerce_links?.every((link) => link.source_url.startsWith("https://declaredcoffee.com/"))).toBe(true);
  });
  it("keeps failed old rows byte-values unchanged and never invents a failed new row", async () => {
    const old = { name: "Declared Coffee", source: { url: "https://declaredcoffee.com/", fetchedAt: "2026-08-01T00:00:00Z" }, description: "Existing reviewed prose.", hours_text: "Historical", commerce_source: { url: place().website!, checkedAt: "2026-08-01T00:00:00Z" } };
    const before = JSON.stringify(old);
    const result = await run({ places: [place("old"), place("new")], existing: { old }, fetchImpl: vi.fn<typeof globalThis.fetch>(async () => { throw new Error("outage"); }) });
    expect(result).toMatchObject({ checked_count: 0, failed_count: 2, review_required: false });
    expect(JSON.stringify(result.records.old)).toBe(before);
    expect(result.records.old).toBe(old);
    expect(result.records.new).toBeUndefined();
  });
  it("does not replace an old record when its selected follow page fails", async () => {
    const old = { name: "Declared Coffee", description: "Keep this." };
    const result = await run({ existing: { [place().slug]: old }, options: { ...options, followPages: 1 }, fetchImpl: vi.fn<typeof globalThis.fetch>(async (url) => String(url).endsWith("/dining") ? new Response("bad", { status: 503 }) : html('<a href="/dining">Dining</a><a href="/menu">Menu</a>')) });
    expect(result.records[place().slug]).toBe(old); expect(result.failed_count).toBe(1);
  });
  it("refreshes only the commerce observation for unchanged approved facts without re-dating extraction", async () => {
    const links = classifyOfficialCommerceLinks([{ url: "https://declaredcoffee.com/menu", text: "View menu" }], place().website!);
    const old = mergeCommerceRefresh({ source: { url: place().website!, fetchedAt: "2026-08-01T00:00:00Z" }, description: "Keep this." }, { name: place().name, links, sourceUrl: place().website!, checkedAt: "2026-08-01T00:00:00Z" });
    const result = await run({ existing: { [place().slug]: old }, fetchImpl: vi.fn<typeof globalThis.fetch>(async () => html()) });
    expect(result.review_required).toBe(false);
    expect(result.records[place().slug].commerce_source?.checkedAt).toBe(NOW.toISOString());
    expect(result.records[place().slug].source).toEqual(old.source);
    expect(commerceSemanticValue(result.records[place().slug])).toBe(commerceSemanticValue(old));
    expect(commerceSemanticValue({ ...old, source: { ...old.source, fetchedAt: NOW.toISOString() } })).not.toBe(commerceSemanticValue(old));
  });
  it("preserves key-order stability but flags real changes to actions and other fields", () => {
    expect(commerceSemanticValue({ name: "A", commerce_source: { url: "https://a.com/", checkedAt: "yesterday" } })).toBe(commerceSemanticValue({ commerce_source: { checkedAt: "today", url: "https://a.com/" }, name: "A" }));
    expect(commerceSemanticValue({ name: "A", checkedAt: "old" })).not.toBe(commerceSemanticValue({ name: "A", checkedAt: "new" }));
    expect(commerceSemanticValue({ commerce_links: [{ type: "menu", url: "https://a.com/menu" }] })).not.toBe(commerceSemanticValue({ commerce_links: [] }));
  });
  it("enforces the20-company runtime ceiling with only two native workers", async () => {
    let active = 0; let peak = 0;
    const fetch = vi.fn<typeof globalThis.fetch>(async () => { active++; peak = Math.max(active, peak); await Promise.resolve(); active--; return html(); });
    const result = await run({ places: Array.from({ length: 25 }, (_, i) => place(`p-${i}`)), fetchImpl: fetch });
    expect(result.selected_count).toBe(20); expect(result.checked_count).toBe(20);
    expect(result.requests).toBe(20); expect(fetch).toHaveBeenCalledTimes(20); expect(peak).toBeLessThanOrEqual(2);
    await expect(run({ options: { ...options, followPages: 2 as 0 } })).rejects.toThrow("at most one");
  });
  it("makes an actual published-catalog CLI plan with zero fetch and unchanged canonical bytes", async () => {
    const dir = mkdtempSync(join(tmpdir(), "radius-native-commerce-"));
    const output = join(dir, "github-output");
    const receiptPath = join(dir, "private-native-receipt.json");
    vi.stubEnv("NATIVE_COMMERCE_RECEIPT_PATH", receiptPath);
    vi.stubEnv("NATIVE_COMMERCE_EVIDENCE_DIR", join(dir, "originals"));
    vi.stubEnv("GITHUB_OUTPUT", output); vi.stubEnv("GITHUB_STEP_SUMMARY", join(dir, "summary"));
    const fetch = vi.fn(); vi.stubGlobal("fetch", fetch); vi.spyOn(console, "log").mockImplementation(() => {});
    const before = readFileSync("src/data/business-info.json", "utf8");
    try {
      const result = await main(["--native-daily", "--plan", "--limit=20", "--max-follow=0"]);
      expect(result).toMatchObject({ native_daily: true, plan: true, checked_count: 0, failed_count: 0, requests: 0 });
      expect(result?.roster.length).toBeLessThanOrEqual(20);
      expect(readFileSync(output, "utf8")).toContain("review_required=false");
      expect(readFileSync(output, "utf8")).toContain("native_daily=true");
      const receipt = JSON.parse(readFileSync(receiptPath, "utf8"));
      const { records: _records, ...expectedReceipt } = result!;
      void _records;
      expect(receipt).toEqual(expectedReceipt);
      expect(receipt).toMatchObject({ native_daily: true, plan: true, requests: 0, checked_count: 0, failed_count: 0, results: [] });
      expect(receipt).not.toHaveProperty("records");
      expect(readFileSync("src/data/business-info.json", "utf8")).toBe(before);
      expect(readdirSync(dir)).not.toContain("originals");
      expect(fetch).not.toHaveBeenCalled();
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
  it("plan does not issue even one home fetch or modify records", async () => {
    const fetch = vi.fn(); const existing = { [place().slug]: { description: "Keep." } };
    const result = await run({ existing, options: { ...options, plan: true }, fetchImpl: fetch });
    expect(result.records).toEqual(existing); expect(result.requests).toBe(0); expect(result.results).toEqual([]); expect(fetch).not.toHaveBeenCalled();
    expect(nativeCommerceUrl("https://declaredcoffee.com/#menu")).toBe("https://declaredcoffee.com/");
  });
});
