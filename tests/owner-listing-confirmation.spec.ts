import { describe, expect, it } from "vitest";
import type { Place } from "@/data/places";
import {
  confirmableListingFields,
  ownerListingAuditPayload,
  ownerListingFacts,
} from "@/lib/business/owner-listing-confirmation";
import {
  validateOwnerListingConfirmation,
  type OwnerListingConfirmationInput,
} from "@/lib/submissions";

const NOW = new Date("2026-08-11T16:00:00.000Z");

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

function place(over: Partial<Place> = {}): Place {
  return {
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
    hours: {
      mon: [{ open: "08:00", close: "17:00" }],
      tue: [],
    },
    hours_updated_at: "2026-08-10T12:00:00.000Z",
    is_operational: "operational",
    is_verified: true,
    feature_score: 5,
    source: "manual",
    updated_at: "2026-08-10T12:00:00.000Z",
    last_verified_at: "2026-08-10T12:00:00.000Z",
    ...over,
  };
}

describe("validateOwnerListingConfirmation", () => {
  it("accepts a clean confirmation", () => {
    expect(validateOwnerListingConfirmation(input())).toBeNull();
  });

  it("requires an explicit decision", () => {
    expect(validateOwnerListingConfirmation(input({ decision: "" }))).toMatch(
      /choose whether/i,
    );
  });

  it("does not mix a confirmation with changed fields", () => {
    expect(
      validateOwnerListingConfirmation(
        input({ changed_fields: ["phone"] }),
      ),
    ).toMatch(/cannot include changed/i);
  });

  it("requires at least one field for a change", () => {
    expect(
      validateOwnerListingConfirmation(input({ decision: "change" })),
    ).toMatch(/at least one/i);
  });

  it("requires a current status and written hours when those fields change", () => {
    expect(
      validateOwnerListingConfirmation(
        input({ decision: "change", changed_fields: ["status"] }),
      ),
    ).toMatch(/current status/i);
    expect(
      validateOwnerListingConfirmation(
        input({ decision: "change", changed_fields: ["hours"] }),
      ),
    ).toMatch(/current hours/i);
  });

  it("requires a note for an unstructured change", () => {
    expect(
      validateOwnerListingConfirmation(
        input({ decision: "change", changed_fields: ["other"] }),
      ),
    ).toMatch(/what else/i);
  });

  it("accepts a blank website as an explicit removal but rejects unsafe links", () => {
    expect(
      validateOwnerListingConfirmation(
        input({ decision: "change", changed_fields: ["website"] }),
      ),
    ).toBeNull();
    expect(
      validateOwnerListingConfirmation(
        input({
          decision: "change",
          changed_fields: ["website"],
          proposed_website: "javascript:alert(1)",
        }),
      ),
    ).toMatch(/http/i);
  });

  it("rejects duplicate or unknown field identifiers", () => {
    expect(
      validateOwnerListingConfirmation(
        input({
          decision: "change",
          changed_fields: ["phone", "phone"],
        }),
      ),
    ).toMatch(/valid listing details/i);

    expect(
      validateOwnerListingConfirmation(
        input({
          decision: "change",
          changed_fields: ["phone", "private_notes" as "phone"],
        }),
      ),
    ).toMatch(/valid listing details/i);
  });
});

describe("owner listing evidence", () => {
  it("shows only days actually present in a partial hours record", () => {
    const facts = ownerListingFacts(place());
    expect(facts.hours?.lines).toEqual(["Mon 8am–5pm", "Tue Closed"]);
    expect(facts.hours?.lines.join(" ")).not.toContain("Wed");
  });

  it("does not treat an unverified status marker as a fact the owner confirmed", () => {
    const facts = ownerListingFacts(
      place({
        is_operational: "needs_verification",
        hours: undefined,
        phone: undefined,
        website: undefined,
      }),
    );
    expect(facts.status?.label).toBe("Not yet confirmed");
    expect(confirmableListingFields(facts)).toEqual([]);
  });

  it("creates a dated, expiring confirmation without publishing a mutation", () => {
    const payload = ownerListingAuditPayload({
      businessName: "Test Cafe",
      claimSubmissionId: "claim-123",
      input: input(),
      place: place(),
      now: NOW,
    });

    expect(payload).toMatchObject({
      action: "confirmed",
      moderation: "required",
      source_role: "approved_owner",
      observed_at: "2026-08-11T16:00:00.000Z",
      review_by: "2026-08-14T16:00:00.000Z",
      expires_at: "2026-08-18T16:00:00.000Z",
      fields: ["status", "hours", "phone", "website"],
      current_phone: "301-555-0100",
    });
    expect(payload).not.toHaveProperty("published_at");
  });

  it("keeps proposed changes separate from the current snapshot", () => {
    const payload = ownerListingAuditPayload({
      businessName: "Test Cafe",
      claimSubmissionId: "claim-123",
      input: input({
        decision: "change",
        changed_fields: ["status", "website"],
        proposed_status: "closed_temporarily",
        proposed_website: "",
        details: "Closed for renovation.",
      }),
      place: place(),
      now: NOW,
    });

    expect(payload).toMatchObject({
      action: "change",
      review_by: "2026-08-12T16:00:00.000Z",
      expires_at: "2026-09-10T16:00:00.000Z",
      current_status: "operational",
      current_website: "https://example.com",
      proposed_status: "closed_temporarily",
      proposed_website: "[remove]",
    });
  });
});
