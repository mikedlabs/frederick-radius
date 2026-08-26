import { describe, it, expect } from "vitest";
import {
  chooseCanonicalGooglePlaceId,
  findGooglePlaceIdCollisions,
  hasIdentitySubfacilityConflict,
  isSafeEnrichmentIdentityMatch,
  isSuspectBinding,
} from "./enrichmentBinding";
import ENRICHMENT_RAW from "@/data/places-enrichment.json" with { type: "json" };
import CLIENT_RAW from "@/data/places-client.json" with { type: "json" };
import HOURS_REFRESH_RAW from "@/data/places-hours-refresh.json" with { type: "json" };
import OVERRIDES_RAW from "@/data/places-overrides.json" with { type: "json" };
// The composed base set — curated SEED places + the DFP scrape + discovery.
// The raw JSON files alone miss the hand-authored seeds (tabu-frederick,
// el-rancho-frederick, acacia-house-frederick are all seeds — and all three
// were wrong-business bindings).
import { PLACES } from "@/data/places";
import { haversineMeters } from "@/lib/geo";
import { isGooglePlaceId } from "@/lib/provenance";
import {
  decoratePlace,
  hoursRefreshForAcceptedIdentity,
  isOperational,
  publicPlaceBySlug,
} from "@/lib/loaders/places";
import { parseGoogleHours } from "@/lib/googleHours";

type Ov = {
  fold?: Record<string, string>;
  remove?: string[];
  patch?: Record<string, { clearEnrichment?: boolean }>;
};

describe("isSuspectBinding", () => {
  it("flags a genuinely different business", () => {
    expect(isSuspectBinding("Tabu", "Law Office of Tara Shoemaker Esq. LLC")).toBe(true);
    expect(isSuspectBinding("South Market Creamery", "Bentztown")).toBe(true);
  });

  it("clears possessive / rename variants of the same business", () => {
    expect(isSuspectBinding("Bushwaller Irish Pub", "Bushwaller's")).toBe(false);
    expect(isSuspectBinding("Firestone Restaurant", "Firestone's Culinary Tavern")).toBe(false);
    expect(isSuspectBinding("Crystallume Medspa", "Crystal Lume Medical Spa")).toBe(false);
  });

  it("never flags address-style display names", () => {
    expect(isSuspectBinding("Cunningham Falls State Park", "14039 Catoctin Hollow Rd")).toBe(false);
  });
});

