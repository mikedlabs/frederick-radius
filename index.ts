/**
 * OpenAI direct smoke test — bypasses the Vercel AI Gateway and
 * streams a response from gpt-5.4 directly via the `@ai-sdk/openai`
 * provider, logging token usage.
 *
 * Auth: reads OPENAI_API_KEY from .env.local (via `dotenv/config`).
 *
 * Note on model: this passes the literal string `gpt-5.4`. If OpenAI
 * hasn't released that exact model alias yet, the API will return a
 * 404 "model not found" — swap to `gpt-5`, `gpt-4o`, or whatever is
 * current. The wiring (key → SDK → OpenAI) is independent of the
 * specific model id.
 *
 * Run:
 *   tsx index.ts
 *   # or: node --env-file=.env.local --experimental-strip-types index.ts
 */
import "dotenv/config";
import { streamText } from "ai";
import { openai } from "@ai-sdk/openai";

async function main() {
  const result = streamText({
    model: openai("gpt-5.4"),
    prompt: "Explain quantum computing in simple terms.",
  });

  // Stream the body to stdout as it arrives.
  for await (const chunk of result.textStream) {
    process.stdout.write(chunk);
  }

  // Usage resolves once the stream finishes. Log it on its own line
  // so the streamed text and the metrics don't run together.
  const usage = await result.usage;
  console.log("\n\nToken usage:", usage);
}

main().catch((err) => {
  console.error("Error:", err);
  process.exit(1);
});
