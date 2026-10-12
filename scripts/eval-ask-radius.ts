/** Fast, deterministic Ask Radius quality gate. No paid model calls. */
import { runAskEvaluation } from "@/lib/ask/evaluation-runner";

const outcomes = runAskEvaluation();
const failedCases = outcomes.filter((outcome) => outcome.failures.length > 0);
console.log(`Ask Radius eval: ${outcomes.length - failedCases.length}/${outcomes.length} passed`);
for (const outcome of failedCases) {
  for (const failure of outcome.failures) {
    console.error(`  FAIL ${outcome.name}: ${failure}`);
  }
}
if (failedCases.length > 0) process.exitCode = 1;
