import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Place } from "@/data/places";
import type { OwnerListingConfirmationInput } from "@/lib/submissions";

const mocks = vi.hoisted(() => ({
  approvedOwnerClaimForToken: vi.fn(),
  getDb: vi.fn(),
  insert: vi.fn(),
  ownerListingPlaceForSlug: vi.fn(),
  values: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db/client", () => ({ getDb: mocks.getDb }));
vi.mock("@/lib/db/schema", () => ({ submissions: "submissions" }));
vi.mock("@/lib/business/manage-access", () => ({
  approvedOwnerClaimForToken: mocks.approvedOwnerClaimForToken,
}));
vi.mock("@/lib/business/owner-listing-server", () => ({
  ownerListingPlaceForSlug: mocks.ownerListingPlaceForSlug,
}));

import { submitOwnerListingConfirmationAction } from "./manage-actions";

function input(
  over: Partial<OwnerListingConfirmationInput> = {},
): OwnerListingConfirmationInput {
  return {
    decision: "confirmed",
    changed_fields: [],
    proposed_status: "",
    proposed_hours: "",
    proposed_phone: "",
    proposed_website: "",
    details: "",
    ...over,
  };
}

const PLACE: Place = {
  slug: "test-cafe",
  name: "Test Cafe",
  category: "coffee",
  short_blurb: "A test listing.",
  address: "1 Market Street",
  city: "Frederick",
  state: "MD",
  postal_code: "21701",
  municipality: "frederick",
  geom: { lng: -77.41, lat: 39.41 },
  phone: "301-555-0100",
  website: "https://example.com",
  hours: { mon: [{ open: "08:00", close: "17:00" }] },
  hours_updated_at: "2026-08-10T12:00:00.000Z",
  is_operational: "operational",
  is_verified: true,
  feature_score: 5,
  source: "manual",
  updated_at: "2026-08-10T12:00:00.000Z",
};

describe("submitOwnerListingConfirmationAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.values.mockResolvedValue(undefined);
    mocks.insert.mockReturnValue({ values: mocks.values });
    mocks.getDb.mockReturnValue({ insert: mocks.insert });
    mocks.approvedOwnerClaimForToken.mockResolvedValue({
      id: "claim-123",
      place_slug: "test-cafe",
      payload: { business_name: "Test Cafe" },
      submitter_email: "owner@example.com",
    });
    mocks.ownerListingPlaceForSlug.mockReturnValue(PLACE);
  });

  it("writes a confirmation to the existing moderated submissions queue", async () => {
    await submitOwnerListingConfirmationAction("owner-token", input());

    expect(mocks.approvedOwnerClaimForToken).toHaveBeenCalledWith("owner-token");
    expect(mocks.values).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: "listing_confirmation",
        place_slug: "test-cafe",
        submitter_email: "owner@example.com",
        payload: expect.objectContaining({
          action: "confirmed",
          moderation: "required",
          claim_submission_id: "claim-123",
          observed_at: expect.any(String),
          review_by: expect.any(String),
          expires_at: expect.any(String),
          current_phone: "301-555-0100",
        }),
      }),
    );
  });

  it("keeps a correction pending instead of mutating the place", async () => {
    await submitOwnerListingConfirmationAction(
      "owner-token",
      input({
        decision: "change",
        changed_fields: ["phone"],
        proposed_phone: "301-555-0199",
      }),
    );

    expect(mocks.values).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: "listing_change",
        payload: expect.objectContaining({
          moderation: "required",
          current_phone: "301-555-0100",
          proposed_phone: "301-555-0199",
        }),
      }),
    );
    expect(mocks.insert).toHaveBeenCalledWith("submissions");
  });

  it("validates before looking up the capability or writing", async () => {
    await expect(
      submitOwnerListingConfirmationAction(
        "owner-token",
        input({ decision: "change", changed_fields: [] }),
      ),
    ).rejects.toThrow(/at least one/i);
    expect(mocks.approvedOwnerClaimForToken).not.toHaveBeenCalled();
    expect(mocks.insert).not.toHaveBeenCalled();
  });

  it("refuses a token that is not tied to a current Radius listing", async () => {
    mocks.approvedOwnerClaimForToken.mockResolvedValue({
      id: "claim-123",
      place_slug: null,
      payload: { business_name: "Test Cafe" },
      submitter_email: "owner@example.com",
    });

    await expect(
      submitOwnerListingConfirmationAction("owner-token", input()),
    ).rejects.toThrow(/not tied/i);
    expect(mocks.values).not.toHaveBeenCalled();
  });
});
