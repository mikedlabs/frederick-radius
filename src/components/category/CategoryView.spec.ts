import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const view = readFileSync("src/components/category/CategoryView.tsx", "utf8");
const browse = readFileSync("src/lib/category/browse.ts", "utf8");
const page = readFileSync("src/app/(app)/category/[slug]/page.tsx", "utf8");

describe("CategoryView location contract", () => {
  it("does not substitute Downtown Frederick when no town is known", () => {
    expect(view).not.toContain("FREDERICK_CENTER");
    expect(browse).not.toContain("FREDERICK_CENTER");
    expect(browse).toContain("homeCentroid ?? undefined");
  });

  it("keeps the hard town boundary in the shared ranker, not a page-local cookies() read", () => {
    expect(browse).toContain("municipality: ranking.filterMunicipality ?? undefined");
    expect(browse).toContain("originSource: ranking.source");
    expect(page).not.toContain("cookies()");
    expect(page).toContain("export const revalidate = 600");
    expect(page).toContain("export async function generateStaticParams");
    expect(page).toContain("CategoryLiveBody");
    expect(view).toContain("selectedTown={model.filterMuni}");
  });
});
