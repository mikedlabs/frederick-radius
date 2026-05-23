import "server-only";

import type { Mode } from "@/hooks/useMode";

/**
 * Server-only mode helpers. Sit in their own module because
 * `src/hooks/useMode.ts` is a `"use client"` module — Next.js's RSC
 * compiler forbids a Server Component from CALLING a function exported
 * from a client module (importing types is fine; types are erased).
 *
 * The previous PR (#193) put `readModeFromCookie` in useMode.ts and
 * relied on a `typeof window` guard. That works at build time but
 * throws at runtime in every Server Component that calls it
 * (`PrimaryActionCard`, `AdaptiveGreeting`), surfacing as the global
 * error boundary's "Try again / Reload page" buttons across the app.
 */

// Default mirrors the client-side default in useMode.ts. Inlined here
// rather than imported so this module can stay strictly server-only —
// it never reaches into a "use client" file at runtime.
const DEFAULT_MODE: Mode = "visitor";

/**
 * Read the mode from the request cookie. Returns DEFAULT_MODE when
 * the cookie isn't set, so the call site never has to handle "what's
 * the default". The cookie is written by `useMode.write()` whenever a
 * user picks or toggles mode on the client.
 */
export async function readModeFromCookie(): Promise<Mode> {
  try {
    const { cookies } = await import("next/headers");
    const store = await cookies();
    const v = store.get("fr_mode")?.value;
    if (v === "resident" || v === "visitor") return v;
  } catch {
    /* cookies unavailable (e.g. during static render) — fall through */
  }
  return DEFAULT_MODE;
}
