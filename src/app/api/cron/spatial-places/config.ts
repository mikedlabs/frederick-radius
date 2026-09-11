/** Runtime budgets live outside route.ts because Next route modules may only
 * export supported route fields and HTTP handlers. */
export const SPATIAL_SYNC_BUDGET_MS = 90_000;
export const SPATIAL_CANCEL_GRACE_MS = 5_000;
export const SPATIAL_STATEMENT_TIMEOUT_MS = 20_000;
