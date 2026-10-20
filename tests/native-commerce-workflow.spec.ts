import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { describe, expect, it } from "vitest";
import { parse } from "yaml";
const workflow = parse(readFileSync(".github/workflows/refresh-commerce-links.yml", "utf8"));
function evaluate(expression: string, context: object) {
  return runInNewContext(`(${expression.replace(/^\$\{\{|\}\}$/g, "").trim()})`, context, { timeout: 1000 });
}
describe("bounded daily commerce delivery", () => {
  it("uses the existing owner once daily with a bounded native default and explicit manual deep read", () => {
    expect(workflow.on.schedule).toEqual([{ cron: "37 12 * * *" }]);
    expect(workflow.on.workflow_dispatch.inputs.native_daily.default).toBe(true);
    const job = workflow.jobs.refresh;
    expect(job.permissions).toEqual({ contents: "read" });
    expect(JSON.stringify(job)).not.toMatch(/secrets\.|DATABASE_URL|ANTHROPIC|OPENAI_API_KEY|FIRECRAWL_API_KEY/);
    const refresh = job.steps.find((step: { id?: string }) => step.id === "refresh");
    for (const event of ["schedule", "workflow_dispatch"]) {
      expect(evaluate(refresh.env.NATIVE_DAILY, { github: { event_name: event }, inputs: { native_daily: true } })).toBe(true);
      expect(evaluate(job["timeout-minutes"], { github: { event_name: event }, inputs: { native_daily: true } })).toBe(15);
    }
    expect(evaluate(refresh.env.NATIVE_DAILY, { github: { event_name: "workflow_dispatch" }, inputs: { native_daily: false } })).toBe(false);
    expect(refresh.run).toContain("--native-daily --limit=20 --max-follow=1");
    const browser = job.steps.find((step: { name?: string }) => step.name?.startsWith("Install Chromium"));
    expect(evaluate(browser.if, { github: { event_name: "schedule" }, inputs: {} })).toBe(false);
    expect(evaluate(browser.if, { github: { event_name: "workflow_dispatch" }, inputs: { native_daily: false } })).toBe(true);
  });
  it("avoids creating a release when nothing changed and preserves artifacts for pending source review", () => {
    const steps = workflow.jobs.refresh.steps;
    for (const name of ["Rebuild public place artifacts", "Promote reviewed place-page facts", "Stage exact commerce-link output", "Upload exact commerce-link output"]) {
      expect(steps.find((step: { name?: string }) => step.name === name).if).toBe("${{ steps.changed.outputs.changed == 'true' }}");
    }
    expect(steps.find((step: { name?: string }) => step.name === "Upload exact commerce-link output").with["retention-days"]).toBe(30);
    expect(workflow.jobs.publish.if).toBe("${{ needs.refresh.outputs.artifact_name != '' }}");
    expect(workflow.jobs.publish.uses).toBe("./.github/workflows/publish-automated-pr.yml");
    expect(workflow.jobs.publish.with.auto_merge).toBe("${{ needs.refresh.outputs.review_required == 'false' }}");
    const output = workflow.jobs.refresh.outputs.review_required;
    for (const value of [undefined, "", "true"]) expect(evaluate(output, { steps: { refresh: { outputs: { review_required: value } } } })).toBe(true);
    expect(evaluate(output, { steps: { refresh: { outputs: { review_required: "false" } } } })).toBe(false);
  });
  it("keeps private observation diagnostics outside the public publisher artifact", () => {
    const uploads = workflow.jobs.refresh.steps.filter((step: { uses?: string }) => step.uses?.startsWith("actions/upload-artifact@"));
    expect(uploads).toHaveLength(2);
    const diagnostics = uploads.find((step: { with?: { name?: string } }) => step.with?.name?.startsWith("official-commerce-observations-"));
    expect(diagnostics.with.path).toBe("${{ runner.temp }}/native-commerce-receipt.json");
    expect(diagnostics.with["retention-days"]).toBe(30);
    expect(workflow.jobs.publish.with.artifact).toBe("${{ needs.refresh.outputs.artifact_name }}");
    expect(workflow.jobs.publish.with.allowed_paths).not.toContain("receipt");
  });
  it("marks a fully unreadable selected batch as failure without penalizing a fresh no-op cohort", () => {
    const step = workflow.jobs.refresh.steps.find((s: { name?: string }) => s.name === "Report a completely unreadable native batch");
    const ctx = (selected: string, checked: string) => ({ steps: { refresh: { outputs: { native_daily: "true", selected_count: selected, checked_count: checked } } } });
    expect(evaluate(step.if, ctx("20", "0"))).toBe(true);
    expect(evaluate(step.if, ctx("0", "0"))).toBe(false);
    expect(evaluate(step.if, ctx("20", "1"))).toBe(false);
    expect(step.run).toContain("exit 1");
    expect(workflow.jobs.checks.uses).toBe("./.github/workflows/automated-pr-checks.yml");
  });
});
