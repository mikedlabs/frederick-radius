import { describe, expect, it, vi } from "vitest";
import { freshHoursInstant } from "../../tests/utils/freshHoursInstant";
import { chainBrandKey } from "./category-ranking";
import {
  buildWantAnswer,
  partitionWant,
  rankBestFit,
  resolveWantAvailability,
  usefulDealHook,
  usefulFallbackSignature,
  wantDecisionReasons,
  type WantCandidate,
} from "./want-answer";

function cand(over: Partial<WantCandidate> & { slug: string }): WantCandidate {
  return {
    name: over.slug,
    open_status: { state: "open", closesAt: "21:00", closingSoon: false },
    feature_score: 0,
    ...over,
  };
}

describe("partitionWant", () => {
  it("open places lead, nearest first when a fix exists", () => {
    const { open } = partitionWant([
      cand({ slug: "far", distance_m: 5000 }),
      cand({ slug: "near", distance_m: 200 }),
      cand({ slug: "mid", distance_m: 900 }),
    ]);
    expect(open.map((c) => c.slug)).toEqual(["near", "mid", "far"]);
  });

  it("feature score carries the ordering without a fix", () => {
    const { open } = partitionWant([
      cand({ slug: "quiet", feature_score: 1 }),
      cand({ slug: "landmark", feature_score: 9 }),
    ]);
    expect(open.map((c) => c.slug)).toEqual(["landmark", "quiet"]);
  });

  it("keeps intent fit ahead of proximity for a recognized category", () => {
    const { open } = partitionWant([
      cand({
        slug: "near-boba",
        distance_m: 50,
        feature_score: 10,
        intent_fit_tier: 0,
      }),
      cand({
        slug: "actual-coffee-shop",
        distance_m: 700,
        feature_score: 5,
        intent_fit_tier: 3,
      }),
    ]);

    expect(open.map((candidate) => candidate.slug)).toEqual([
      "actual-coffee-shop",
      "near-boba",
    ]);
  });

  it("closing-soon still counts as open", () => {
    const { open } = partitionWant([
      cand({ slug: "soon", open_status: { state: "closing-soon", closesAt: "21:30" } }),
    ]);
    expect(open).toHaveLength(1);
  });

  it("opens-later-today sorts by how soon the doors open", () => {
    const { later } = partitionWant([
      cand({
        slug: "afternoon",
        open_status: { state: "closed", opensAt: "15:00", opensDay: "sat", opensToday: true },
      }),
      cand({
        slug: "morning",
        open_status: { state: "closed", opensAt: "07:00", opensDay: "sat", opensToday: true },
      }),
    ]);
    expect(later.map((c) => c.slug)).toEqual(["morning", "afternoon"]);
  });

  it("closed-until-another-day and unverified count in total only", () => {
    const { open, later, total } = partitionWant([
      cand({
        slug: "tuesday",
        open_status: { state: "closed", opensAt: "11:00", opensDay: "tue", opensToday: false },
      }),
      cand({ slug: "mystery", open_status: { state: "unverified" } }),
    ]);
    expect(open).toHaveLength(0);
    expect(later).toHaveLength(0);
    expect(total).toBe(2);
  });

  it("neither-open-nor-opening-today lands in `other`, ranked by proximity", () => {
    const { open, later, other } = partitionWant([
      cand({ slug: "open-now" }),
      cand({
        slug: "closed-far",
        distance_m: 8000,
        open_status: { state: "closed", opensAt: "09:00", opensDay: "tue", opensToday: false },
      }),
      cand({
        slug: "closed-near",
        distance_m: 300,
        open_status: { state: "unverified" },
      }),
    ]);
    expect(open.map((c) => c.slug)).toEqual(["open-now"]);
    expect(later).toHaveLength(0);
    // The notable fallback pool: nearest first, so a no-hours category
    // (markets, playgrounds) still flows down with the closest places.
    expect(other.map((c) => c.slug)).toEqual(["closed-near", "closed-far"]);
  });
});

