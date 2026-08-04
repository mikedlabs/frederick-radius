import "server-only";

import {
  EVENT_IDENTITY_READ_TIMEOUT_MS,
  EventIdentityStoreUnavailableError,
  archivedEventBySlug,
  archivedEventFromSnapshot,
  type ArchivedEventIdentity,
} from "@/lib/events/event-identity";

export type RenderableArchivedEvent = Pick<
  ArchivedEventIdentity,
  "canonicalSlug" | "event"
>;

type ArchiveLookupOptions = {
  signal?: AbortSignal;
  timeoutMs?: number;
};

type ArchiveFetch = (
  input: string | URL,
  init?: RequestInit & { next?: { revalidate: number } },
) => Promise<Response>;

type ArchiveLookupConfig = {
  supabaseUrl: string;
  publishableKey: string;
};

type ArchiveLookupDependencies = {
  fetchImpl?: ArchiveFetch;
  directRead?: (
    slug: string,
    options?: ArchiveLookupOptions,
  ) => Promise<ArchivedEventIdentity | null>;
  getConfig?: () => ArchiveLookupConfig | null;
  now?: () => number;
  apiTimeoutMs?: number;
};

type ArchiveApiRow = {
  canonical_slug: unknown;
  snapshot: unknown;
};

const EVENT_SLUG = /^[a-z0-9][a-z0-9-]{0,199}$/;
const ARCHIVE_DATA_API_TIMEOUT_MS = 900;
const ARCHIVE_DATA_API_REVALIDATE_SECONDS = 60;

function productionConfig(): ArchiveLookupConfig | null {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    ?.trim()
    .replace(/\/+$/, "");
  const publishableKey =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim() ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
  return supabaseUrl && publishableKey
    ? { supabaseUrl, publishableKey }
    : null;
}

function renderableArchiveRow(value: unknown): RenderableArchivedEvent | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const row = value as ArchiveApiRow;
  if (
    typeof row.canonical_slug !== "string" ||
    !EVENT_SLUG.test(row.canonical_slug) ||
    row.canonical_slug === "constructor" ||
    row.canonical_slug === "prototype"
  ) {
    return null;
  }
  const event = archivedEventFromSnapshot(row.snapshot, row.canonical_slug);
  return event ? { canonicalSlug: row.canonical_slug, event } : null;
}

/**
 * Build the production archive reader behind injectable boundaries so the
 * network-to-database fallback and its one shared deadline can be tested
 * without exposing credentials or depending on a live Supabase project.
 *
 * A Data API miss deliberately checks the direct archive too. That keeps an
 * accidental PostgREST/RLS configuration problem from masquerading as a real
 * missing event and recreating the false-404 failure this path exists to stop.
 */
export function createEventArchiveLookup(
  dependencies: ArchiveLookupDependencies = {},
) {
  const fetchImpl = dependencies.fetchImpl ?? fetch;
  const directRead = dependencies.directRead ?? archivedEventBySlug;
  const getConfig = dependencies.getConfig ?? productionConfig;
  const now = dependencies.now ?? Date.now;
  const apiTimeoutMs =
    dependencies.apiTimeoutMs ?? ARCHIVE_DATA_API_TIMEOUT_MS;

  return async function eventArchiveLookup(
    slug: string,
    options: ArchiveLookupOptions = {},
  ): Promise<RenderableArchivedEvent | null> {
    if (
      !EVENT_SLUG.test(slug) ||
      slug === "constructor" ||
      slug === "prototype"
    ) {
      return null;
    }
    if (options.signal?.aborted) {
      throw new EventIdentityStoreUnavailableError();
    }

    const startedAt = now();
    const totalBudget = options.timeoutMs ?? EVENT_IDENTITY_READ_TIMEOUT_MS;
    const config = getConfig();

    if (config && totalBudget > 0) {
      const controller = new AbortController();
      const apiBudget = Math.max(1, Math.min(apiTimeoutMs, totalBudget));
      const timer = setTimeout(() => controller.abort(), apiBudget);
      const abortFromCaller = () => controller.abort();
      options.signal?.addEventListener("abort", abortFromCaller, { once: true });

      try {
        const endpoint = new URL(
          `${config.supabaseUrl}/rest/v1/rpc/public_event_archive_by_slug`,
        );
        endpoint.searchParams.set("requested_slug", slug);
        const response = await fetchImpl(endpoint, {
          headers: {
            accept: "application/json",
            apikey: config.publishableKey,
          },
          signal: controller.signal,
          next: { revalidate: ARCHIVE_DATA_API_REVALIDATE_SECONDS },
        });
        if (response.ok) {
          const payload: unknown = await response.json();
          if (Array.isArray(payload) && payload.length === 1) {
            const event = renderableArchiveRow(payload[0]);
            if (event) return event;
          }
        }
      } catch {
        // The private direct reader below is the bounded operational fallback.
      } finally {
        clearTimeout(timer);
        options.signal?.removeEventListener("abort", abortFromCaller);
      }
    }

    if (options.signal?.aborted) {
      throw new EventIdentityStoreUnavailableError();
    }
    const remaining = Math.max(0, totalBudget - (now() - startedAt));
    if (remaining <= 0) throw new EventIdentityStoreUnavailableError();
    return directRead(slug, { ...options, timeoutMs: remaining });
  };
}

export const archivedEventBySlugForRender = createEventArchiveLookup();
