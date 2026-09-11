import { describe, expect, it } from "vitest";
import {
  hashSourceBytes,
  hashSourceContent,
  normalizeSourceContent,
  sourceFingerprintMatches,
} from "../scripts/lib/source-content-fingerprint";

describe("source content fingerprints", () => {
  it("normalizes transport whitespace without erasing source facts", () => {
    const noisy =
      "\uFEFF  Happy\u00a0hour:\tMon–Fri 4–6pm  \r\n\r\n  $5 drafts\u200B ";
    expect(normalizeSourceContent(noisy)).toBe(
      "Happy hour: Mon–Fri 4–6pm\n$5 drafts",
    );
    expect(hashSourceContent(noisy)).toBe(
      hashSourceContent("Happy hour: Mon–Fri 4–6pm\n$5 drafts"),
    );
  });

  it("changes when a decision-useful fact changes", () => {
    expect(hashSourceContent("Open until 9pm")).not.toBe(
      hashSourceContent("Open until 10pm"),
    );
    expect(hashSourceContent("Event A\nEvent B")).not.toBe(
      hashSourceContent("Event B\nEvent A"),
    );
  });

  it("fingerprints binary sources without text coercion", () => {
    expect(hashSourceBytes(new Uint8Array([0, 1, 2]))).toMatch(/^[a-f0-9]{64}$/);
    expect(hashSourceBytes(new Uint8Array([0, 1, 2]))).not.toBe(
      hashSourceBytes(new Uint8Array([0, 1, 3])),
    );
  });

  it("skips only the same payload from the same final source and method", () => {
    const contentHash = hashSourceContent("Tonight: Jazz at 8pm");
    const previous = {
      contentHash,
      finalUrl: "https://venue.example/events",
      method: "render",
      extractorVersion: "venue-text-v1",
    };
    expect(
      sourceFingerprintMatches(previous, {
        contentHash,
        finalUrl: "https://venue.example/events",
        method: "render",
        extractorVersion: "venue-text-v1",
      }),
    ).toBe(true);
    expect(
      sourceFingerprintMatches(previous, {
        contentHash,
        finalUrl: "https://other.example/events",
        method: "render",
        extractorVersion: "venue-text-v1",
      }),
    ).toBe(false);
    expect(
      sourceFingerprintMatches(previous, {
        contentHash,
        finalUrl: "https://venue.example/events",
        method: "fetch",
        extractorVersion: "venue-text-v1",
      }),
    ).toBe(false);
    expect(
      sourceFingerprintMatches(previous, {
        contentHash,
        finalUrl: "https://venue.example/events",
        method: "render",
        extractorVersion: "venue-text-v2",
      }),
    ).toBe(false);
  });
});
