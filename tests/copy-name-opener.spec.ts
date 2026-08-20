import { describe, expect, it } from "vitest";
import { classifyDescription } from "@/lib/copy-quality";

/**
 * The name-opener rule, pinned in both directions.
 *
 * The unreviewed classifier used to reject any description whose first ~13
 * characters matched the place name, which condemned publishable copy for the
 * county's best-known places (Baker Park, Cunningham Falls, Monocacy
 * Battlefield, Brewer's Alley, The Curious Iguana) while the reviewed path
 * had always applied the correct test. Seventeen place pages rendered nothing
 * because of it.
 *
 * Both halves matter. Loosening this rule without keeping the second block
 * below would let a bare scraped name echo back onto a place page, which is
 * the thing the original rule existed to prevent.
 */
describe("name-opener classification", () => {
  it("accepts a real sentence that happens to open with the place name", () => {
    for (const [name, description] of [
      [
        "Baker Park",
        "Baker Park is a 44-acre downtown park with a band shell, lake, tennis, and the Joseph D. Baker carillon tower.",
      ],
      [
        "Cunningham Falls State Park",
        "Cunningham Falls State Park has a 78-foot waterfall, lake swimming, and the Hunting Creek camping area.",
      ],
      [
        "Brewer's Alley",
        "Brewer's Alley has operated downtown since 1996, serving house beer alongside pizza and burgers.",
      ],
    ] as const) {
      expect(
        classifyDescription(name, description),
        `${name} should classify as publishable`,
      ).toBe("auto_clean");
    }
  });

  it("still rejects a bare name echo with nothing after it", () => {
    // Fewer than five words follow the name, so there is no sentence here —
    // only the listing title wearing a description's clothes.
    expect(classifyDescription("Baker Park", "Baker Park, Frederick MD")).toBe(
      "scraped",
    );
    expect(
      classifyDescription("The Curious Iguana", "The Curious Iguana bookstore"),
    ).toBe("scraped");
  });

  it("keeps rejecting scraped patterns that open with the name", () => {
    // A name opener must not become a free pass through the other rules.
    expect(
      classifyDescription(
        "Baker Park",
        "Baker Park is located at 121 North Bentz Street, Frederick, MD 21701.",
      ),
      "address dump",
    ).toBe("scraped");
    expect(
      classifyDescription(
        "Baker Park",
        "Baker Park is your destination for the best unforgettable experiences in town.",
      ),
      "marketing copy",
    ).toBe("scraped");
  });
});
