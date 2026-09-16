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

  it("rejects drift from the reviewed NAS browser schedules", () => {
    const workflows = {
      "ux-audit.yml": `on:\n  schedule:\n    - cron: "17 8 * * 0"`,
      "performance-budget.yml": `on:\n  schedule:\n    - cron: "15 17 * * *"`,
    };

    expect(auditAutomationOwnership({ workflows }).failures).toContain(
      'ux-audit.yml must keep its reviewed NAS browser schedule (cron: "15 5 * * *")',
    );
  });

  it("keeps visual comparison manual until reviewed Linux baselines exist", () => {
    const workflows = {
      "ux-audit.yml": `on:\n  schedule:\n    - cron: "15 5 * * *"`,
      "performance-budget.yml": `on:\n  schedule:\n    - cron: "15 17 * * *"`,
      "visual-contract.yml": `on:\n  schedule:\n    - cron: "30 6 * * 0"`,
    };

    expect(auditAutomationOwnership({ workflows }).failures).toContain(
      "visual-contract.yml must remain dispatch-only until reviewed Linux baselines are committed",
    );
  });

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
