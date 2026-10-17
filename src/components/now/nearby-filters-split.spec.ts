import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("Nearby filter sheet stays off the Today graph", () => {
  it("loads RightNow only from the Nearby route, and the sheet only on demand", () => {
    const nearbyPage = readFileSync("src/app/(app)/nearby/page.tsx", "utf8");
    const rightNow = readFileSync("src/components/now/RightNow.tsx", "utf8");
    const sheet = readFileSync("src/components/now/NearbyFiltersSheet.tsx", "utf8");
    const todayPage = readFileSync("src/app/(app)/today/page.tsx", "utf8");

    expect(nearbyPage).toContain('import("@/components/now/RightNow")');
    expect(rightNow).toContain('dynamic(() => import("./NearbyFiltersSheet")');
    expect(sheet).toContain('from "@/components/ui/BottomSheet"');
    expect(sheet).toContain("Filters & sort");
    expect(todayPage).not.toContain("NearbyFiltersSheet");
    expect(todayPage).not.toContain("RightNow");
    expect(todayPage).not.toContain("BottomSheet");
  });
});
