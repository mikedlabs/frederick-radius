import { describe, it, expect } from "vitest";
import { INTENT_BY_KEY } from "@/data/intents";
import type { PlaceCardData } from "@/lib/loaders/places";

/**
 * Wellness intent — tests the matcher gating for Yoga / Gyms / Spas
 * sub-intents that were just shipped on /map.
 *
 * Two invariants the matchers MUST preserve:
 *
 *   1. Category gate. A restaurant named "Yoga Cafe" must NOT match
 *      the Yoga sub. The yoga name must combine with the wellness/
 *      yoga category to count as wellness.
 *
 *   2. sub ⊆ parent. The Wellness top-intent now serves the WHOLE
 *      self-care category (yoga + wellness), so the subs (Yoga, Gyms,
 *      Spas, Hair & beauty, Nails) are a NON-exhaustive partition:
 *      every sub match implies a parent match, but the parent also
 *      covers uncategorized self-care rows no sub claims. The parent
 *      never matches outside the self-care category.
 *
 *   3. Yoga + Gyms are disjoint by design. A studio with "yoga" in
 *      the name lands in Yoga, not Gyms (we explicitly excluded yoga
 *      from the gym regex). Pure-fitness places land in Gyms.
 */

// Minimal PlaceCardData fixture. The matchers only read `category`,
// `name`, and `subcategories`, so the rest can be stubbed loosely.
function place(name: string, category: string, extra: Partial<PlaceCardData> = {}): PlaceCardData {
  return {
    slug: name.toLowerCase().replace(/\s+/g, "-"),
    name,
    category,
    short_blurb: "",
    geom: { lng: -77.41, lat: 39.41 },
    address: "",
    city: "Frederick",
    state: "MD",
    postal_code: "21701",
    municipality: "frederick",
    is_verified: true,
    is_operational: "operational",
    feature_score: 5,
    source: "seed",
    updated_at: "2026-05-28",
    open_status: { state: "unknown" },
    distance_m: 0,
    ...extra,
  } as PlaceCardData;
}

describe("Wellness intent (Yoga / Gyms / Spas)", () => {
  const wellness = INTENT_BY_KEY["wellness"];
  const yoga = wellness.subIntents?.find((s) => s.key === "yoga");
  const gyms = wellness.subIntents?.find((s) => s.key === "gyms");
  const spas = wellness.subIntents?.find((s) => s.key === "spas");
  const hair = wellness.subIntents?.find((s) => s.key === "hair");
  const nails = wellness.subIntents?.find((s) => s.key === "nails");

  it("registers all five sub-intents", () => {
    expect(yoga).toBeDefined();
    expect(gyms).toBeDefined();
    expect(spas).toBeDefined();
    expect(hair).toBeDefined();
    expect(nails).toBeDefined();
  });

  it("Yoga sub matches yoga category OR /yoga/ name — but only inside the wellness family", () => {
    expect(yoga!.match(place("Sol Yoga", "yoga"))).toBe(true);
    expect(yoga!.match(place("Yogamour", "wellness"))).toBe(true);
    // The whole point: name alone isn't enough if the category isn't right.
    expect(yoga!.match(place("Yoga Cafe", "restaurant"))).toBe(false);
    expect(yoga!.match(place("Random Spot", "wellness"))).toBe(false);
  });

  it("Gyms sub matches gym/fitness/pilates names — but excludes yoga", () => {
    expect(gyms!.match(place("Briq Haus Pilates", "wellness"))).toBe(true);
    expect(gyms!.match(place("Odin Crossfit", "wellness"))).toBe(true);
    expect(gyms!.match(place("Pure Barre", "wellness"))).toBe(true);
    // Yoga + Pilates name → yoga wins; we don't double-count.
    expect(gyms!.match(place("Lake Fit Pilates and Yoga", "wellness"))).toBe(false);
    // Wrong category — name alone doesn't promote a place.
    expect(gyms!.match(place("Crossfit Cafe", "restaurant"))).toBe(false);
  });

  it("Spas sub matches spa/massage/sauna names inside wellness", () => {
    expect(spas!.match(place("Unwind Massage Therapy", "wellness"))).toBe(true);
    expect(spas!.match(place("Verbena Salon Spa", "wellness"))).toBe(true);
    // Name alone isn't enough.
    expect(spas!.match(place("Massage Brewing Co", "brewery"))).toBe(false);
  });

  it("Yoga + Gyms are disjoint — no place matches both", () => {
    const candidates: PlaceCardData[] = [
      place("Sol Yoga", "yoga"),
      place("Yogamour", "wellness"),
      place("Briq Haus Pilates", "wellness"),
      place("Lake Fit Pilates and Yoga", "wellness"),
      place("Odin Crossfit", "wellness"),
      place("HOTWORX", "wellness"),
    ];
    for (const p of candidates) {
      const isYoga = yoga!.match(p);
      const isGym = gyms!.match(p);
      // Disjoint: never both true at once.
      expect(isYoga && isGym).toBe(false);
    }
  });

  it("Wellness parent serves the whole self-care category — and nothing outside it", () => {
    // Inside the self-care family → matched (even rows no sub claims).
    expect(wellness.match(place("Sol Yoga", "yoga"))).toBe(true);
    expect(wellness.match(place("Briq Haus Pilates", "wellness"))).toBe(true);
    expect(wellness.match(place("Some Lash Studio", "wellness"))).toBe(true);
    expect(wellness.match(place("Generic Wellness Co", "wellness"))).toBe(true);
    // Outside the self-care category → never matched, even on a name hit.
    expect(wellness.match(place("Yoga Cafe", "restaurant"))).toBe(false);
    expect(wellness.match(place("Massage Brewing", "brewery"))).toBe(false);
  });

  it("every sub-intent is a subset of the parent (sub ⊆ parent)", () => {
    const subs = [yoga!, gyms!, spas!, hair!, nails!];
    const candidates: PlaceCardData[] = [
      place("Sol Yoga", "yoga"),
      place("Briq Haus Pilates", "wellness"),
      place("Unwind Massage", "wellness"),
      place("Shear Beauty Salon", "wellness"),
      place("Polished Nail Bar", "wellness"),
      place("Yoga Cafe", "restaurant"), // category-gated out of every sub
    ];
    for (const p of candidates) {
      for (const sub of subs) {
        // If a sub claims a place, the parent must claim it too.
        if (sub.match(p)) expect(wellness.match(p)).toBe(true);
      }
    }
  });
});
