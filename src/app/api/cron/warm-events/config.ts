/** Runtime budgets live outside route.ts because Next route modules may only
 * export supported route fields and HTTP handlers. */
export const EVENT_WARM_BUDGET_MS = 60_000;
export const EVENT_ALERT_BUDGET_MS = 3_000;

// A separate bounded durable read warms the exact Events SSR/browse key.
// The underlying SQL deadline stays2.5s; cache transport/encoding gets headroom.
export const EVENT_BROWSE_ARCHIVE_WARM_BUDGET_MS = 3_500;
