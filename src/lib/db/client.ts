import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import * as schema from "./schema";

type DB = ReturnType<typeof drizzle<typeof schema>>;

let _db: DB | null = null;

function resolveUrl(): string | undefined {
  return process.env.DATABASE_URL || process.env.POSTGRES_URL || process.env.NEON_DATABASE_URL;
}

export function getDb(): DB | null {
  if (_db) return _db;
  const url = resolveUrl();
  if (!url) return null;
  _db = drizzle(neon(url), { schema });
  return _db;
}

export function dbAvailable(): boolean {
  return Boolean(resolveUrl());
}

export { schema };
