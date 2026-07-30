import { describe, it, expect } from "vitest";
import sitemap from "@/app/sitemap";
import { generateMetadata as muniMeta } from "@/app/(app)/m/[municipality]/page";
import { generateMetadata as catMeta } from "@/app/(app)/category/[slug]/page";

describe("sitemap (T2) — only canonical, indexable, non-redirecting URLs", () => {
  const entries = sitemap();
  const urls = entries.map((e) => String(e.url));

  it("lists no redirecting routes (/now, /radius, bare root)", () => {
    expect(urls.some((u) => u.endsWith("/now"))).toBe(false);
    expect(urls.some((u) => u.endsWith("/radius"))).toBe(false);
    expect(urls.some((u) => /\/$/.test(u))).toBe(false); // no bare-root "…/"
  });

  it("includes canonical public tools and excludes the legacy /guide", () => {
    expect(urls.some((u) => u.endsWith("/today"))).toBe(true);
    expect(urls.some((u) => u.endsWith("/ask"))).toBe(true);
    expect(urls.some((u) => u.endsWith("/collections"))).toBe(true);
    expect(urls.some((u) => u.endsWith("/access"))).toBe(true);
    expect(urls.some((u) => u.endsWith("/parks"))).toBe(true);
    // /guide now redirects to /ask; never list a redirecting URL.
    expect(urls.some((u) => u.endsWith("/guide"))).toBe(false);
  });

  it("includes town + category + event detail pages", () => {
    expect(urls.some((u) => u.includes("/m/"))).toBe(true);
    expect(urls.some((u) => u.includes("/category/"))).toBe(true);
    // events are windowed (open + next 60d) — at least present as a section
    expect(urls.filter((u) => u.includes("/m/")).length).toBeGreaterThan(5);
  });
});

describe("canonical (T1) — indexable routes self-canonicalize", () => {
  it("town page canonical is its own URL, not the homepage", async () => {
    const m = await muniMeta({ params: Promise.resolve({ municipality: "brunswick" }) });
    expect(m.alternates?.canonical).toBe("/m/brunswick");
  });

  it("category page canonical is its own URL", async () => {
    const c = await catMeta({ params: Promise.resolve({ slug: "coffee" }) });
    expect(c.alternates?.canonical).toBe("/category/coffee");
  });
});
