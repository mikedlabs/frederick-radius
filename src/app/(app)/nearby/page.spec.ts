import { describe, expect, it } from "vitest";
import { generateMetadata } from "./page";

describe("nearby metadata", () => {
  it("names the native movies destination instead of the generic Nearby page", async () => {
    const metadata = await generateMetadata({
      searchParams: Promise.resolve({ c: "movies" }),
    });

    expect(metadata.title).toBe("Movies");
    expect(metadata.alternates?.canonical).toBe("/nearby?c=movies");
  });

  it("uses the selected everyday intent in the page title", async () => {
    const metadata = await generateMetadata({
      searchParams: Promise.resolve({ c: "coffee" }),
    });

    expect(metadata.title).toBe("Coffee nearby");
  });

  it("treats inherited object keys as invalid cravings", async () => {
    const metadata = await generateMetadata({
      searchParams: Promise.resolve({ c: "toString" }),
    });

    expect(metadata.title).toBe("Nearby");
    expect(metadata.alternates?.canonical).toBe("/nearby");
  });
});
