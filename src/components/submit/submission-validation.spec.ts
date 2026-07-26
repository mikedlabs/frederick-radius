import { describe, expect, it } from "vitest";
import {
  validateClaimSubmission,
  validateEventSubmission,
  validatePlaceSubmission,
} from "./submission-validation";

function validPlace() {
  return {
    name: " Gravel & Grind ",
    category: "coffee",
    address: "15 E 6th St",
    municipality: "frederick",
    website: "https://gravelandgrind.com",
    phone: "301-555-0100",
    description: "Coffee and bikes.",
    social_url: "",
    photo_url: "",
    photo_permission: false,
    submitter_email: " Owner@Example.com ",
    submitter_name: " Mike ",
    is_owner: true,
    contact_fax: "",
  };
}

function validEvent() {
  return {
    title: "Live music",
    description: "",
    starts_at: "2026-08-01T19:00",
    ends_at: "2026-08-01T21:00",
    venue_name: "Baker Park",
    address: "",
    municipality: "frederick",
    category: "music",
    is_free: true,
    price_text: "",
    ticket_url: "https://example.com/tickets",
    organizer: "Frederick Parks",
    submitter_email: "events@example.com",
    submitter_name: "Sam",
    contact_fax: "",
  };
}

function validClaim() {
  return {
    business_name: "Gravel & Grind",
    place_slug: "gravel-and-grind",
    owner_name: "Owner",
    owner_role: "Owner",
    owner_email: "owner@example.com",
    owner_phone: "301-555-0100",
    note: "",
    contact_fax: "",
  };
}

describe("public submission validation", () => {
  it("normalizes a valid place and removes bot-proof fields from persistence", () => {
    const result = validatePlaceSubmission(validPlace());

    expect(result).toEqual({
      status: "valid",
      data: expect.objectContaining({
        name: "Gravel & Grind",
        submitter_email: "Owner@Example.com",
        submitter_name: "Mike",
      }),
    });
    if (result.status === "valid") {
      expect(result.data).not.toHaveProperty("contact_fax");
    }
  });

  it("rejects unsafe URLs and oversized public text at runtime", () => {
    expect(
      validatePlaceSubmission({
        ...validPlace(),
        website: "javascript:alert(1)",
      }),
    ).toMatchObject({ status: "invalid", message: expect.stringContaining("URL") });

    expect(
      validatePlaceSubmission({
        ...validPlace(),
        description: "x".repeat(1_501),
      }),
    ).toMatchObject({ status: "invalid", message: "Description is too long." });
  });

  it("requires allowlisted towns and categories", () => {
    expect(
      validatePlaceSubmission({
        ...validPlace(),
        municipality: "not-a-real-town",
      }),
    ).toMatchObject({ status: "invalid", message: "Choose a valid town." });

    expect(
      validatePlaceSubmission({
        ...validPlace(),
        category: "anything-the-caller-wants",
      }),
    ).toMatchObject({
      status: "invalid",
      message: "Choose a valid category.",
    });
  });

  it("quietly catches a filled honeypot before validating the rest of the payload", () => {
    expect(
      validatePlaceSubmission({
        contact_fax: "555-0100",
        unexpected: "A bot does not need to complete every required field.",
      }),
    ).toEqual({ status: "bot" });
  });

  it("rejects an invalid email and an event that ends before it starts", () => {
    expect(
      validateClaimSubmission({
        ...validClaim(),
        owner_email: "not-an-email",
      }),
    ).toMatchObject({
      status: "invalid",
      message: "Enter a valid email.",
    });

    expect(
      validateEventSubmission({
        ...validEvent(),
        ends_at: "2026-08-01T18:00",
      }),
    ).toMatchObject({
      status: "invalid",
      message: "End time must be after the start time.",
    });
  });

  it("rejects impossible calendar dates and zero-duration events", () => {
    expect(
      validateEventSubmission({
        ...validEvent(),
        starts_at: "2026-02-31T19:00",
      }),
    ).toMatchObject({
      status: "invalid",
      message: "Enter a valid start date and time.",
    });

    expect(
      validateEventSubmission({
        ...validEvent(),
        ends_at: validEvent().starts_at,
      }),
    ).toMatchObject({
      status: "invalid",
      message: "End time must be after the start time.",
    });
  });

  it("rejects missing proof instead of trusting the TypeScript call shape", () => {
    const withoutProof: Record<string, unknown> = { ...validClaim() };
    delete withoutProof.contact_fax;
    expect(validateClaimSubmission(withoutProof)).toMatchObject({
      status: "invalid",
    });
  });
});
