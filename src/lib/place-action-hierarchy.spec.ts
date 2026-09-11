import { describe, expect, it } from "vitest";
import {
  groupPlaceActions,
  type PlaceAction,
} from "./place-actions";

function action(key: string): PlaceAction {
  return {
    key,
    label: key,
    href: `https://example.com/${key}`,
    external: true,
    icon:
      key === "call"
        ? "call"
        : key === "reserve"
          ? "reserve"
          : key === "parking"
            ? "parking"
            : key === "website"
              ? "website"
              : key === "instagram"
                ? "instagram"
                : "directions",
    accent: "var(--app-brand)",
  };
}

describe("place sheet action hierarchy", () => {
  it("keeps one primary, two secondary actions, and discloses the rest", () => {
    const grouped = groupPlaceActions(
      [
        action("directions"),
        action("call"),
        action("reserve"),
        action("parking"),
        action("website"),
        action("instagram"),
      ],
      "restaurant",
    );

    expect(grouped.primary?.key).toBe("directions");
    expect(grouped.secondary.map(({ key }) => key)).toEqual(["reserve", "call"]);
    expect(grouped.more.map(({ key }) => key)).toEqual([
      "website",
      "parking",
      "instagram",
    ]);
  });

  it("promotes the parking action on a parking destination", () => {
    const grouped = groupPlaceActions(
      [action("directions"), action("parking"), action("website")],
      "parking",
    );

    expect(grouped.primary?.key).toBe("parking");
    expect(grouped.secondary.map(({ key }) => key)).toEqual([
      "website",
      "directions",
    ]);
  });
});
