import { describe, expect, it } from "vitest";
import { hashSourceContent } from "../scripts/lib/source-content-fingerprint";
import {
  emptyVenueSourceState,
  parseVenueSourceState,
  recordVenueSourceObservation,
  serializeVenueSourceState,
  unchangedVenueSourceOutcome,
} from "../scripts/lib/venue-source-state";

describe("venue source extraction state", () => {
  it("remembers successful empty and event outcomes independently per URL", () => {
    const state = emptyVenueSourceState();
    const contentHash = hashSourceContent("Friday: Jazz at 8pm");
    recordVenueSourceObservation(
      state,
      "test-venue",
      "https://venue.example/events",
      {
        contentHash,
        finalUrl: "https://venue.example/events",
        method: "render",
        extractorVersion: "venue-text-v1",
        outcome: "events",
      },
    );

    expect(
      unchangedVenueSourceOutcome(
        state,
        "test-venue",
        "https://venue.example/events",
        {
          contentHash,
          finalUrl: "https://venue.example/events",
          method: "render",
          extractorVersion: "venue-text-v1",
        },
      ),
    ).toBe("events");
    expect(
      unchangedVenueSourceOutcome(
        state,
        "test-venue",
        "https://venue.example/calendar",
        {
          contentHash,
          finalUrl: "https://venue.example/events",
          method: "render",
          extractorVersion: "venue-text-v1",
        },
      ),
    ).toBeNull();
  });

  it("round-trips validated state in stable key order", () => {
    const state = emptyVenueSourceState();
    const hash = hashSourceContent("No upcoming events");
    recordVenueSourceObservation(state, "z-venue", "https://z.example", {
      contentHash: hash,
      finalUrl: "https://z.example",
      method: "fetch",
      extractorVersion: "venue-text-v1",
      outcome: "empty",
    });
    recordVenueSourceObservation(state, "a-venue", "https://a.example", {
      contentHash: hash,
      finalUrl: "https://a.example",
      method: "render",
      extractorVersion: "venue-text-v1",
      outcome: "events",
    });

    const serialized = serializeVenueSourceState(state);
    expect(serialized.indexOf("a-venue")).toBeLessThan(
      serialized.indexOf("z-venue"),
    );
    expect(parseVenueSourceState(JSON.parse(serialized))).toEqual(
      JSON.parse(serialized),
    );
  });

  it("rejects a malformed hash instead of disabling the guard silently", () => {
    expect(() =>
      parseVenueSourceState({
        schemaVersion: 1,
        sources: {
          venue: {
            inputs: {
              "https://venue.example": {
                contentHash: "not-a-sha256",
                finalUrl: "https://venue.example",
                method: "fetch",
                extractorVersion: "venue-text-v1",
                outcome: "empty",
              },
            },
          },
        },
      }),
    ).toThrow(/invalid/i);
  });
});
