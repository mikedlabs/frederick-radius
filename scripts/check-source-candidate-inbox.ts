/**
 * Secret-safe paid-provider preflight for the private source inbox.
 *
 * This verifies the live connection, exact tables/columns, and the privileges
 * needed to persist evidence and review decisions. It never prints the
 * connection string and does not mutate either table.
 */
import { config as loadEnvironment } from "dotenv";
import { resolve } from "node:path";
import { closeDb, getSql } from "../src/lib/db/client";

loadEnvironment({ path: resolve(".env.local"), quiet: true });
loadEnvironment({ quiet: true });

const REQUIRED_COLUMNS = {
  field_observations: new Set([
    "source_key",
    "observation_key",
    "entity_kind",
    "entity_key",
    "field_name",
    "observed_value",
    "source_url",
    "observed_at",
    "valid_until",
    "content_hash",
    "provenance",
  ]),
  curation_decisions: new Set([
    "tool",
    "target_id",
    "field",
    "decision",
    "decided_at",
  ]),
} as const;

async function main() {
  const sql = getSql();
  if (!sql) throw new Error("Private source inbox is not configured.");

  const tables = (await sql`
    select table_name, array_agg(column_name order by column_name) as columns
    from information_schema.columns
    where table_schema = 'public'
      and table_name in ('field_observations', 'curation_decisions')
    group by table_name
  `) as Array<{ table_name: string; columns: string[] }>;
  const byTable = new Map(
    tables.map((row) => [row.table_name, new Set(row.columns)]),
  );
  for (const [table, required] of Object.entries(REQUIRED_COLUMNS)) {
    const actual = byTable.get(table);
    if (!actual || [...required].some((column) => !actual.has(column))) {
      throw new Error("Private source inbox schema is not ready.");
    }
  }


  const securityRows = (await sql`
    select c.relname as table_name, c.relrowsecurity as rls_enabled
    from pg_catalog.pg_class c
    join pg_catalog.pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname in ('field_observations', 'curation_decisions')
  `) as Array<{ table_name: string; rls_enabled: boolean }>;
  if (
    securityRows.length !== 2
    || securityRows.some((row) => row.rls_enabled !== true)
  ) {
    throw new Error("Private source inbox RLS is not ready.");
  }

  const publicGrants = (await sql`
    select table_name, grantee, privilege_type
    from information_schema.table_privileges
    where table_schema = 'public'
      and table_name in ('field_observations', 'curation_decisions')
      and grantee in ('PUBLIC', 'anon', 'authenticated')
  `) as Array<Record<string, unknown>>;
  if (publicGrants.length > 0) {
    throw new Error("Private source inbox grants are not ready.");
  }

  const publicPolicies = (await sql`
    select tablename, policyname
    from pg_catalog.pg_policies
    where schemaname = 'public'
      and tablename in ('field_observations', 'curation_decisions')
      and roles && array['public', 'anon', 'authenticated']::name[]
  `) as Array<Record<string, unknown>>;
  if (publicPolicies.length > 0) {
    throw new Error("Private source inbox policies are not ready.");
  }

  const permissionRows = (await sql`
    select
      has_table_privilege(current_user, 'public.field_observations', 'SELECT') as observations_select,
      has_table_privilege(current_user, 'public.field_observations', 'INSERT') as observations_insert,
      has_table_privilege(current_user, 'public.curation_decisions', 'SELECT') as decisions_select,
      has_table_privilege(current_user, 'public.curation_decisions', 'INSERT') as decisions_insert,
      has_table_privilege(current_user, 'public.curation_decisions', 'UPDATE') as decisions_update,
      has_table_privilege(current_user, 'public.curation_decisions', 'DELETE') as decisions_delete
  `) as Array<Record<string, boolean>>;
  const permissions = permissionRows[0];
  if (!permissions || Object.values(permissions).some((value) => value !== true)) {
    throw new Error("Private source inbox permissions are not ready.");
  }

  // Grants alone do not prove that an INSERT can pass deny-all RLS. Paid
  // provider workflows must stop before spending unless this server role owns
  // both private tables or explicitly bypasses RLS. A dedicated writer policy
  // can be supported later with a rollback-only probe, but should not be
  // assumed from grants.
  const writerRows = (await sql`
    select
      r.rolbypassrls as bypasses_rls,
      bool_and(c.relowner = r.oid) as owns_private_tables
    from pg_catalog.pg_roles r
    cross join pg_catalog.pg_class c
    join pg_catalog.pg_namespace n on n.oid = c.relnamespace
    where r.rolname = current_user
      and n.nspname = 'public'
      and c.relname in ('field_observations', 'curation_decisions')
    group by r.rolbypassrls
  `) as Array<{
    bypasses_rls: boolean;
    owns_private_tables: boolean;
  }>;
  const writer = writerRows[0];
  if (!writer || (!writer.bypasses_rls && !writer.owns_private_tables)) {
    throw new Error("Private source inbox writer role is not ready.");
  }

  // Exercise an actual bounded read through the same private table without
  // retaining or exposing any provider data.
  await sql`
    select 1
    from field_observations
    where entity_kind = 'source-candidate'
    limit 1
  `;
  console.log("Private source inbox preflight passed.");
}

main()
  .catch((error) => {
    const message =
      error instanceof Error && error.message.startsWith("Private source inbox")
        ? error.message
        : "Private source inbox preflight failed. Check connectivity without printing the connection secret.";
    console.error(message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await closeDb();
  });
