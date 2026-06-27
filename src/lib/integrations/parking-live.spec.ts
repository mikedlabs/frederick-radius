import { describe, it, expect } from "vitest";
import { parseOccupancy, GARAGE_FULL_THRESHOLD } from "./parking-live";

describe("parseOccupancy", () => {
  it("returns an empty snapshot for junk / empty input (never fabricates)", () => {
    expect(parseOccupancy(null).decks).toEqual([]);
    expect(parseOccupancy({}).decks).toEqual([]);
    expect(parseOccupancy({ decks: "nope" }).decks).toEqual([]);
  });

  it("derives available from capacity − occupied, and percent_full", () => {
    const snap = parseOccupancy({
      decks: [{ name: "Court Street Garage", capacity: 400, occupied: 380 }],
    });
    const d = snap.decks[0];
    expect(d.available).toBe(20);
    expect(d.percentFull).toBe(95);
    expect(d.isFull).toBe(true); // 95 >= threshold
  });

  it("maps feed deck names to our canonical garage slugs", () => {
    const snap = parseOccupancy({
      decks: [
        { name: "Carroll Creek Deck", capacity: 100, available: 40 },
        { name: "West Patrick St", capacity: 100, available: 10 },
        { name: "Church Street", capacity: 100, available: 90 },
        { name: "East All Saints", capacity: 100, available: 0 },
      ],
    });
    const slugs = snap.decks.map((d) => d.garageSlug);
    expect(slugs).toEqual([
      "carroll-creek-parking-garage-frederick",
      "west-patrick-street-parking-deck",
      "church-street-garage",
      "east-all-saints-street-parking-garage",
    ]);
  });

  it("treats zero spaces or a FULL status as full even without a percentage", () => {
    const zero = parseOccupancy({ decks: [{ name: "Court", available: 0 }] }).decks[0];
    expect(zero.isFull).toBe(true);
    const status = parseOccupancy({ decks: [{ name: "Court", status: "FULL" }] }).decks[0];
    expect(status.isFull).toBe(true);
  });

  it("flags filling-up (75–89%) without marking it full", () => {
    const d = parseOccupancy({ decks: [{ name: "Court", capacity: 100, occupied: 80 }] }).decks[0];
    expect(d.percentFull).toBe(80);
    expect(d.isFull).toBe(false);
    expect(d.isFilling).toBe(true);
    expect(GARAGE_FULL_THRESHOLD).toBeGreaterThan(80);
  });

  it("leaves unknown counts null rather than guessing, and keeps unmatched decks", () => {
    const d = parseOccupancy({ decks: [{ name: "Some New Lot" }] }).decks[0];
    expect(d.available).toBeNull();
    expect(d.occupied).toBeNull();
    expect(d.percentFull).toBeNull();
    expect(d.isFull).toBe(false);
    expect(d.garageSlug).toBeNull(); // unmatched name → no card badge, but not dropped
  });

  it("accepts a bare array and common field aliases", () => {
    const d = parseOccupancy([{ garage: "Court Street", spaces: 300, free: 5 }]).decks[0];
    expect(d.capacity).toBe(300);
    expect(d.available).toBe(5);
    expect(d.occupied).toBe(295);
    expect(d.garageSlug).toBe("court-street-parking-garage-frederick");
  });
});
