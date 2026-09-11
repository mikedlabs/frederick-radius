import { describe, it, expect } from "vitest";
import {
  isAdminEmail,
  parsePublishBody,
  composeUpdatePush,
  UPDATE_TYPES,
} from "@/lib/business-updates";

describe("isAdminEmail", () => {
  it("matches case-insensitively across comma/space lists", () => {
    expect(isAdminEmail("Owner@Frederick.app", "a@b.com, owner@frederick.app")).toBe(true);
    expect(isAdminEmail("owner@frederick.app", "a@b.com owner@frederick.app")).toBe(true);
  });
  it("does not match a non-listed email", () => {
    expect(isAdminEmail("x@y.com", "a@b.com owner@frederick.app")).toBe(false);
  });
  it("is false without an email or an allowlist (no accidental grants)", () => {
    expect(isAdminEmail(null, "a@b.com")).toBe(false);
    expect(isAdminEmail("a@b.com", undefined)).toBe(false);
    expect(isAdminEmail("a@b.com", "")).toBe(false);
  });
});

describe("parsePublishBody", () => {
  it("accepts a valid body and defaults update_type to general", () => {
    const r = parsePublishBody({ slug: "brewers-alley", title: "Tonight: $5 burgers", body: "5 to 9 at the bar." });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.slug).toBe("brewers-alley");
      expect(r.value.update_type).toBe("general");
    }
  });
  it("rejects missing or oversized fields", () => {
    expect(parsePublishBody({ slug: "", title: "x", body: "y" }).ok).toBe(false);
    expect(parsePublishBody({ slug: "s", title: "", body: "y" }).ok).toBe(false);
    expect(parsePublishBody({ slug: "s", title: "t", body: "" }).ok).toBe(false);
    expect(parsePublishBody({ slug: "s", title: "t", body: "b".repeat(281) }).ok).toBe(false);
    expect(parsePublishBody(null).ok).toBe(false);
    expect(parsePublishBody("nope").ok).toBe(false);
  });
  it("accepts a known update_type and falls back to general for an unknown one", () => {
    const ok = parsePublishBody({ slug: "s", title: "t", body: "b", update_type: "special" });
    expect(ok.ok && ok.value.update_type).toBe("special");
    const bad = parsePublishBody({ slug: "s", title: "t", body: "b", update_type: "spammy" });
    expect(bad.ok && bad.value.update_type).toBe("general");
    // every declared type round-trips
    for (const t of UPDATE_TYPES) {
      const r = parsePublishBody({ slug: "s", title: "t", body: "b", update_type: t });
      expect(r.ok && r.value.update_type).toBe(t);
    }
  });
});

describe("composeUpdatePush", () => {
  it("deep-links to the place and tags by business (never an arbitrary url)", () => {
    const p = composeUpdatePush("brewers-alley", { title: "T", body: "B" });
    expect(p.url).toBe("/places/brewers-alley");
    expect(p.tag).toBe("biz:brewers-alley");
    expect(p.title).toBe("T");
    expect(p.body).toBe("B");
  });
});