describe("Google identity promotion", () => {
  it("never replaces a valid canonical provider identity", () => {
    expect(
      chooseCanonicalGooglePlaceId({
        existingId: "ChIJCanonicalHospital123",
        enrichmentId: "ChIJEmergencyDepartment456",
        curatedName: "Frederick Health Hospital",
        enrichmentDisplayName:
          "Frederick Health Hospital Emergency Department",
        enrichmentOwnerCount: 1,
        claimedByAnotherCanonicalPlace: false,
      }),
    ).toBe("ChIJCanonicalHospital123");
  });

  it("promotes only a unique, unclaimed, specific same-place match", () => {
    expect(
      chooseCanonicalGooglePlaceId({
        existingId: "5ba71092-6783-4abd-abc9-3af18d0a401f",
        enrichmentId: "ChIJGravelAndGrind123",
        curatedName: "Gravel & Grind",
        enrichmentDisplayName: "Gravel and Grind",
        enrichmentOwnerCount: 1,
        claimedByAnotherCanonicalPlace: false,
      }),
    ).toBe("ChIJGravelAndGrind123");
  });

  it("accepts a unique identity independently verified by name and location", () => {
    expect(
      chooseCanonicalGooglePlaceId({
        enrichmentId: "ChIJGiantEagleWestPatrick123",
        curatedName: "Giant Eagle - West Patrick Street",
        enrichmentDisplayName: "Giant Eagle Supermarket",
        enrichmentOwnerCount: 1,
        claimedByAnotherCanonicalPlace: false,
        independentlyVerified: true,
      }),
    ).toBe("ChIJGiantEagleWestPatrick123");
  });

  it("rejects a nearby subfacility even when the resolver marked it verified", () => {
    expect(
      hasIdentitySubfacilityConflict(
        "Urbana Community Park",
        "Urbana Community Skate Park",
      ),
    ).toBe(true);
    expect(
      hasIdentitySubfacilityConflict(
        "Clustered Spires Golf Course",
        "Clustered Spires Golf Club",
      ),
    ).toBe(false);
    expect(
      chooseCanonicalGooglePlaceId({
        enrichmentId: "ChIJUrbanaSkatePark123",
        curatedName: "Urbana Community Park",
        enrichmentDisplayName: "Urbana Community Skate Park",
        enrichmentOwnerCount: 1,
        claimedByAnotherCanonicalPlace: false,
        independentlyVerified: true,
      }),
    ).toBeUndefined();
  });

  it("rejects generic-name overlap, duplicate ownership, and collisions", () => {
    expect(
      isSafeEnrichmentIdentityMatch(
        "Outreach Healthcare Frederick",
        "Frederick Health Toll House",
      ),
    ).toBe(false);
    expect(
      isSafeEnrichmentIdentityMatch(
        "Frederick County Public School",
        "Parkway Elementary School",
      ),
    ).toBe(false);
    expect(
      isSafeEnrichmentIdentityMatch("He Vox Lounge", "7th Sister"),
    ).toBe(false);

    const base = {
      existingId: undefined,
      enrichmentId: "ChIJSharedProvider123",
      curatedName: "A Specific Place",
      enrichmentDisplayName: "A Specific Place",
    };
    expect(
      chooseCanonicalGooglePlaceId({
        ...base,
        enrichmentOwnerCount: 2,
        claimedByAnotherCanonicalPlace: false,
      }),
    ).toBeUndefined();
    expect(
      chooseCanonicalGooglePlaceId({
        ...base,
        enrichmentOwnerCount: 1,
        claimedByAnotherCanonicalPlace: true,
      }),
    ).toBeUndefined();
  });

  it("finds every provider identity shared by generated records", () => {
    expect(
      findGooglePlaceIdCollisions([
        { slug: "one", google_place_id: "ChIJSharedProvider123" },
        { slug: "two", google_place_id: "ChIJSharedProvider123" },
        { slug: "three", google_place_id: "ChIJUniqueProvider456" },
      ]),
    ).toEqual([
      {
        googlePlaceId: "ChIJSharedProvider123",
        slugs: ["one", "two"],
      },
    ]);
  });

  it("keeps legacy provider facts when the canonical Google ID anchors the row", () => {
    const slug = "beanvenido-frederick";
    const legacyEnrichment = ENRICHMENT_RAW as Record<
      string,
      { google_place_id?: string }
    >;
    expect(legacyEnrichment[slug]?.google_place_id).toBeUndefined();

    const canonical = publicPlaceBySlug(slug);
    expect(canonical).toBeDefined();
    expect(isGooglePlaceId(canonical!.google_place_id)).toBe(true);

    const decorated = decoratePlace(canonical!);
    expect(decorated.google_place_id).toBe(canonical!.google_place_id);
    expect(decorated.google_rating).toBeGreaterThan(0);
    expect(decorated.google_rating_count).toBeGreaterThan(0);
  });

  it("withholds mismatched enrichment without suppressing a canonical-bound hours refresh", () => {
    const slug = "frederick-health-hospital";
    const canonical = publicPlaceBySlug(slug);
    const enrichment = (
      ENRICHMENT_RAW as Record<
        string,
        { google_place_id?: string; display_name?: string }
      >
    )[slug];

    expect(canonical).toBeDefined();
    expect(isGooglePlaceId(canonical!.google_place_id)).toBe(true);
    expect(isGooglePlaceId(enrichment?.google_place_id)).toBe(true);
    expect(enrichment?.google_place_id).not.toBe(canonical!.google_place_id);
    expect(enrichment?.display_name).toContain("Emergency Department");

    const refresh = (
      HOURS_REFRESH_RAW as unknown as Record<
        string,
        {
          place_id?: string;
          weekday_hours?: string[];
          refreshed_at: string;
        }
      >
    )[slug];
    const acceptedRefresh = hoursRefreshForAcceptedIdentity(
      refresh,
      canonical!.google_place_id,
    );
    if (refresh) {
      expect(refresh.place_id).toBe(canonical!.google_place_id);
      expect(acceptedRefresh).toBe(refresh);
    }
    const now = acceptedRefresh
      ? new Date(acceptedRefresh.refreshed_at)
      : new Date("2026-05-20T16:06:58.803Z");
    const decorated = decoratePlace(canonical!, undefined, now);
    expect(decorated.google_place_id).toBe(canonical!.google_place_id);
    expect(decorated.google_rating).toBeUndefined();
    expect(decorated.google_rating_count).toBeUndefined();
    expect(decorated.google_photo_url).toBeUndefined();
    expect(decorated.hours).toEqual(
      acceptedRefresh?.weekday_hours
        ? parseGoogleHours(acceptedRefresh.weekday_hours)
        : canonical!.hours,
    );
    expect(decorated.hours_updated_at).toBe(
      acceptedRefresh?.refreshed_at,
    );
    expect(decorated.phone).toBe(canonical!.phone);
    expect(decorated.website).toBe(canonical!.website);
    expect(decorated.geom).toEqual(canonical!.geom);
  });

  it.each([
    "north-market-farmers-market",
    "roosters-wing-box",
  ])(
    "does not let a rejected temporary-closure status hide %s",
    (slug) => {
      const canonical = publicPlaceBySlug(slug);
      expect(canonical).toBeDefined();
      expect(isOperational(canonical!)).toBe(true);
      expect(decoratePlace(canonical!).is_operational).toBe("operational");
    },
  );

  it.each([
    "marianne-riley-psychotherapy",
    "om-chakra-holistic-healing-and-massage-center",
    "outreach-healthcare-frederick",
    "rockwell-brewery-frederick",
  ])(
    "withholds the entire rejected provider bundle for %s",
    (slug) => {
      const canonical = publicPlaceBySlug(slug);
      expect(canonical, `${slug} must remain a canonical public place`).toBeDefined();
      const decorated = decoratePlace(canonical!);
      const canonicalGoogleId = isGooglePlaceId(canonical!.google_place_id)
        ? canonical!.google_place_id
        : undefined;
      expect(decorated.google_photos ?? []).toEqual([]);

      expect({
        googlePlaceId: decorated.google_place_id,
        geom: decorated.geom,
        status: decorated.is_operational,
        hours: decorated.hours,
        phone: decorated.phone,
        website: decorated.website,
        category: decorated.category,
        primaryType: decorated.primary_type,
        rating: decorated.google_rating,
        ratingCount: decorated.google_rating_count,
        photo: decorated.google_photo_url,
        reviewSnippet: decorated.review_snippet,
        reviewAuthor: decorated.review_author,
        googleVerified: decorated.google_verified,
      }).toEqual({
        googlePlaceId: canonicalGoogleId,
        geom: canonical!.geom,
        status: canonical!.is_operational,
        hours: canonical!.hours,
        phone: canonical!.phone,
        website: canonical!.website,
        category: canonical!.category,
        primaryType: undefined,
        rating: undefined,
        ratingCount: undefined,
        photo: undefined,
        reviewSnippet: undefined,
        reviewAuthor: undefined,
        googleVerified: undefined,
      });
    },
  );

  it.each(["new-hope-cafe", "the-healing-temple"])(
    "withholds %s until its local identity can be verified",
    (slug) => {
      expect(PLACES.some((place) => place.slug === slug)).toBe(true);
      expect(publicPlaceBySlug(slug)).toBeUndefined();
    },
  );
});

