import { createHash } from "node:crypto";
import { expect, test, type Page, type Request } from "@playwright/test";

type DocumentProof = {
  url: string; before: string | null; after: string | null;
  htmlSha256: string; htmlBytes: number; otherHeadersUnchanged: boolean;
  deliveredCsp?: string | null; deliveredHtmlSha256?: string; deliveryError?: string;
};
type Proof = {
  origin: string; documents: DocumentProof[]; untouched: Record<string, number>;
  byRequest: Map<Request, DocumentProof>; pending: Promise<void>[];
};
const proofs = new WeakMap<Page, Proof>();
const digest = (bytes: Buffer) => createHash("sha256").update(bytes).digest("hex");

/** Same narrow seam as plan-visual-journey: WebKit upgrades local production
 * assets despite bypassCSP. Register LAST among a spec's beforeEach hooks.
 * Public HTTPS, providers, writes and non-document traffic are never changed. */
export function registerWebkitLoopbackDocumentSeam() {
  test.beforeEach(async ({ page, browserName, baseURL }) => {
    if (browserName !== "webkit" || !baseURL) return;
    const origin = new URL(baseURL);
    if (origin.protocol !== "http:" || !["localhost", "127.0.0.1"].includes(origin.hostname)) return;
    const proof: Proof = { origin: origin.origin, documents: [], untouched: {}, byRequest: new Map(), pending: [] };
    proofs.set(page, proof);
    page.on("response", (response) => {
      const record = proof.byRequest.get(response.request());
      if (!record) return;
      proof.pending.push((async () => {
        record.deliveredCsp = response.headers()["content-security-policy"] ?? null;
        record.deliveredHtmlSha256 = digest(await response.body());
      })().catch((error) => { record.deliveryError = String(error); }));
    });
    await page.route("**/*", async (route) => {
      const request = route.request(), url = new URL(request.url());
      if (url.origin !== origin.origin || url.protocol !== "http:" || !["localhost", "127.0.0.1"].includes(url.hostname)
        || request.method() !== "GET" || !request.isNavigationRequest() || request.resourceType() !== "document") {
        const reason = url.origin !== origin.origin ? "other-origin" : request.method() !== "GET" ? "non-get" : "non-navigation-document";
        proof.untouched[reason] = (proof.untouched[reason] ?? 0) + 1;
        return route.fallback();
      }
      const response = await route.fetch({ maxRedirects: 0, maxRetries: 0 });
      const original = response.headers(), headers = { ...original };
      const before = headers["content-security-policy"] ?? null;
      const after = before === null ? null : before.split(";")
        .filter((directive) => directive.trim().toLowerCase() !== "upgrade-insecure-requests").join(";");
      if (after !== null) headers["content-security-policy"] = after;
      const withoutCsp = (value: Record<string, string>) => Object.fromEntries(Object.entries(value).filter(([name]) => name !== "content-security-policy"));
      expect(withoutCsp(headers)).toEqual(withoutCsp(original));
      const body = await response.body();
      const record: DocumentProof = { url: `${url.origin}${url.pathname}`, before, after,
        htmlSha256: digest(body), htmlBytes: body.length, otherHeadersUnchanged: true };
      proof.documents.push(record);
      proof.byRequest.set(request, record);
      // Reuse this single fetched response; no body/other-header override.
      await route.fulfill({ response, headers });
    });
  });
  test.afterEach(async ({ page }, info) => {
    const proof = proofs.get(page);
    if (!proof) return;
    await Promise.all(proof.pending);
    await info.attach("webkit-http-loopback-document-header-seam", { contentType: "application/json",
      body: JSON.stringify({ origin: proof.origin, documents: proof.documents, untouched: proof.untouched }) });
    for (const record of proof.documents) {
      expect(record.deliveryError).toBeUndefined();
      expect(record.deliveredCsp).toBe(record.after);
      expect(record.deliveredHtmlSha256).toBe(record.htmlSha256);
    }
  });
}
