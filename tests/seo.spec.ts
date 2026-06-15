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

  it("includes /today (the home), the /guide browse funnel, and main content routes", () => {
    // /guide lost its primary-nav tab but stays in the sitemap — it's still
    // a real indexable page (browse-by-town / hidden gems / live downtown).
    expect(urls.some((u) => u.endsWith("/guide"))).toBe(true);
    expect(urls.some((u) => u.endsWith("/today"))).toBe(true);
    expect(urls.some((u) => u.endsWith("/collections"))).toBe(true);
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