describe("data health: quarantine keys resolve to real base records", () => {
  // The public-set integrity checks (tests/places-data-health.spec.ts) exempt
  // quarantined slugs — a quarantine intentionally hides its record — so the
  // typo net for those keys lives HERE, against the base data files.
  it("every clearEnrichment key exists in the base place data", () => {
    const ov = OVERRIDES_RAW as Ov;
    const baseSlugs = new Set(PLACES.map((p) => p.slug));
    const typos = Object.entries(ov.patch ?? {})
      .filter(([, p]) => p.clearEnrichment)
      .map(([slug]) => slug)
      .filter((slug) => !baseSlugs.has(slug));
    expect(typos).toEqual([]);
  });
});

describe("data health: every suspect enrichment binding is quarantined or dead", () => {
  it("no live place carries another business's Google listing", () => {
    const enrichment = ENRICHMENT_RAW as Record<string, { display_name?: string }>;
    const ov = OVERRIDES_RAW as Ov;
    const dead = new Set([...(ov.remove ?? []), ...Object.keys(ov.fold ?? {})]);
    const quarantined = new Set(
      Object.entries(ov.patch ?? {})
        .filter(([, p]) => p.clearEnrichment)
        .map(([slug]) => slug),
    );
    const nameBySlug = new Map<string, string>(PLACES.map((p) => [p.slug, p.name]));

    const offenders: string[] = [];
    for (const [slug, e] of Object.entries(enrichment)) {
      if (dead.has(slug) || quarantined.has(slug)) continue;
      const name = nameBySlug.get(slug);
      if (!name || !e.display_name) continue;
      if (isSuspectBinding(name, e.display_name)) {
        offenders.push(`${slug} ("${name}" bound to "${e.display_name}")`);
      }
    }
    // If this fails after an enrichment run: eyeball each offender — if the
    // Google listing really is a different business, add a clearEnrichment
    // patch in places-overrides.json; if it's a rename of the same business,
    // teach isSuspectBinding the pattern instead of loosening blindly.
    expect(offenders, offenders.join("\n")).toEqual([]);
  });

  it("does not strand an exact nearby match under a folded legacy slug", () => {
    type EnrichmentRow = {
      display_name?: string;
      lat?: number;
      lng?: number;
    };
    type ClientRow = {
      slug: string;
      name: string;
      geom: { lng: number; lat: number };
    };
    const enrichment = ENRICHMENT_RAW as Record<string, EnrichmentRow>;
    const clients = CLIENT_RAW as ClientRow[];
    const clientSlugs = new Set(clients.map((place) => place.slug));
    const normalize = (value: string) =>
      value
        .toLowerCase()
        .normalize("NFKD")
        .replace(/[^a-z0-9]+/g, " ")
        .trim();
    const clientsByName = new Map<string, ClientRow[]>();
    for (const place of clients) {
      const key = normalize(place.name);
      clientsByName.set(key, [...(clientsByName.get(key) ?? []), place]);
    }

    const stranded: string[] = [];
    for (const [legacySlug, row] of Object.entries(enrichment)) {
      if (
        clientSlugs.has(legacySlug) ||
        !row.display_name ||
        typeof row.lat !== "number" ||
        typeof row.lng !== "number"
      ) {
        continue;
      }
      for (const place of clientsByName.get(normalize(row.display_name)) ?? []) {
        if (
          enrichment[place.slug] ||
          haversineMeters(
            { lng: row.lng, lat: row.lat },
            place.geom,
          ) > 500
        ) {
          continue;
        }
        stranded.push(
          `${legacySlug} should be reviewed against ${place.slug} (${place.name})`,
        );
      }
    }

    // A stale alias is not harmless file bloat: it withholds the Google ID
    // from the refresh cron and every canonical recommendation surface.
    expect(stranded, stranded.join("\n")).toEqual([]);
  });

  it("publishes only provider-valid Google Place IDs", () => {
    const invalid = (
      CLIENT_RAW as Array<{
        slug: string;
        google_place_id?: string;
      }>
    )
      .filter(
        (place) =>
          place.google_place_id &&
          !isGooglePlaceId(place.google_place_id),
      )
      .map((place) => place.slug);

    expect(invalid, invalid.join("\n")).toEqual([]);
  });

  it("publishes one canonical slug per Google Place ID", () => {
    const collisions = findGooglePlaceIdCollisions(
      CLIENT_RAW as Array<{
        slug: string;
        google_place_id?: string;
      }>,
    );
    expect(
      collisions,
      collisions
        .map(
          ({ googlePlaceId, slugs }) =>
            `${googlePlaceId}: ${slugs.join(", ")}`,
        )
        .join("\n"),
    ).toEqual([]);
  });
});