describe("usefulDealHook", () => {
  it("drops contextless price fragments", () => {
    expect(usefulDealHook("$2.75")).toBeNull();
    expect(usefulDealHook("50% OFF")).toBeNull();
    expect(usefulDealHook("$2 OFF")).toBeNull();
  });

  it("keeps an offer when it names what the price applies to", () => {
    expect(usefulDealHook("$5 cocktails")).toBe("$5 cocktails");
    expect(usefulDealHook("Half-price wine bottles")).toBe(
      "Half-price wine bottles",
    );
  });
});

describe("usefulFallbackSignature", () => {
  it("drops fragments created when a repeated place name is removed", () => {
    expect(
      usefulFallbackSignature(
        "has operated downtown since 1996, serving house beer.",
      ),
    ).toBeNull();
  });

  it("drops conversational filler instead of presenting it as Radius copy", () => {
    expect(
      usefulFallbackSignature(
        "They have bands sometimes and are sometimes open.",
      ),
    ).toBeNull();
  });

  it("keeps a clean, specific description", () => {
    expect(
      usefulFallbackSignature(
        "This South Market restaurant serves Spanish tapas and paella.",
      ),
    ).toBe("This South Market restaurant serves Spanish tapas…");
  });
});

describe("buildWantAnswer context", () => {
  it("carries an explicit town scope into both the answer and browse door", () => {
    const answer = buildWantAnswer("coffee", null, null, new Date("2026-07-15T16:00:00Z"), {
      municipality: "thurmont",
      contextLabel: "Thurmont",
      contextSource: "town",
    });
    expect(answer).not.toBeNull();
    expect(answer).toMatchObject({
      contextLabel: "Thurmont",
      contextSource: "town",
      fallbackReason: null,
    });
    expect(answer?.browseHref).toContain("town=thurmont");
    expect(answer?.decision).toMatchObject({
      status: "ready",
      scope: {
        label: "Thurmont",
        source: "town",
        originTrust: "chosen",
      },
      totalCandidates: answer?.total,
    });
    expect(answer?.decision?.lead?.id).toBe(answer?.hero?.slug);
  });

  it("uses the same evidence-aware reason contract that the client receives", () => {
    const candidate = cand({
      slug: "nearby-local",
      name: "Nearby Local",
      distance_m: 120,
      feature_score: 7,
      local_favorite: true,
      google_rating: 4.7,
      google_rating_count: 180,
      intent_fit_tier: 3,
    });
    const reasons = wantDecisionReasons(candidate, true, true);

    expect(reasons.length).toBeGreaterThan(0);
    expect(reasons.every((reason) => /[.!?]$/.test(reason.label))).toBe(true);
    expect(reasons.some((reason) => reason.evidenceIds.length > 0)).toBe(true);
  });

  it("can rank a timeless decision by local fit instead of current open state", () => {
    const ranked = rankBestFit([
      cand({ slug: "open-chain", name: "Dunkin'", feature_score: 5, google_rating: 4.1 }),
      cand({
        slug: "closed-local",
        name: "Local Deli",
        feature_score: 5,
        local_favorite: true,
        google_rating: 4.5,
        open_status: { state: "closed", opensAt: "08:00", opensDay: "sat", opensToday: false },
      }),
    ]);
    expect(ranked.map((candidate) => candidate.slug)).toEqual([
      "closed-local",
      "open-chain",
    ]);
  });

  it("makes a truly nearby fit prominent when the origin is precise", () => {
    const ranked = rankBestFit([
      cand({ slug: "nearby", name: "Nearby Local", distance_m: 80, feature_score: 5 }),
      cand({ slug: "farther", name: "Farther Favorite", distance_m: 2_000, feature_score: 8, local_favorite: true }),
    ], true);

    expect(ranked[0]?.slug).toBe("nearby");
  });

  it("keeps a nearby unknown-hours place ahead of a far open place for a timeless intent", () => {
    const resolution = resolveWantAvailability(
      [
        cand({
          slug: "walkersville-open",
          name: "Walkersville Playground",
          distance_m: 11_100,
          feature_score: 5,
        }),
        cand({
          slug: "downtown-hours-unknown",
          name: "Downtown Playground",
          distance_m: 220,
          feature_score: 5,
          open_status: { state: "unverified" },
        }),
      ],
      "not-applicable",
      true,
    );

    expect(resolution).toMatchObject({
      hardAvailability: false,
      rankingMode: "best-fit",
      mayAssertNoneOpen: false,
    });
    expect(resolution.current.map((candidate) => candidate.slug)).toEqual([
      "downtown-hours-unknown",
      "walkersville-open",
    ]);
  });

  it("leads with confirmed-open before unknown hours when required-hours coverage is thin", () => {
    const resolution = resolveWantAvailability(
      [
        cand({
          slug: "far-open",
          distance_m: 8_000,
          feature_score: 5,
        }),
        cand({
          slug: "near-unknown",
          distance_m: 120,
          feature_score: 5,
          open_status: { state: "unknown" },
        }),
        cand({
          slug: "mid-unverified",
          distance_m: 900,
          feature_score: 5,
          open_status: { state: "unverified" },
        }),
      ],
      "required",
      true,
    );

    expect(resolution.hardAvailability).toBe(false);
    expect(resolution.current.map((candidate) => candidate.slug)).toEqual([
      "far-open",
      "near-unknown",
      "mid-unverified",
    ]);
  });

  it("keeps confirmed-open food as a hard gate when hours coverage is sufficient", () => {
    const resolution = resolveWantAvailability(
      [
        cand({ slug: "open-near", distance_m: 180 }),
        cand({ slug: "open-far", distance_m: 1_800 }),
        cand({
          slug: "near-unknown",
          distance_m: 40,
          feature_score: 20,
          open_status: { state: "unverified" },
        }),
      ],
      "required",
      true,
    );

    expect(resolution).toMatchObject({
      hardAvailability: true,
      rankingMode: "open-now",
      mayAssertNoneOpen: true,
    });
    expect(resolution.current.map((candidate) => candidate.slug)).toEqual([
      "open-near",
      "open-far",
    ]);
  });

  it("keeps downtown playgrounds ahead of an open Walkersville playground", () => {
    const answer = buildWantAnswer(
      "cat:playground",
      null,
      { lng: -77.4105, lat: 39.4143 },
      new Date("2026-07-28T16:00:00.000Z"),
      {
        contextLabel: "Near you",
        contextSource: "device",
      },
    );

    expect(answer).toMatchObject({
      rankingMode: "best-fit",
      mayAssertNoneOpen: false,
      contextSource: "device",
    });
    expect(answer?.hero?.slug).not.toBe(
      "walkersville-community-park-playground-walkersville",
    );
    expect(answer?.hero?.where).toBe("Frederick");
    expect(answer?.hero?.confidence).toBeUndefined();
  });

  it("uses the reviewed want taxonomy instead of raw secondary categories", () => {
    // Pin the WHOLE clock, not just the `now` argument: clientPlaces()
    // evaluates hours freshness with its own `new Date()`, so a literal date
    // here drifts out of the freshness window as the committed hours stamps
    // move (issue #1529). The instant is derived from the data so a refresh
    // can never strand it.
    const pinned = freshHoursInstant(3, 21); // a Wednesday, 5pm Eastern
    vi.useFakeTimers();
    vi.setSystemTime(pinned);
    try {
    const restaurant = buildWantAnswer(
      "cat:restaurant",
      null,
      { lng: -77.4105, lat: 39.4143 },
      pinned,
      {
        contextLabel: "Near you",
        contextSource: "device",
      },
    );
    const coffee = buildWantAnswer(
      "coffee",
      null,
      { lng: -77.4105, lat: 39.4143 },
      pinned,
      {
        contextLabel: "Near you",
        contextSource: "device",
      },
    );
    const restaurantSlugs = [
      restaurant?.hero?.slug,
      ...(restaurant?.also.map((row) => row.slug) ?? []),
    ];
    const coffeeSlugs = [
      coffee?.hero?.slug,
      ...(coffee?.also.map((row) => row.slug) ?? []),
    ];

    expect(restaurantSlugs).not.toContain("the-original-popcorn-house");
    expect(coffeeSlugs).not.toContain("voila-in-frederick");
    } finally {
      vi.useRealTimers();
    }
  });

  it("leads with Gravel & Grind for coffee beside its downtown storefront", () => {
    const answer = buildWantAnswer(
      "coffee",
      null,
      { lng: -77.4096, lat: 39.42165 },
      new Date("2026-07-26T16:00:00.000Z"),
      {
        contextLabel: "Near you",
        contextSource: "device",
      },
    );

    expect(answer?.hero).toMatchObject({
      slug: "gravel-and-grind-frederick",
      name: "Gravel & Grind",
    });
    expect(answer?.hero?.confidence).toBeUndefined();
    expect(answer?.hero?.distance).toBe("1 min walk");
    expect(answer?.also.some((row) => /starbucks/i.test(row.name))).toBe(false);
  });

  it("does not let an approximate centroid crown the fluke nearest place", () => {
    const ranked = rankBestFit([
      cand({ slug: "centroid-chain", name: "Starbucks", distance_m: 80, feature_score: 5 }),
      cand({ slug: "local-fit", name: "Local Coffee", distance_m: 2_000, feature_score: 8, local_favorite: true }),
    ], false);

    expect(ranked[0]?.slug).toBe("local-fit");
  });

  it("returns a complete, deduplicated brewery set without treating stale hours as open", () => {
    const answer = buildWantAnswer(
      "breweries",
      null,
      null,
      new Date("2026-07-18T00:00:00Z"),
    );
    expect(answer?.open).toBeDefined();
    expect(answer?.total).toBeGreaterThan(10);
    expect(
      answer?.open?.every((row) =>
        row.confidence === "likely"
          ? row.fact === "Likely open · check hours"
          : /^(?:Open|Closing soon)\b/.test(row.fact),
      ),
    ).toBe(true);
    expect(new Set(answer?.open?.map((row) => row.slug)).size).toBe(answer?.open?.length);
  });

  it("keeps expired hours neutral instead of presenting them as current", () => {
    const answer = buildWantAnswer(
      "coffee",
      null,
      null,
      new Date("2030-07-28T17:00:00.000Z"),
    );

    expect(answer?.hero).not.toBeNull();
    expect(answer?.rankingMode).toBe("best-fit");
    expect(answer?.mayAssertNoneOpen).toBe(false);
    expect(answer?.hero?.confidence).toBeUndefined();
    expect(answer?.hero?.fact).toBe("Hours not confirmed");
    expect(answer?.also.every((row) => row.confidence == null)).toBe(true);
  });

  it("keeps boba out of the generic coffee answer's lead choices", () => {
    const answer = buildWantAnswer(
      "coffee",
      null,
      null,
      new Date("2030-07-28T17:00:00.000Z"),
    );
    const leadChoices = [answer?.hero, ...(answer?.also ?? [])]
      .filter((row): row is NonNullable<typeof row> => Boolean(row));

    expect(leadChoices).toHaveLength(5);
    expect(
      leadChoices.every((row) => !/\b(?:boba|bubble tea|tea emporium)\b/i.test(row.name)),
    ).toBe(true);
  });

  it("answers movies with both local cinemas and their official showtime actions", () => {
    const answer = buildWantAnswer(
      "movies",
      null,
      null,
      new Date("2026-07-26T23:00:00.000Z"),
    );
    const choices = [answer?.hero, ...(answer?.also ?? [])].filter(Boolean);

    expect(answer).toMatchObject({
      rankingMode: "best-fit",
      total: 2,
      later: [],
      notable: [],
    });
    expect(choices).toHaveLength(2);
    expect(choices.map((row) => row?.name).sort()).toEqual([
      "Regal Westview",
      "Warehouse Cinemas Frederick",
    ]);
    expect(choices.every((row) => row?.fact === "Choose a film and showtime.")).toBe(true);
    expect(choices.map((row) => row?.action)).toEqual(
      expect.arrayContaining([
        {
          label: "Showtimes & tickets",
          href: "https://frederick.warehousecinemas.com/tickets-showtimes/",
        },
        {
          label: "Showtimes & tickets",
          href: "https://www.regmovies.com/theatres/regal-westview-1910",
        },
      ]),
    );
  });
});

