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

export default async function FoodTruckClaimPage({
  searchParams,
}: {
  searchParams: Promise<{ truck?: string }>;
}) {
  const requestedTruck = (await searchParams).truck;
  const initialTruckSlug = FOOD_TRUCKS.some((truck) => truck.slug === requestedTruck)
    ? requestedTruck
    : undefined;
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
          Pick your truck and leave a way to reach you. Radius verifies each request by hand. Once
          approved, you get a private link for posting a live location whenever you are out. You do
          not need to create an account.
        </p>
      </header>

      <div
        className="flex items-center justify-between gap-3 rounded-[var(--app-radius-md)] border px-3.5 py-3"
        style={{ borderColor: "var(--app-border)", background: "var(--app-bg-sunken)" }}
      >
        <p className="text-[12.5px]" style={{ color: "var(--app-ink-2)" }}>Do not see your truck in the list?</p>
        <Link
          href="/submit/place?category=food-truck"
          className="tap-44 inline-flex shrink-0 items-center text-[12px] font-semibold"
          style={{ color: "var(--app-brand-press)" }}
        >
          Add it first
        </Link>
      </div>

      <ClaimForm trucks={trucks} initialTruckSlug={initialTruckSlug} />

      <div className="rounded-[var(--app-radius-md)] border px-3.5 py-3" style={{ borderColor: "var(--app-border)", background: "var(--app-bg-sunken)" }}>
        <p className="text-[12.5px] leading-relaxed" style={{ color: "var(--app-ink-2)" }}>
          Do you only need to correct the listing or add an approved truck photo?{" "}
          <Link href="/submit/place?category=food-truck" className="font-semibold underline" style={{ color: "var(--app-brand-press)" }}>
            Send a listing update instead.
          </Link>
        </p>
      </div>

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
