import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { auditAutomationOwnership } from "../scripts/automation-ownership-audit.mjs";

describe("automation ownership", () => {
  it("keeps the checked-in job system inside the reviewed boundaries", () => {
    expect(auditAutomationOwnership().failures).toEqual([]);
  });

  it.each(["data-refresh.yml", "freshness-check.yml"])(
    "keeps disconnected snapshot workflow %s manual",
    (name) => {
      const workflows = {
        [name]: `on:\n  schedule:\n    - cron: \"0 10 * * *\"`,
      };

      expect(auditAutomationOwnership({ workflows }).failures).toContain(
        `${name} must remain event-driven or manual, not scheduled`,
      );
    },
  );

  it("rejects a second paid business-status schedule", () => {
    const vercel = JSON.parse(readFileSync("vercel.json", "utf8"));
    vercel.crons.push({
      path: "/api/cron/business-status",
      schedule: "0 7 * * *",
    });
    expect(auditAutomationOwnership({ vercel }).failures).toContain(
      "business-status must not duplicate the paid hours-refresh sweep",
    );
  });

  it("keeps automated data PRs on a focused gate and code PRs on the full gate", () => {
    const ci = readFileSync(".github/workflows/ci.yml", "utf8");
    expect(ci).toContain("Validate automated data artifacts");
    expect(ci).toContain("run: npm run test:data-artifacts");
    expect(ci).toContain("if: ${{ env.AUTOMATED_DATA_PR != '1' }}");
    expect(ci).toContain("Production browser and connected-journey gate");
  });

  it("does not promise saved-event pushes while their worker is dormant", () => {
    const settings = readFileSync(
      "src/components/settings/NotificationsCard.tsx",
      "utf8",
    );
    expect(settings).not.toContain('topics: ["saved-events"');
  });
});