// ── approxHeroIndex — the coarse-origin hero rule ────────────────────
// An IP-seeded centroid may ORDER the list but must not CROWN the hero:
// among the nearest pool, the strongest place wins (the July 2026 Reddit
// review caught a chain nearest the IP centroid outranking downtown).
import { approxHeroIndex, type WantCandidate as WC } from "./want-answer";

const openAt = (slug: string, distance_m: number, feature_score: number): WC => ({
  slug,
  name: slug,
  open_status: { state: "open" } as WC["open_status"],
  distance_m,
  feature_score,
});

describe("approxHeroIndex", () => {
  it("crowns the strongest place in the near pool, not the fluke nearest", () => {
    const open = [
      openAt("chain-nearest-centroid", 400, 0.2),
      openAt("downtown-favorite", 2100, 0.9),
      openAt("solid-second", 2400, 0.7),
    ];
    expect(approxHeroIndex(open)).toBe(1);
  });

  it("keeps the nearest when it is also the strongest", () => {
    const open = [openAt("best-and-nearest", 300, 0.95), openAt("weaker", 900, 0.4)];
    expect(approxHeroIndex(open)).toBe(0);
  });

  it("only considers the plausibly-near pool (first 10)", () => {
    const open = [
      ...Array.from({ length: 10 }, (_, i) => openAt(`near-${i}`, 100 * (i + 1), 0.5)),
      openAt("far-side-of-county-superstar", 30000, 1),
    ];
    expect(approxHeroIndex(open)).toBeLessThan(10);
  });

  it("handles empty and single-item lists", () => {
    expect(approxHeroIndex([])).toBe(0);
    expect(approxHeroIndex([openAt("only", 100, 0.1)])).toBe(0);
  });
});

