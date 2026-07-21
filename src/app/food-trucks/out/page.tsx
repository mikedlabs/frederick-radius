import type { Metadata } from "next";
import OutClient from "./OutClient";

/**
 * /food-trucks/out — the operator's "I'm out now" console.
 *
 * A focused, token-gated tool (deliberately OUTSIDE the (app) nav shell, like
 * /collect and /admin) for an approved operator to drop a live location pin
 * that shows on the truck board only while they are genuinely out. The token
 * arrives in the private link the owner sends on approval.
 *
 * Robots-blocked: it's an operator utility keyed to a private token, not a
 * public page.
 */
export const metadata: Metadata = {
  title: "Post your location · Food trucks",
  description: "Approved food-truck operators drop a live location pin when they are out.",
  robots: { index: false, follow: false },
};

// Client-only tool (geolocation + token in URL/localStorage); nothing to cache.
export const dynamic = "force-dynamic";

export default function FoodTruckOutPage() {
  return <OutClient />;
}
