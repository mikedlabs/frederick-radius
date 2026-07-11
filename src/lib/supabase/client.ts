/**
 * Browser-side Supabase client.
 *
 * Use this only inside `"use client"` components. The anon (publishable)
 * key is exposed by design — it can only do what Row-Level Security
 * permits, plus the auth flow. Server actions that need elevated
 * access use the server client instead (see ./server.ts).
 *
 * One instance per browser tab via the createBrowserClient factory;
 * @supabase/ssr handles the singleton + cookie storage so the client
 * sees the same session the server sees.
 */
import { createBrowserClient } from "@supabase/ssr";

export function createClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) {
    throw new Error(
      "Supabase env vars missing: set NEXT_PUBLIC_SUPABASE_URL and " +
        "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY (or NEXT_PUBLIC_SUPABASE_ANON_KEY) " +
        "in your Vercel project or .env.local.",
    );
  }
  return createBrowserClient(url, key);
}