// ── One location per chain in the short row ──────────────────────────
//
// Measured against the live catalog on 2026-08-21. The rule changes nothing
// during the day, because the open set is already local and varied. It earns
// its place in the thin hours, when chains are most of what is open:
//
//   coffee, 5:30am
//     before  Starbucks | Starbucks | Dunkin' | Starbucks Coffee Company | Dunkin'
//     after   Starbucks | Dunkin'
//
//   breakfast, 5:30am
//     before  Starbucks | Starbucks | Dunkin' | Starbucks Coffee Company | Penny's Diner
//     after   Starbucks | Dunkin' | Penny's Diner | McDonald's
//
// The breakfast case is the point: the duplicate Starbucks rows were not
// adding options, they were consuming the slots two other places needed.
describe("buildWantAnswer — one location per chain", () => {
  const origin = { lng: -77.4109, lat: 39.4137 };
  const at = (iso: string) => new Date(iso);

  it("does not spend the short row on repeats of one brand", () => {
    const answer = buildWantAnswer("coffee", null, origin, at("2026-08-21T09:30:00.000Z"));
    expect(answer).not.toBeNull();
    const brands = [answer!.hero, ...answer!.also]
      .filter((row) => row != null)
      .map((row) => chainBrandKey(row.name))
      .filter((brand): brand is string => brand != null);

    expect(new Set(brands).size).toBe(brands.length);
  });

  it("claims the hero's brand too, so no alternative repeats it", () => {
    const answer = buildWantAnswer("breakfast", null, origin, at("2026-08-21T09:30:00.000Z"));
    const heroBrand = answer?.hero ? chainBrandKey(answer.hero.name) : null;
    if (!heroBrand || !answer) return;

    expect(answer.also.map((row) => chainBrandKey(row.name))).not.toContain(heroBrand);
  });

  it("leaves independents alone, however many share a row", () => {
    // Two genuinely different local places must both survive; only chain
    // BRANDS collapse. A rule that deduped by anything looser would quietly
    // delete real answers.
    const answer = buildWantAnswer("coffee", null, origin, at("2026-08-21T14:00:00.000Z"));
    expect(answer).not.toBeNull();
    const names = [answer!.hero, ...answer!.also]
      .filter((row) => row != null)
      .map((row) => row.name);

    expect(names.length).toBeGreaterThan(2);
    expect(new Set(names).size).toBe(names.length);
  });
});
