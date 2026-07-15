import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const repoRoot = process.cwd();

function read(relativePath: string) {
  return readFileSync(join(repoRoot, relativePath), "utf8");
}

const renderedPitchSource = [
  "src/app/pitch/page.tsx",
  "src/components/marketing/MasterSceneManager.tsx",
  ...Array.from({ length: 10 }, (_, index) => {
    const scene = String(index + 1).padStart(2, "0");
    const names = [
      "CinematicReveal",
      "InteractiveMap",
      "NoiseToSignal",
      "FourPillars",
      "DataStory",
      "CommercialIntegration",
      "Ecosystem",
      "RadiusCoin",
      "CivicHub",
      "Vision",
    ];
    return `src/components/marketing/scenes/Scene${scene}_${names[index]}.tsx`;
  }),
  "src/data/city-data-engine.ts",
].map(read).join("\n");

describe("pitch truthfulness guardrails", () => {
  it("keeps the independent concept disclosure persistent", () => {
    const page = read("src/app/pitch/page.tsx");

    expect(page).toContain("Concept prototype · Independent project");
    expect(page).toContain("Not affiliated with or endorsed by Frederick City or Frederick County government.");
    expect(page).toContain("fixed");
  });

  it.each([
    "47,234",
    "$680K",
    "150+ Partners",
    "2.5M coins",
    "305,000+ residents connected",
    "Government services, simplified",
    "Frederick County Open Data Initiative",
    "Apply, track, and manage all permits digitally",
    "Launch: Q1 2026",
    "You're on the list!",
  ])("does not restore the unsupported claim %s", (claim) => {
    expect(renderedPitchSource).not.toContain(claim);
  });

  it("labels rewards and civic transactions accurately", () => {
    expect(renderedPitchSource).toContain("No participating partners have been announced.");
    expect(renderedPitchSource).toContain("No Radius Coins have been issued.");
    expect(renderedPitchSource).toContain("Radius cannot accept, issue, or track an application.");
    expect(renderedPitchSource).toContain("Official transactions stay on official government websites.");
  });

  it("confirms beta email delivery only from the real endpoint response", () => {
    const vision = read("src/components/marketing/scenes/Scene10_Vision.tsx");

    expect(vision).toContain('fetch("/api/beta/email"');
    expect(vision).toContain("if (result.sent)");
    expect(vision).toContain("Access email accepted");
    expect(vision).not.toContain("window.location.href");
  });
});
