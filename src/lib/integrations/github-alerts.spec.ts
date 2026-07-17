import { describe, expect, it } from "vitest";
import { buildDataHealthIssueBody, deliverDataHealthReport } from "./github-alerts";

const GATES = [
  { name: "photos", green: false },
  { name: "transit", green: true },
  { name: "ask-canary", green: true },
];
const ANOMALIES = [
  {
    source: "google-photos",
    kind: "photo_rot" as const,
    detail: "4/6 sampled photo names failed upstream.",
  },
];

describe("buildDataHealthIssueBody", () => {
  it("renders the headline, every gate with its light, and anomaly details", () => {
    const body = buildDataHealthIssueBody("2/3 green · red: photos", GATES, ANOMALIES, "Fri, Jul 17");
    expect(body).toContain("2/3 green · red: photos");
    expect(body).toContain("🔴 | `photos`");
    expect(body).toContain("🟢 | `transit`");
    expect(body).toContain("**google-photos** (`photo_rot`)");
    expect(body).toContain("/admin/data-health");
  });

  it("caps a runaway anomaly list instead of posting a wall", () => {
    const many = Array.from({ length: 20 }, (_, i) => ({
      source: `feed-${i}`,
      kind: "ingest_stale" as const,
      detail: "stale",
    }));
    const body = buildDataHealthIssueBody("0/3 green", GATES, many, "Fri, Jul 17");
    expect(body).toContain("…and 8 more");
  });
});

describe("deliverDataHealthReport", () => {
  it("is a silent skip without a token (the fail-soft contract)", async () => {
    const prev = process.env.GITHUB_ALERTS_TOKEN;
    delete process.env.GITHUB_ALERTS_TOKEN;
    const result = await deliverDataHealthReport({ headline: "3/3 green", gates: GATES, anomalies: [] });
    expect(result).toBe("skipped");
    if (prev) process.env.GITHUB_ALERTS_TOKEN = prev;
  });
});
