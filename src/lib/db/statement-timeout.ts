import "server-only";
import { sql } from "drizzle-orm";
import type { Database } from "@/lib/db/client";

type StatementExecutor = Pick<Database, "select" | "delete">;

/**
 * Run database work with a transaction-local Postgres statement timeout.
 *
 * A Promise timeout can stop the caller from waiting, but it does not cancel
 * the SQL. `statement_timeout` is enforced by Postgres itself, so a retention
 * query is cancelled before the serverless function loses its final-heartbeat
 * headroom. The timeout applies independently to every statement in `run`.
 */
export async function withStatementTimeout<T>(
  db: Database,
  statementTimeoutMs: number | undefined,
  run: (executor: StatementExecutor) => Promise<T>,
): Promise<T> {
  if (
    statementTimeoutMs === undefined ||
    !Number.isFinite(statementTimeoutMs) ||
    statementTimeoutMs <= 0
  ) {
    return run(db);
  }

  const boundedMs = Math.max(1, Math.min(Math.floor(statementTimeoutMs), 30_000));
  return db.transaction(async (transaction) => {
    await transaction.execute(
      sql`select set_config('statement_timeout', ${`${boundedMs}ms`}, true)`,
    );
    return run(transaction);
  });
}
