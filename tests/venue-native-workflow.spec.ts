import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { describe, expect, it } from "vitest";
import { parse } from "yaml";
type Step = { name?: string; run?: string; uses?: string; id?: string; with?: Record<string, string>; env?: Record<string, string> };
type Job = { if?: string; needs?: string | string[]; environment?: string; permissions?: Record<string, string>; outputs?: Record<string, string>; steps?: Step[]; uses?: string; with?: Record<string, string> };
const workflow = parse(readFileSync(".github/workflows/ingest-venues.yml", "utf8")) as { "run-name": string; on: { schedule: { cron: string }[]; workflow_dispatch: { inputs: Record<string, { default?: unknown }> } }; jobs: Record<string, Job> };
function expression(value: string | undefined, context: object): unknown {
  if (!value) throw new Error("Missing workflow expression.");
  return runInNewContext(`(${value.replace(/^\$\{\{|\}\}$/g, "").trim()})`, context, { timeout: 1000 });
}
function context(event_name = "schedule", include_model_sources = false, ref = "refs/heads/main") {
  return { github: { event_name, ref }, inputs: { include_model_sources }, vars: { VENUE_FIRECRAWL_FETCH_FALLBACK: "1", VENUE_FIRECRAWL_FALLBACK_MAX_REQUESTS: "2" } };
}
describe("native venue workflow delivery", () => {
  it.each([["schedule", false], ["workflow_dispatch", false]] as const)("runs %s as native without admitting paid jobs", (event, paid) => {
    expect(expression(workflow.jobs.native.if, context(event, paid))).toBe(true);
    expect(expression(workflow.jobs["review-gate"].if, context(event, paid))).toBe(false);
  });
  it("requires explicit manual model admission and keeps main-only ownership", () => {
    expect(expression(workflow.jobs.native.if, context("workflow_dispatch", true))).toBe(false);
    expect(expression(workflow.jobs["review-gate"].if, context("workflow_dispatch", true))).toBe(true);
    expect(expression(workflow.jobs.native.if, context("schedule", false, "refs/heads/feature"))).toBe(false);
    expect(workflow.on.workflow_dispatch.inputs.include_model_sources.default).toBe(false);
    expect(workflow.on.schedule).toEqual([{ cron: "7 11 * * *" }]);
  });
  it("has no paid review/environment/secret/browser prerequisite for native sources", () => {
    const native = workflow.jobs.native;
    expect(native.needs).toBeUndefined(); expect(native.environment).toBeUndefined();
    expect(native.permissions).toEqual({ contents: "read" });
    expect(JSON.stringify(native)).not.toMatch(/secrets\.|ANTHROPIC|FIRECRAWL|playwright install|Data Enrichment/);
    expect(native.steps?.find((step) => step.id === "extract")?.run).toBe("npm run ingest:venues -- --deterministic-only");
    expect(workflow.jobs.ingest.environment).toBe("Data Enrichment");
    expect(workflow.jobs.ingest.steps?.find((step) => step.id === "extract")?.run).toBe("npm run ingest:venues -- --include-model-sources");
    expect(workflow.jobs["review-gate"].steps?.find((step) => step.id === "review")?.with?.script).toContain("const branch = 'bot/venue-event-refresh'");
  });
  it("reports a zero Firecrawl reservation title for every native tick even when paid fallback is enabled", () => {
    const title = (ctx: object) => workflow["run-name"].replace(/\$\{\{([\s\S]*?)\}\}/g, (_full, code: string) => String(expression(code, ctx)));
    expect(title(context())).toBe("Ingest venue events (firecrawl=0, cap=1)");
    expect(title(context("workflow_dispatch", true))).toBe("Ingest venue events (firecrawl=1, cap=2)");
  });
  it("selects a distinct native PR and requires exact safe semantic output before queuing a merge", () => {
    const publish = workflow.jobs.publish;
    const ctx = (result: string, review_required?: string) => ({ needs: { native: { result, outputs: { review_required } }, ingest: { result: result === "skipped" ? "success" : "skipped" } } });
    expect(publish.uses).toBe("./.github/workflows/publish-automated-pr.yml");
    expect(expression(publish.with?.branch, ctx("success", "false"))).toBe("bot/venue-native-refresh");
    expect(expression(publish.with?.branch, ctx("skipped"))).toBe("bot/venue-event-refresh");
    expect(expression(publish.with?.auto_merge, ctx("success", "false"))).toBe(true);
    for (const review of [undefined, "", "true"]) expect(expression(publish.with?.auto_merge, ctx("success", review))).toBe(false);
    expect(expression(publish.with?.auto_merge, ctx("skipped", "false"))).toBe(false);
    expect(publish.with?.allowed_paths.trim().split(/\s+/).sort()).toEqual(["src/data/data-release.json", "src/data/venue-event-source-inventory.json", "src/data/venue-event-source-state.json", "src/data/venue-events.json"]);
    expect(workflow.jobs.checks.uses).toBe("./.github/workflows/automated-pr-checks.yml");
    expect(workflow.jobs.checks.with?.head_sha).toBe("${{ needs.publish.outputs.pr_head_sha }}");
  });
});
