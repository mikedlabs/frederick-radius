import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { shippingByKind, SHIP_COUNT } from "@/lib/loaders/shipping";
import ShippingGuide from "@/components/shipping/ShippingGuide";
import PageBloom from "@/components/ui/PageBloom";

/**
 * /shipping — every place in Frederick County to mail, ship, or grab a
 * package. The county had near-zero postal coverage before this; the layer
 * is assembled from OpenStreetMap (ODbL) by scripts/build-shipping.ts.
 *
 * Owner ask (Jul 2026): "make sure we have shipping covered — USPS, UPS,
 * FedEx and beyond. Locations, dropbox, access point, mailboxes." This is
 * the answer surface: post offices, ship-and-pack counters, and the blue
 * collection boxes, all find-first (search + a job-based kind segment).
 *
 * Static by nature — the points change only on an OSM rebuild — so it
 * prerenders and revalidates lazily.
 */

export const metadata: Metadata = {
  alternates: { canonical: "/shipping" },
  title: "Post & shipping",
  description:
    "Every post office, UPS Store, FedEx, and USPS mailbox across Frederick County, Maryland. Searchable by town and carrier, with one-tap directions.",
};

export const revalidate = 86_400;

export default function ShippingPage() {
  const groups = shippingByKind();
  const offices = groups.find((g) => g.kind === "usps")?.list.length ?? 0;
  const stores = groups.find((g) => g.kind === "ship_store")?.list.length ?? 0;

  return (
    <div className="relative mx-auto max-w-md space-y-6 py-6">
      <PageBloom variant="warm-cool" />

      <nav aria-label="Breadcrumb" className="text-xs">
        <Link href="/amenities" className="inline-flex items-center gap-1 hover:underline" style={{ color: "var(--app-ink-3)" }}>
          <ArrowLeft className="h-3 w-3" strokeWidth={2.25} aria-hidden />
          Amenities
        </Link>
      </nav>

      <header className="space-y-3">
        <p className="eyebrow" style={{ color: "var(--app-ink-3)" }}>
          Post &amp; shipping
        </p>
        <h1 className="font-serif text-[32px] font-semibold leading-[1.05] tracking-tight" style={{ color: "var(--app-ink)" }}>
          Where to mail it, ship it, or grab it.
        </h1>
        <div aria-hidden className="h-[3px] w-11 rounded-full" style={{ background: "var(--app-brand)" }} />
        <p className="text-[15px] leading-relaxed" style={{ color: "var(--app-ink-2)" }}>
          Every post office, the UPS Store and FedEx counters, and the blue
          collection boxes across the county. {offices} post {offices === 1 ? "office" : "offices"} and{" "}
          {stores} ship-and-pack {stores === 1 ? "counter" : "counters"}, searchable by town or carrier.
          Tap any one for directions.
        </p>
      </header>

      <ShippingGuide groups={groups} />

      <p className="pt-1 text-[11px] leading-relaxed" style={{ color: "var(--app-ink-3)" }}>
        {SHIP_COUNT} points from OpenStreetMap (© OpenStreetMap contributors,
        ODbL), refreshed on deploy. Hours vary and holidays close counters, so
        check before a late run. Know a drop-off or locker we&rsquo;re
        missing?{" "}
        <Link href="/submit/place" className="font-semibold hover:underline" style={{ color: "var(--app-brand)" }}>
          Tell us
        </Link>
        .
      </p>
    </div>
  );
}
