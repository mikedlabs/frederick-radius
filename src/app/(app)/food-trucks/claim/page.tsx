import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { FOOD_TRUCKS } from "@/data/food-trucks";
import PageBloom from "@/components/ui/PageBloom";
import ClaimForm from "./ClaimForm";

/**
 * /food-trucks/claim — an operator asks to claim their truck.
 *
 * This is the front door to the owner-approved beacon gate. An operator picks
 * their truck and leaves a name + contact; the owner reviews the request in
 * /admin/food-trucks and, on approval, hands back a private link for posting a
 * live pin. No pin goes live from here, which the copy is careful to say.
 *
 * An operator utility, not a marketing page, so it stays out of the index.
 */
export const metadata: Metadata = {
  title: "Claim your food truck",
  description:
    "Food-truck operators can claim their truck to post a live location pin when they are out around Frederick County.",
  robots: { index: false, follow: true },
};

const FOOD_ACCENT = "var(--app-brand)";

export default function FoodTruckClaimPage() {
  const trucks = FOOD_TRUCKS.map((t) => ({ slug: t.slug, name: t.name, kind: t.kind }));

  return (
    <div className="relative space-y-6">
      <PageBloom variant="single" />

      <header className="space-y-2">
        <p className="inline-flex items-center gap-1.5 font-mono text-[11px] font-semibold uppercase tracking-[0.14em]" style={{ color: "var(--app-ink-3)" }}>
          <span aria-hidden className="inline-block h-1.5 w-1.5 rounded-full" style={{ background: FOOD_ACCENT }} />
          Food trucks
        </p>
        <h1 className="display-1" style={{ color: "var(--app-ink)" }}>
          Claim your truck.
        </h1>
        <p className="text-[14px] leading-relaxed" style={{ color: "var(--app-ink-2)" }}>
          Run one of these trucks? Claim it here. The owner reviews each claim by hand, and once
          yours is approved you get a private link for dropping a live location pin whenever you
          are out. The pin shows only while you are genuinely there.
        </p>
      </header>

      <ClaimForm trucks={trucks} />

      <Link
        href="/food-trucks"
        className="tap-44 inline-flex items-center gap-1.5 text-[12px] font-semibold"
        style={{ color: "var(--app-ink-2)" }}
      >
        <ArrowLeft className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
        Back to the truck board
      </Link>
    </div>
  );
}
