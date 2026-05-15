import { runSeed } from "@/lib/db/seed";
import { closeDb } from "@/lib/db/client";

async function main() {
  if (!process.env.DATABASE_URL && !process.env.POSTGRES_URL && !process.env.SUPABASE_DB_URL) {
    console.error("Set DATABASE_URL (or POSTGRES_URL) before running seed.");
    process.exit(1);
  }
  const t0 = Date.now();
  const summary = await runSeed();
  console.log("Seed complete:", JSON.stringify(summary, null, 2));
  console.log(`Total: ${Date.now() - t0}ms`);
  await closeDb();
  process.exit(0);
}

main().catch(async (err) => {
  console.error(err);
  await closeDb();
  process.exit(1);
});
