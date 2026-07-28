import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import * as schema from "./schema";

type DB = ReturnType<typeof drizzle<typeof schema>>;
export type Database = DB;

let _db: DB | null = null;
let _sql: ReturnType<typeof postgres> | null = null;

function resolveUrl(): string | undefined {
  return process.env.DATABASE_URL || process.env.POSTGRES_URL || process.env.SUPABASE_DB_URL;
}

export function getDb(): DB | null {
  if (_db) return _db;
  const url = resolveUrl();
  if (!url) return null;
  // Supabase's pooled connection (Supavisor transaction mode, port 6543 /
  // ?pgbouncer=true) requires prepare:false and max:1 per serverless instance.
  // Direct connection (port 5432) doesn't care, but max:10 per instance can
  // exhaust Postgres under cron + SSR concurrency. Detect the pooler from the
  // explicit flag/port OR the Supavisor host (pooler.supabase.*) so a URL that
  // relies on the host alone is still caught.
  const usesPgBouncer = /pgbouncer=true|:6543|pooler\.supabase\./.test(url);
  _sql = postgres(url, {
    prepare: !usesPgBouncer,
    max: usesPgBouncer ? 1 : 10,
    idle_timeout: 20,
    connect_timeout: 10,
  });
  _db = drizzle(_sql, { schema });
  return _db;
}

/** Raw postgres-js instance for tagged-template SQL (ingest pipeline). */
export function getSql(): ReturnType<typeof postgres> | null {
  if (_sql) return _sql;
  getDb(); // initializes _sql as a side effect
  return _sql;
}

export function dbAvailable(): boolean {
  return Boolean(resolveUrl());
}

export async function closeDb(): Promise<void> {
  if (_sql) {
    await _sql.end();
    _sql = null;
    _db = null;
  }
}

export { schema };
