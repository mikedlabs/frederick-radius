/**
 * Stub for the `server-only` package, used by vitest.
 *
 * The real `server-only` throws at import time inside any non-server
 * bundle. Vitest's Node environment IS the server, so the guard is
 * meaningless here — we replace it with this no-op to let integration
 * specs import server actions directly.
 *
 * Aliased in vitest.config.ts. Not used anywhere at runtime.
 */
export {};
