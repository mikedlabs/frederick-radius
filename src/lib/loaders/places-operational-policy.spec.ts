import { describe, expect, it, vi } from "vitest";
import { clientOperationalCorrectionForPlace, publicPlaceBySlug, resolveRefreshedBusinessStatusForAcceptedIdentity } from "./places";
import { manualPlaceStatusOverride } from "@/lib/place-status-overrides";
import { compactOperationalCorrection } from "@/lib/place-operational-policy";
import { readFileSync } from "node:fs";

describe("compact accepted operational fallback", () => {
  it("stamps the same accepted provider fallback used by the canonical Concetta policy", () => {
    const slug = "concettas-main-street-bistro-mount-airy";
    const correction = manualPlaceStatusOverride(slug)!;
    const now = new Date(`${correction.review_after}T17:00:00Z`);
    vi.useFakeTimers({ toFake: ["Date"] });
    try {
      vi.setSystemTime(now);
      const place = publicPlaceBySlug(slug)!;
      expect(place).toBeDefined();
      expect(clientOperationalCorrectionForPlace(place, now)).toEqual({
        fallback_status: "closed_permanently", review_after: correction.review_after,
      });
    } finally { vi.useRealTimers(); }
  });
  it("keeps client enforcement off the heavy enrichment and server loader", () => {
    const client = readFileSync(new URL("./places-client.ts", import.meta.url), "utf8");
    const policy = readFileSync(new URL("../place-operational-policy.ts", import.meta.url), "utf8");
    expect(client).not.toMatch(/import\s+\{[^}]*\}\s+from\s+["']@\/lib\/loaders\/places["']/);
    expect(policy).not.toMatch(/places-enrichment|places-hours-refresh|business-status\.json|loaders\/places/);
  });
  it("does not stamp an expiry dependency after a newer accepted provider status independently says operational", () => {
    const slug = "concettas-main-street-bistro-mount-airy";
    const correction = manualPlaceStatusOverride(slug)!;
    const now = new Date(`${correction.review_after}T17:00:00Z`);
    const acceptedId = "ChIJ8QmkXfEsyIkRyrJuUsq6dnQ";
    const base = resolveRefreshedBusinessStatusForAcceptedIdentity(
      { place_id: acceptedId, is_operational: "operational", refreshed_at: "2026-10-31T12:00:00Z" },
      { place_id: acceptedId, business_status: "CLOSED_PERMANENTLY", refreshed_at: "2026-08-20T12:00:00Z" },
      acceptedId,
    );
    expect(compactOperationalCorrection(slug, base?.status, now, true)).toEqual({ fallback_status: "operational" });
  });
});
