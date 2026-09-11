/**
 * Serialize archive payloads before handing them to postgres-js.
 *
 * Drizzle installs its own JSONB serializer on the shared postgres-js client.
 * That serializer is correct for Drizzle queries, but `sql.json()` on the raw
 * client can then leave arrays/objects unencoded. Explicit JSON text plus a
 * `::jsonb` cast keeps the server-owned archive deterministic in both paths.
 */
export function archiveJsonText(value: unknown): string {
  const serialized = JSON.stringify(value);
  if (serialized === undefined) {
    throw new TypeError("Event archive JSON must be serializable.");
  }
  return serialized;
}
