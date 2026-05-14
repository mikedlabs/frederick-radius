/* eslint-disable @typescript-eslint/no-require-imports */
import { runSeed } from "@/lib/db/seed";

async function main() {
  if (!process.env.DATABASE_URL && !process.env.POSTGRES_URL) {
    console.error("Set DATABASE_URL (or POSTGRES_URL) before running seed.");
    process.exit(1);
  }
  const t0 = Date.now();
  const summary = await runSeed();
  console.log("Seed complete:", JSON.stringify(summary, null, 2));
  console.log(`Total: ${Date.now() - t0}ms`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
