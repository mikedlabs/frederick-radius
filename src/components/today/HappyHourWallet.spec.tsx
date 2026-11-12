// Static fixture images only; this test never requests image bytes.
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as appearance from "@/lib/today/place-photo-appearance";
import HappyHourWallet from "./HappyHourWallet";

// Synthetic schedules and place rows isolate the real server component and
// appearance policy. None of these deals or approvals is published evidence.
const fixture = vi.hoisted(() => ({
  notes: [] as Array<{ slug: string; happy_hour: { schedule: string; details: string } }>,
  places: {} as Record<string, { slug: string; name: string; category: string; municipality: string; google_photo_url?: string; google_rating?: number }>,
}));
vi.mock("@/lib/loaders/fieldNotes", () => ({ placesWithFieldHappyHour: () => fixture.notes }));
vi.mock("@/lib/loaders/places-client", () => ({ clientPlaceBySlug: (slug: string) => fixture.places[slug] ?? null }));
vi.mock("next/image", () => ({ default: ({ src, alt = "" }: { src: string; alt?: string }) => createElement("img", { src, alt }) }));

const now = new Date("2026-10-26T20:00:00.000Z"); // Monday, 4pm New York.
const proxy = "/api/place-photo?name=places%2Foffline-happy%2Fphotos%2Fone&w=800";
const approvedInline = "/images/offline-reviewed-happy-hour.jpg";
function addPlace(slug = "offline-taproom", photo = proxy, schedule = "Daily 3-6 PM") {
  fixture.notes.push({ slug, happy_hour: { schedule, details: "$2 off fixture drinks" } });
  fixture.places[slug] = { slug, name: `Fixture ${slug}`, category: "brewery", municipality: "frederick", google_photo_url: photo, google_rating: 4.5 };
}
function render(asOf = now) { return renderToStaticMarkup(createElement(HappyHourWallet, { now: asOf })); }
function fixtureApproval(slug: string, src: string, validUntil = "2026-10-27") {
  const original = appearance.hasTodayPhotoAppearanceReview;
  const reviews: readonly appearance.TodayPhotoAppearanceReview[] = [{ slug, src, appearance: "current", reviewedOn: "2026-10-26", validUntil,
    evidence: "Offline HappyHourWallet approval fixture, not merchant appearance evidence." }];
  vi.spyOn(appearance, "hasTodayPhotoAppearanceReview").mockImplementation((selectedSlug, selectedSrc, _reviews, asOf) =>
    original(selectedSlug, selectedSrc, reviews, asOf));
}

describe("Today happy-hour appearance eligibility", () => {
  beforeEach(() => {
    fixture.notes = []; fixture.places = {};
    vi.stubGlobal("fetch", vi.fn(() => { throw new Error("No source/provider calls in a static wallet test."); }));
  });
  afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

  it("retains live deal facts, venue actions and fallback without an unapproved photo", () => {
    addPlace(); const html = render();
    expect(appearance.TODAY_PHOTO_APPEARANCE_REVIEWS).toEqual([]);
    expect(html).not.toContain("<img"); expect(html).not.toContain("/api/place-photo");
    expect(html).toContain("lucide-martini"); expect(html).toContain("1 deal available now");
    expect(html).toContain("Fixture offline-taproom"); expect(html).toContain("On now · till 6 PM");
    expect(html).toContain("$2 off fixture drinks"); expect(html).toContain('href="/places/offline-taproom"');
    expect(html).toContain('href="/happy-hour"'); expect(fetch).not.toHaveBeenCalled();
  });

  it("shows only an explicitly approved exact live source inside its review window", () => {
    addPlace(); addPlace("unreviewed-neighbor"); fixtureApproval("offline-taproom", proxy);
    const html = render(); expect((html.match(/<img\b/g) ?? []).length).toBe(1);
    expect(html).toContain('src="/api/place-photo?name=places%2Foffline-happy%2Fphotos%2Fone&amp;w=800"');
    expect(html).toContain("Fixture unreviewed-neighbor"); expect(fetch).not.toHaveBeenCalled();
  });

  it("expires a prior exact live-image approval using the same real schedule instant", () => {
    addPlace(); fixtureApproval("offline-taproom", proxy, "2026-10-26");
    const html = render(new Date("2026-10-27T20:00:00.000Z"));
    expect(html).not.toContain("<img"); expect(html).toContain("1 deal available now");
    expect(html).toContain("$2 off fixture drinks"); expect(fetch).not.toHaveBeenCalled();
  });

  it.each(["offline-taproom", "zoes-chocolate-company"])("keeps next-up %s factual without a supplied or owned-registry escape", slug => {
    addPlace(slug, proxy, "Daily 5-6 PM"); const html = render();
    expect(html).not.toContain("<img"); expect(html).not.toContain("/api/place-photo");
    expect(html).not.toContain("/images/seasons/winter/IMG_2732.jpg");
    expect(html).toContain('data-place-media="fallback"'); expect(html).toContain("Between rounds");
    expect(html).toContain("Opens 5 PM"); expect(html).toContain("$2 off fixture drinks");
    expect(html).toContain(`href="/places/${slug}"`); expect(fetch).not.toHaveBeenCalled();
  });

  it("passes next-up's actual time to the shared exact-source policy and preserves its expiry", () => {
    addPlace("offline-taproom", approvedInline, "Daily 5-6 PM"); fixtureApproval("offline-taproom", approvedInline, "2026-10-26");
    expect(render()).toContain(`src="${approvedInline}"`);
    const expired = render(new Date("2026-10-27T20:00:00.000Z"));
    expect(expired).not.toContain("<img"); expect(expired).toContain("Opens 5 PM");
    expect(expired).toContain('href="/places/offline-taproom"'); expect(fetch).not.toHaveBeenCalled();
  });
});
