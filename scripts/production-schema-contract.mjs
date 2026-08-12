#!/usr/bin/env node

/**
 * Production schema-effect contract for the server-owned data-truth tables.
 *
 * Migration files and Supabase history are useful evidence, but neither proves
 * that the runtime objects still have the required columns, indexes, RLS, and
 * grants. This read-only check verifies those effects directly. It is skipped
 * when CI intentionally has no database; release verification runs it with
 * DATABASE_URL present.
 */
import postgres from "postgres";

const url =
  process.env.DATABASE_URL ||
  process.env.POSTGRES_URL ||
  process.env.SUPABASE_DB_URL;

if (!url) {
  console.log("schema-contract: skipped (no database configured)");
  process.exit(0);
}

const tables = {
  dataset_versions: [
    "dataset_key",
    "source_key",
    "version_key",
    "content_hash",
    "status",
    "checked_at",
    "valid_until",
  ],
  dataset_feature_versions: [
    "dataset_version_id",
    "dataset_key",
    "feature_key",
    "feature_kind",
    "content_hash",
    "observed_at",
    "checked_at",
  ],
  field_observations: [
    "source_key",
    "observation_key",
    "entity_kind",
    "entity_key",
    "field_name",
    "value_status",
    "checked_at",
    "valid_until",
  ],
  resolved_field_state: [
    "entity_kind",
    "entity_key",
    "field_name",
    "resolution_status",
    "resolution_method",
    "checked_at",
    "valid_until",
  ],
  decision_daily_aggregates: [
    "day",
    "surface",
    "stage",
    "entity_kind",
    "position",
    "action",
    "count",
    "updated_at",
  ],
};

const indexes = [
  "dataset_versions_dataset_checked_idx",
  "dataset_versions_source_checked_idx",
  "dataset_versions_current_published_uq",
  "dataset_feature_versions_current_uq",
  "dataset_feature_versions_current_active_idx",
  "dataset_feature_versions_history_idx",
  "dataset_feature_versions_version_idx",
  "field_observations_entity_field_idx",
  "field_observations_source_checked_idx",
  "field_observations_valid_until_idx",
  "field_observations_dataset_version_idx",
  "resolved_field_state_status_expiry_idx",
  "resolved_field_state_winner_idx",
];

const expectedTableGrants = {
  dataset_versions: ["INSERT", "SELECT"],
  dataset_feature_versions: ["INSERT", "SELECT"],
  field_observations: ["INSERT", "SELECT"],
  resolved_field_state: ["DELETE", "INSERT", "SELECT", "UPDATE"],
  decision_daily_aggregates: ["INSERT", "SELECT"],
};

const expectedColumnUpdates = {
  dataset_versions: [
    "metadata",
    "published_at",
    "status",
    "superseded_at",
    "updated_at",
    "validated_at",
  ],
  dataset_feature_versions: ["superseded_at"],
  field_observations: ["provenance", "verification_status"],
  decision_daily_aggregates: ["count", "updated_at"],
};

const expectedConstraints = [
  "decision_daily_aggregates_count_check",
  "decision_daily_aggregates_surface_check",
  "decision_daily_aggregates_stage_check",
  "decision_daily_aggregates_entity_kind_check",
  "decision_daily_aggregates_position_check",
  "decision_daily_aggregates_action_check",
  "decision_daily_aggregates_stage_action_check",
];

const sql = postgres(url, {
  prepare: !/pgbouncer=true|:6543|pooler\.supabase\./.test(url),
  max: 1,
  connect_timeout: 10,
  idle_timeout: 5,
});

const problems = [];
try {
  await sql`set statement_timeout = '10s'`;
  const requiredTables = Object.keys(tables);
  const rows = await sql`
    select c.relname as table_name,
           c.relrowsecurity as rls_enabled,
           coalesce(
             array_agg(a.attname order by a.attname)
               filter (where a.attname is not null),
             array[]::text[]
           ) as columns
    from pg_namespace n
    join pg_class c on c.relnamespace = n.oid and c.relkind = 'r'
    left join pg_attribute a
      on a.attrelid = c.oid and a.attnum > 0 and not a.attisdropped
    where n.nspname = 'public' and c.relname = any(${requiredTables})
    group by c.relname, c.relrowsecurity
  `;
  const byTable = new Map(rows.map((row) => [row.table_name, row]));
  for (const [table, columns] of Object.entries(tables)) {
    const row = byTable.get(table);
    if (!row) {
      problems.push(`missing table public.${table}`);
      continue;
    }
    if (!row.rls_enabled) problems.push(`RLS disabled on public.${table}`);
    for (const column of columns) {
      if (!row.columns.includes(column)) {
        problems.push(`missing column public.${table}.${column}`);
      }
    }
  }

  const indexRows = await sql`
    select indexname
    from pg_indexes
    where schemaname = 'public' and indexname = any(${indexes})
  `;
  const presentIndexes = new Set(indexRows.map((row) => row.indexname));
  for (const index of indexes) {
    if (!presentIndexes.has(index)) problems.push(`missing index ${index}`);
  }

  const grantRows = await sql`
    select table_name, grantee, privilege_type
    from information_schema.role_table_grants
    where table_schema = 'public'
      and table_name = any(${requiredTables})
      and grantee = any(array['PUBLIC', 'anon', 'authenticated', 'service_role'])
  `;
  for (const row of grantRows) {
    if (row.grantee !== "service_role") {
      problems.push(
        `unexpected ${row.grantee} ${row.privilege_type} on public.${row.table_name}`,
      );
    }
  }
  for (const [table, expected] of Object.entries(expectedTableGrants)) {
    const actual = grantRows
      .filter((row) => row.table_name === table && row.grantee === "service_role")
      .map((row) => row.privilege_type)
      .sort();
    if (JSON.stringify(actual) !== JSON.stringify([...expected].sort())) {
      problems.push(
        `service_role table grants differ for public.${table}: ${actual.join(",") || "none"}`,
      );
    }
  }

  const columnRows = await sql`
    select table_name, column_name
    from information_schema.column_privileges
    where table_schema = 'public'
      and table_name = any(${Object.keys(expectedColumnUpdates)})
      and grantee = 'service_role'
      and privilege_type = 'UPDATE'
  `;
  for (const [table, expected] of Object.entries(expectedColumnUpdates)) {
    const actual = columnRows
      .filter((row) => row.table_name === table)
      .map((row) => row.column_name)
      .sort();
    if (JSON.stringify(actual) !== JSON.stringify([...expected].sort())) {
      problems.push(
        `service_role UPDATE columns differ for public.${table}: ${actual.join(",") || "none"}`,
      );
    }
  }

  const constraintRows = await sql`
    select conname
    from pg_constraint con
    join pg_class rel on rel.oid = con.conrelid
    join pg_namespace nsp on nsp.oid = rel.relnamespace
    where nsp.nspname = 'public'
      and rel.relname = 'decision_daily_aggregates'
      and con.conname = any(${expectedConstraints})
  `;
  const presentConstraints = new Set(constraintRows.map((row) => row.conname));
  for (const constraint of expectedConstraints) {
    if (!presentConstraints.has(constraint)) {
      problems.push(`missing constraint ${constraint}`);
    }
  }
} catch (error) {
  problems.push(
    `contract query failed: ${error instanceof Error ? error.name : "unknown error"}`,
  );
} finally {
  await sql.end({ timeout: 2 });
}

if (problems.length > 0) {
  console.error(`schema-contract: ${problems.length} problem(s)`);
  for (const problem of problems) console.error(`  - ${problem}`);
  process.exit(1);
}

console.log("schema-contract: data-truth foundation verified");
