/** Runtime budgets live outside route.ts because Next route modules may only
 * export supported route fields and HTTP handlers. */
export const EVENT_WARM_BUDGET_MS = 72_000;
