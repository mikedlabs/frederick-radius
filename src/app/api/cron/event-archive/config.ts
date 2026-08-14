/**
 * Runtime budgets live outside route.ts because Next route modules may only
 * export supported route fields and HTTP handlers.
 */
export const EVENT_ARCHIVE_HEARTBEAT_BUDGET_MS = 4_000;
export const EVENT_ARCHIVE_SOURCE_BUDGET_MS = 24_000;
export const EVENT_ARCHIVE_WRITE_BUDGET_MS = 15_000;
export const EVENT_ARCHIVE_PUBLICATION_BUDGET_MS = 1_500;
// Leave one second after the database-enforced archive deadline so the route
// can classify the result and record its final heartbeat.
export const EVENT_ARCHIVE_DB_DEADLINE_MS = 14_000;
