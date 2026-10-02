import type { ReactElement } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Place } from "@/data/places";
import type { TonightExperienceProps } from "@/components/today/TonightExperience";
import TonightPage from "./page";

const state = vi.hoisted(() => ({
  scopeCookie: undefined as string | undefined,
  cookieRead: vi.fn(),
  places: [] as Place[],
}));
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: (name: string) => {
    state.cookieRead(name);
    return state.scopeCookie ? { value: state.scopeCookie } : undefined;
  } }),
}));
vi.mock("@/components/today/TonightWeather", () => ({ default: () => null }));
vi.mock("@/components/today/CivicAlerts", () => ({ default: () => null }));
vi.mock("@/components/place/PlaceSheetBoundary", () => ({ default: () => null }));
vi.mock("@/lib/loaders/places", () => ({
  publicPlaces: () => state.places,
  decoratePlace: (place: Place) => ({ ...place, confidence: "curated" }),
}));

function place(slug: string, municipality: string): Place {
  return {
    slug, municipality, name: slug, category: "restaurant", short_blurb: "A catalog restaurant.", address: "1 Main Street",
    city: municipality, state: "MD", postal_code: "21716", geom: { lng: -77.6, lat: 39.3 },
    is_verified: true, feature_score: 1, source: "manual", updated_at: "2026-09-30T12:00:00Z",
  };
}

async function experience(query: Record<string, string> = {}) {
  const page = await TonightPage({ searchParams: Promise.resolve(query) });
  return (page.props.children as ReactElement<TonightExperienceProps>).props;
}

beforeEach(() => {
  state.scopeCookie = undefined;
  state.cookieRead.mockClear();
  state.places = [place("brunswick-place", "brunswick"), place("frederick-place", "frederick")];
});

describe("Tonight request scope", () => {
  it("uses the saved town when the entry URL has no explicit scope", async () => {
    state.scopeCookie = "town:brunswick";
    const { data } = await experience();
    expect(data.scope).toBe("town:brunswick");
    expect(data.picks.map((pick) => pick.slug)).toEqual(["brunswick-place"]);
    expect(state.cookieRead.mock.calls).toEqual([["fr_scope"]]);
  });

  it("lets an explicit county override a saved town throughout detail and weather returns", async () => {
    state.scopeCookie = "town:brunswick";
    const props = await experience({ in: "county" });
    expect(props.data.scope).toBe("county");
    expect(props.data.picks).toHaveLength(2);
    expect(new URL(props.data.picks[0].detailHref, "https://example.test").searchParams.get("returnTo"))
      .toBe("/today/tonight?intent=dinner&in=county");
    const suspense = props.weather as ReactElement<{ children: ReactElement<{ returnTo: string }> }>;
    expect(suspense.props.children.props.returnTo).toBe("/today/tonight?intent=dinner&in=county");
  });

  it("prefers an explicit town and ignores invalid scope values safely", async () => {
    state.scopeCookie = "town:brunswick";
    expect((await experience({ in: "frederick" })).data.picks.map((pick) => pick.slug))
      .toEqual(["frederick-place"]);
    expect((await experience({ in: "//evil.example" })).data.scope).toBe("town:brunswick");
    state.scopeCookie = "unrecognized";
    expect((await experience()).data.scope).toBe("county");
  });

  it("makes the saved Near me fallback visible rather than claiming nearby results", async () => {
    state.scopeCookie = "nearme";
    const { data } = await experience();
    expect(data.scope).toBe("nearme");
    expect(data.scopeLabel).toBe("Whole county");
    expect(data.scopeNote).toContain("aren’t ranked by your location");
  });
});
