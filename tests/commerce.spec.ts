import { describe, it, expect } from "vitest";
import {
  detectProvider,
  providerLabel,
  resolveCommerceLinks,
  commerceActionLabel,
  commerceCardLabel,
  commerceTrustLine,
  selectCardCommerceActions,
  isToastConnected,
} from "@/lib/commerce/links";
import type { CommerceLink } from "@/lib/commerce/types";

describe("detectProvider", () => {
  it("recognizes Toast only from a real toasttab.com URL", () => {
    expect(detectProvider("https://order.toasttab.com/online/some-diner")).toBe("toast");
    expect(detectProvider("https://www.toasttab.com/some-diner")).toBe("toast");
  });
  it("maps the delivery marketplaces", () => {
    expect(detectProvider("https://www.doordash.com/store/x")).toBe("doordash");
    expect(detectProvider("https://www.ubereats.com/store/x")).toBe("ubereats");
    expect(detectProvider("https://www.grubhub.com/restaurant/x")).toBe("grubhub");
  });
  it("falls back to 'website' for an unknown host, never a branded provider", () => {
    expect(detectProvider("https://some-diner.com/menu")).toBe("website");
  });
  it("returns 'other' for a non-URL string (never throws)", () => {
    expect(detectProvider("not a url")).toBe("other");
  });
});

describe("resolveCommerceLinks — legacy fields", () => {
  it("derives an order link and detects Toast from its URL host", () => {
    const links = resolveCommerceLinks({
      slug: "diner",
      order_url: "https://order.toasttab.com/online/diner",
    });
    const order = links.find((l) => l.type === "order");
    expect(order).toBeTruthy();
    expect(order?.provider).toBe("toast");
    expect(order?.source).toBe("curated");
  });

  it("derives a website menu link (not a branded provider) from a plain menu_url", () => {
    const links = resolveCommerceLinks({ slug: "diner", menu_url: "https://diner.com/menu.pdf" });
    const menu = links.find((l) => l.type === "menu");
    expect(menu?.provider).toBe("website");
  });

  it("builds a reservation link via the verified OpenTable builder", () => {
    const links = resolveCommerceLinks({ slug: "diner", opentable_id: "12345" });
    const resv = links.find((l) => l.type === "reservation");
    expect(resv?.provider).toBe("opentable");
    expect(resv?.url).toContain("opentable.com");
    expect(resv?.url).toContain("12345");
  });

  it("maps delivery marketplaces to delivery links", () => {
    const links = resolveCommerceLinks({
      slug: "diner",
      doordash_url: "https://www.doordash.com/store/diner",
      grubhub_url: "https://www.grubhub.com/restaurant/diner",
    });
    const delivery = links.filter((l) => l.type === "delivery");
    expect(delivery.map((l) => l.provider).sort()).toEqual(["doordash", "grubhub"]);
  });

  it("returns [] for a place with no commerce data (clean empty state)", () => {
    expect(resolveCommerceLinks({ slug: "park" })).toEqual([]);
  });
});

describe("resolveCommerceLinks — normalized + dedupe", () => {
  it("keeps curated links and dedupes against a legacy field with the same url", () => {
    const curated: CommerceLink[] = [
      { provider: "toast", type: "order", url: "https://order.toasttab.com/diner", source: "owner", is_verified: true },
    ];
    const links = resolveCommerceLinks({
      slug: "diner",
      commerce_links: curated,
      order_url: "https://order.toasttab.com/diner", // same url → should not double
    });
    const orders = links.filter((l) => l.type === "order");
    expect(orders).toHaveLength(1);
    expect(orders[0].source).toBe("owner"); // curated wins
    expect(orders[0].is_verified).toBe(true);
  });
});

describe("commerceActionLabel — Toast-aware, honest", () => {
  const link = (over: Partial<CommerceLink>): CommerceLink => ({
    provider: "website",
    type: "order",
    url: "https://x.com",
    ...over,
  });
  it("names Toast when the provider is genuinely Toast", () => {
    expect(commerceActionLabel(link({ provider: "toast", type: "order" }))).toBe("Order on Toast");
    expect(commerceActionLabel(link({ provider: "toast", type: "menu" }))).toBe("View Toast menu");
  });
  it("stays generic for non-Toast providers", () => {
    expect(commerceActionLabel(link({ provider: "website", type: "order" }))).toBe("Order online");
    expect(commerceActionLabel(link({ provider: "website", type: "menu" }))).toBe("View menu");
    expect(commerceActionLabel(link({ type: "reservation" }))).toBe("Reserve");
  });
  it("labels delivery by its recognizable provider", () => {
    expect(commerceActionLabel(link({ provider: "doordash", type: "delivery" }))).toBe("DoorDash");
  });
  it("honors an explicit label override", () => {
    expect(commerceActionLabel(link({ label: "Order pizza" }))).toBe("Order pizza");
  });
});

describe("card selection + labels", () => {
  const mk = (type: CommerceLink["type"]): CommerceLink => ({ provider: "website", type, url: `https://x.com/${type}` });
  it("prioritizes order > menu > reservation and caps at max", () => {
    const links = [mk("reservation"), mk("menu"), mk("order")];
    const one = selectCardCommerceActions(links, 1);
    expect(one).toHaveLength(1);
    expect(one[0].type).toBe("order");
    const two = selectCardCommerceActions(links, 2);
    expect(two.map((l) => l.type)).toEqual(["order", "menu"]);
  });
  it("uses short, provider-agnostic card labels", () => {
    expect(commerceCardLabel(mk("order"))).toBe("Order");
    expect(commerceCardLabel(mk("reservation"))).toBe("Reserve");
  });
});

describe("commerceTrustLine + isToastConnected", () => {
  it("reads 'Toast · Verified' for a verified Toast link", () => {
    const l: CommerceLink = { provider: "toast", type: "order", url: "https://order.toasttab.com/x", is_verified: true };
    expect(commerceTrustLine(l)).toBe("Toast · Verified");
  });
  it("reads source + freshness for an owner-provided link", () => {
    const l: CommerceLink = { provider: "website", type: "menu", url: "https://x.com", source: "owner" };
    expect(commerceTrustLine(l, "Updated today")).toBe("Owner-provided · Updated today");
  });
  it("isToastConnected is true only when a resolved link is genuinely Toast", () => {
    expect(isToastConnected([{ provider: "toast", type: "order", url: "https://order.toasttab.com/x" }])).toBe(true);
    expect(isToastConnected([{ provider: "website", type: "menu", url: "https://x.com" }])).toBe(false);
  });
  it("labels providers for humans", () => {
    expect(providerLabel("ubereats")).toBe("Uber Eats");
    expect(providerLabel("opentable")).toBe("OpenTable");
  });
});
