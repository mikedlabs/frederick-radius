import { describe, it, expect } from "vitest";
import {
  validateBusinessClaim,
  type SubmitBusinessClaimInput,
} from "@/lib/submissions";

// A complete, valid claim. Negative cases override one field at a time.
function claim(
  over: Partial<SubmitBusinessClaimInput> = {},
): SubmitBusinessClaimInput {
  return {
    business_name: "Idiom Brewing Co.",
    place_slug: "",
    owner_name: "Alex Rivera",
    owner_role: "Owner",
    owner_email: "alex@idiombrewing.com",
    owner_phone: "(240) 555-0142",
    note: "",
    ...over,
  };
}

describe("validateBusinessClaim", () => {
  it("accepts a complete claim", () => {
    expect(validateBusinessClaim(claim())).toBeNull();
  });

  it("requires a business name", () => {
    expect(validateBusinessClaim(claim({ business_name: "   " }))).toMatch(
      /business name/i,
    );
  });

  it("requires the owner name", () => {
    expect(validateBusinessClaim(claim({ owner_name: "" }))).toMatch(
      /your name/i,
    );
  });

  it("requires an email", () => {
    expect(validateBusinessClaim(claim({ owner_email: "" }))).toMatch(/email/i);
  });

  it("rejects a malformed email", () => {
    expect(
      validateBusinessClaim(claim({ owner_email: "alex(at)idiom" })),
    ).toMatch(/valid email/i);
  });

  it("does not require phone, role, note, or a place slug", () => {
    expect(
      validateBusinessClaim(
        claim({ owner_phone: "", owner_role: "", note: "", place_slug: "" }),
      ),
    ).toBeNull();
  });
});
