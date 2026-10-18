/** Default is an offline inventory. --live is an explicit, at-most-nine-call
 * validation through the same production gate and shared atomic allowance.
 * Never overrides flags, credentials, model, cap, endpoint, or retries. */
import { ASK_DECISION_EVAL_CASES } from "../src/lib/ask/decision-evaluation";
import { parseAskIntent } from "../src/lib/ask/intent";

async function main() {
  const live = process.argv.slice(2).includes("--live");
  const unknown = process.argv.slice(2).filter((arg) => arg !== "--live");
  if (unknown.length) throw new Error("Only --live is supported.");
  const now = new Date("2026-10-18T18:00:00Z");
  const baseline = ASK_DECISION_EVAL_CASES.map((item) => ({
    name: item.name,
    expected: item.expected,
    baseline: parseAskIntent(item.query, now).kind,
  }));
  if (!live) {
    console.log(JSON.stringify({
      mode: "offline-inventory",
      modelExercised: false,
      caseCount: baseline.length,
      message: "No model call ran. This is not an answer-quality result.",
      cases: baseline,
    }, null, 2));
    return;
  }

  const { askDecisionRuntimeConfigured, executeAskDecision, ASK_DECISION_MODEL } =
    await import("../src/lib/ask/decision-model");
  const { ASK_ROUTE_QUESTION } = await import("../src/lib/ask/decision-routing");
  if (!askDecisionRuntimeConfigured()) {
    throw new Error("Live decision evaluation is disabled. Preserve the current runtime switches and obtain approval before enabling paid Ask work.");
  }
  const cases = [];
  for (const item of ASK_DECISION_EVAL_CASES) {
    const start = performance.now();
    const result = await executeAskDecision({ state: item.query, questions: ASK_ROUTE_QUESTION });
    if (!result.ok) {
      cases.push({ name: item.name, passed: false, reason: result.reason, attempted: result.attempted });
      // An unavailable shared budget is not permission to continue or retry.
      if (!result.attempted) break;
      continue;
    }
    const probabilities = Object.values(result.probabilities).sort((a, b) => b - a);
    const accepted = result.probabilities[result.choice] >= 0.85 && probabilities[0] - probabilities[1] >= 0.2;
    const effectiveRoute = accepted ? result.choice : "explore";
    cases.push({
      name: item.name,
      expected: item.expected,
      choice: result.choice,
      probability: result.probabilities[result.choice],
      effectiveRoute,
      passed: effectiveRoute === item.expected,
      elapsedMs: Math.round(performance.now() - start),
      usage: result.usage,
    });
  }
  const passed = cases.length === ASK_DECISION_EVAL_CASES.length && cases.every((item) => item.passed);
  console.log(JSON.stringify({ mode: "live", model: ASK_DECISION_MODEL, passed, cases }, null, 2));
  if (!passed) process.exitCode = 1;
}

main().catch(() => {
  // Do not print provider exception text, credentials, or private responses.
  console.error("Decision evaluation did not run or complete. Check the reviewed runtime configuration and shared budget; no settings were changed.");
  process.exitCode = 1;
});
