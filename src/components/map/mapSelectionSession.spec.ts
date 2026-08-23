// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  MAP_SELECTION_SESSION_MAX_ENTRIES,
  MAP_SELECTION_SESSION_MAX_PAYLOAD_CHARS,
  MAP_SELECTION_SESSION_TTL_MS,
  clearMapSelectionSessionStore,
  isMapSelectionToken,
  readMapSelectionSession,
  writeMapSelectionSession,
} from "./mapSelectionSession";

const temporarySpot = {
  kind: "spot",
  value: {
    lng: -77.4101,
    lat: 39.4159,
    label: "12 East Church Street",
    temporary: true,
    attribution: "Map data © Mapbox",
  },
};

describe("temporary map selection session", () => {
  beforeEach(() => {
    clearMapSelectionSessionStore();
    vi.restoreAllMocks();
  });

  it("stores a validated selection behind an opaque bounded token", () => {
    const token = writeMapSelectionSession(temporarySpot, 1_000);

    expect(isMapSelectionToken(token)).toBe(true);
    expect(token).toMatch(/^[0-9a-f]{32}$/);
    expect(token).not.toContain("church");
    expect(readMapSelectionSession(token, 1_001)).toEqual(temporarySpot);
  });

  it("expires temporary provider payloads instead of replaying stale data", () => {
    const token = writeMapSelectionSession(temporarySpot, 1_000);

    expect(
      readMapSelectionSession(
        token,
        1_000 + MAP_SELECTION_SESSION_TTL_MS + 1,
      ),
    ).toBeNull();
    expect(readMapSelectionSession(token, 1_001)).toBeNull();
  });

  it("rejects malformed snapshots before writing them", () => {
    const malformed = {
      kind: "spot",
      value: { lng: "-77.4101", lat: 39.4159 },
    };

    expect(writeMapSelectionSession(malformed, 1_000)).toBeNull();
    expect(window.sessionStorage.length).toBe(0);
  });

  it("rejects a single unbounded provider payload", () => {
    const oversized = {
      ...temporarySpot,
      value: {
        ...temporarySpot.value,
        label: "x".repeat(MAP_SELECTION_SESSION_MAX_PAYLOAD_CHARS),
      },
    };

    expect(writeMapSelectionSession(oversized, 1_000)).toBeNull();
    expect(window.sessionStorage.length).toBe(0);
  });

  it("bounds the number of session payloads retained in one tab", () => {
    for (let index = 0; index < MAP_SELECTION_SESSION_MAX_ENTRIES + 8; index += 1) {
      writeMapSelectionSession(
        {
          ...temporarySpot,
          value: { ...temporarySpot.value, lng: -77.4101 + index / 10_000 },
        },
        1_000 + index,
      );
    }

    expect(window.sessionStorage.length).toBe(
      MAP_SELECTION_SESSION_MAX_ENTRIES,
    );
  });

  it("keeps the journey working in memory when session storage is blocked", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("blocked", "SecurityError");
    });
    const token = writeMapSelectionSession(temporarySpot, 1_000);
    vi.restoreAllMocks();

    expect(readMapSelectionSession(token, 1_001)).toEqual(temporarySpot);
  });
});
