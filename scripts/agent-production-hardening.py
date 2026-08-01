from __future__ import annotations

from pathlib import Path
import re
import textwrap


def clean(value: str) -> str:
    return textwrap.dedent(value)


def replace_once(path: str, old: str, new: str) -> None:
    target = Path(path)
    text = target.read_text()
    needle = clean(old)
    replacement = clean(new)
    count = text.count(needle)
    if count != 1:
        raise SystemExit(
            f"{path}: expected one replacement, found {count}\n"
            f"--- needle ---\n{needle}"
        )
    target.write_text(text.replace(needle, replacement, 1))


def regex_replace_once(path: str, pattern: str, replacement: str) -> None:
    target = Path(path)
    text = target.read_text()
    updated, count = re.subn(pattern, clean(replacement), text, count=1, flags=re.S)
    if count != 1:
        raise SystemExit(f"{path}: expected one regex replacement, found {count}")
    target.write_text(updated)


# ---------------------------------------------------------------------------
# Event detail: durable/local only on visitor requests.
# ---------------------------------------------------------------------------
replace_once(
    "src/lib/loaders/liveEvents.ts",
    "  options: { signal?: AbortSignal; deadline?: number } = {},",
    """
    options: {
      signal?: AbortSignal;
      deadline?: number;
      allowNetwork?: boolean;
    } = {},
    """,
)
replace_once(
    "src/lib/loaders/liveEvents.ts",
    """
      if (committedVenueHit) return withVenueThumb(committedVenueHit);

      const sourceBudget = Math.min(
    """,
    """
      if (committedVenueHit) return withVenueThumb(committedVenueHit);

      // Event detail is allowed to use committed venue snapshots, but a visitor
      // request must never become the owner of the countywide provider fanout.
      // The background warmer and archive jobs own that work. A dated event
      // that has not reached durable storage yet is an honest recovery state,
      // not permission to leave provider promises alive after the page deadline.
      if (options.allowNetwork === false) {
        throw new LiveEventLookupIncompleteError(["live-network-disabled"]);
      }

      const sourceBudget = Math.min(
    """,
)
replace_once(
    "src/lib/loaders/liveEvents.spec.ts",
    """
      it("returns a fast provider hit without waiting for a never-settling source", async () => {
    """,
    """
      it("refuses provider fanout when visitor network access is disabled", async () => {
        await expect(
          getLiveCardEventBySlug("unarchived-show-2026-08-02", 90, {
            allowNetwork: false,
          }),
        ).rejects.toMatchObject({
          name: "LiveEventLookupIncompleteError",
          sources: ["live-network-disabled"],
        });

        expect(mocks.getCachedLiveEvents).not.toHaveBeenCalled();
        expect(mocks.fetchTicketmasterSports).not.toHaveBeenCalled();
        expect(mocks.fetchBandsintownForArtists).not.toHaveBeenCalled();
        expect(mocks.fetchVisitFrederick).not.toHaveBeenCalled();
        expect(mocks.fetchFrederickKeys).not.toHaveBeenCalled();
        expect(mocks.fetchSquarespaceVenueEvents).not.toHaveBeenCalled();
      });

      it("returns a fast provider hit without waiting for a never-settling source", async () => {
    """,
)

# Keep the generic resolver testable with its injected sources, but give the
# real page a deliberately smaller source contract: no unified board assembly,
# no provider network. Committed venue cards can still win; newly published
# dated links fall into the existing Radius recovery state until the archive
# catches up; arbitrary undated slugs retain an honest miss.
replace_once(
    "src/lib/loaders/eventResolver.ts",
    """
    function isPastDatedEventSlug(slug: string, now: Date): boolean {
      const day = eventSlugDay(slug);
      return day !== null && day < easternDayKey(now);
    }

    export class EventResolutionTimeoutError extends Error {
    """,
    """
    function isPastDatedEventSlug(slug: string, now: Date): boolean {
      const day = eventSlugDay(slug);
      return day !== null && day < easternDayKey(now);
    }

    const PRODUCTION_PAGE_SOURCES: EventResolverSources = {
      ...DEFAULT_SOURCES,
      unified: async () => null,
      live: (slug, context) => {
        if (context.signal.aborted) return Promise.resolve(null);
        const hasDatedRoutingEvidence =
          slug.startsWith("live-") || eventSlugDay(slug) !== null;
        if (!hasDatedRoutingEvidence) return Promise.resolve(null);
        return getLiveCardEventBySlug(slug, 90, {
          ...context,
          allowNetwork: false,
        });
      },
    };

    export class EventResolutionTimeoutError extends Error {
    """,
)
replace_once(
    "src/lib/loaders/eventResolver.ts",
    """
      return resolveEventPageBySlugWithSources(slug, now, DEFAULT_SOURCES);
    }
    """,
    """
      return resolveEventPageBySlugWithSources(
        slug,
        now,
        PRODUCTION_PAGE_SOURCES,
      );
    }
    """,
)
replace_once(
    "src/lib/loaders/eventResolver.spec.ts",
    """
      it("does not resolve an online-only event with no actionable join URL", async () => {
    """,
    """
      it("can model a production source contract without assembling the board", async () => {
        const loaders = sources({
          unified: vi.fn(async () => null),
          live: vi.fn(async () => {
            throw new Error("visitor network disabled");
          }),
        });

        await expect(
          resolveEventPageBySlugWithSources(
            "new-show-2026-08-02",
            new Date("2026-08-01T12:00:00.000Z"),
            loaders,
          ),
        ).rejects.toMatchObject({
          name: "EventResolutionUnavailableError",
          sources: ["live"],
        });
        expect(loaders.unified).toHaveBeenCalledOnce();
        expect(loaders.live).toHaveBeenCalledOnce();
        expect(loaders.ingested).toHaveBeenCalledOnce();
      });

      it("does not resolve an online-only event with no actionable join URL", async () => {
    """,
)

# ---------------------------------------------------------------------------
# Spatial mirror: update only changed rows and report checked vs changed.
# ---------------------------------------------------------------------------
replace_once(
    "src/lib/spatial/place-mirror.ts",
    """
    export type SpatialMirrorSyncResult = {
      upserted: number;
      retired: number;
      audit: SpatialMirrorAudit;
    };
    """,
    """
    export type SpatialMirrorSyncResult = {
      checked: number;
      upserted: number;
      retired: number;
      audit: SpatialMirrorAudit;
    };
    """,
)
regex_replace_once(
    "src/lib/spatial/place-mirror.ts",
    r"async function upsertBatch\(.*?\n\}\n\nexport async function syncSpatialPlaceMirror",
    """
    async function upsertBatch(
      sql: TransactionSql,
      batch: readonly SpatialCatalogPlace[],
    ): Promise<number> {
      const payload = JSON.stringify(batch.map(mirrorPayload));
      const changed = await sql<{ slug: string }[]>`
        insert into public.places as target (
          slug,
          name,
          category_slug,
          municipality_slug,
          address,
          city,
          state,
          postal_code,
          source,
          lng,
          lat,
          status,
          deleted_at,
          updated_at
        )
        select
          row.slug,
          row.name,
          row.category_slug,
          row.municipality_slug,
          row.address,
          row.city,
          row.state,
          row.postal_code,
          row.source,
          row.lng,
          row.lat,
          'active',
          null,
          now()
        from jsonb_to_recordset(${payload}::jsonb) as row(
          slug text,
          name text,
          category_slug text,
          municipality_slug text,
          address text,
          city text,
          state text,
          postal_code text,
          source text,
          lng double precision,
          lat double precision
        )
        on conflict (slug) do update set
          name = excluded.name,
          category_slug = excluded.category_slug,
          municipality_slug = excluded.municipality_slug,
          address = excluded.address,
          city = excluded.city,
          state = excluded.state,
          postal_code = excluded.postal_code,
          source = excluded.source,
          lng = excluded.lng,
          lat = excluded.lat,
          status = 'active',
          deleted_at = null,
          updated_at = excluded.updated_at
        where (
          target.name,
          target.category_slug,
          target.municipality_slug,
          target.address,
          target.city,
          target.state,
          target.postal_code,
          target.source,
          target.lng,
          target.lat,
          target.status,
          target.deleted_at
        ) is distinct from (
          excluded.name,
          excluded.category_slug,
          excluded.municipality_slug,
          excluded.address,
          excluded.city,
          excluded.state,
          excluded.postal_code,
          excluded.source,
          excluded.lng,
          excluded.lat,
          excluded.status,
          excluded.deleted_at
        )
        returning target.slug
      `;
      return changed.length;
    }

    export async function syncSpatialPlaceMirror
    """,
)
replace_once(
    "src/lib/spatial/place-mirror.ts",
    """
      const catalog = spatialCatalogSnapshot();
      let retired = 0;
    """,
    """
      const catalog = spatialCatalogSnapshot();
      let changed = 0;
      let retired = 0;
    """,
)
replace_once(
    "src/lib/spatial/place-mirror.ts",
    """
            await upsertBatch(
              sql,
              catalog.places.slice(offset, offset + MIRROR_BATCH_SIZE),
            );
    """,
    """
            changed += await upsertBatch(
              sql,
              catalog.places.slice(offset, offset + MIRROR_BATCH_SIZE),
            );
    """,
)
replace_once(
    "src/lib/spatial/place-mirror.ts",
    """
        throw new Error(
          "The PostGIS place mirror did not match the deployed catalog after sync.",
        );
    """,
    """
        throw new Error(
          "The PostGIS place mirror did not match the deployed catalog after sync " +
            `(expected=${audit.expectedCount}, active=${audit.activeCount}, ` +
            `missing=${audit.missing.length}, extra=${audit.extra.length}, ` +
            `coordinate_mismatches=${audit.coordinateMismatches.length}, ` +
            `missing_locations=${audit.missingLocations.length}).`,
        );
    """,
)
replace_once(
    "src/lib/spatial/place-mirror.ts",
    """
      return {
        upserted: catalog.count,
        retired,
        audit,
      };
    """,
    """
      return {
        checked: catalog.count,
        upserted: changed,
        retired,
        audit,
      };
    """,
)
replace_once(
    "src/lib/spatial/place-mirror.spec.ts",
    """
        expect(result.audit.current).toBe(true);
        expect(result.upserted).toBe(catalog.count);
    """,
    """
        expect(result.audit.current).toBe(true);
        expect(result.checked).toBe(catalog.count);
        expect(result.upserted).toBe(0);
        expect(
          transactionQueries.some((query) => query.includes("is distinct from")),
        ).toBe(true);
    """,
)
replace_once(
    "src/app/api/cron/spatial-places/route.ts",
    """
          upserted: result.upserted,
          retired: result.retired,
    """,
    """
          checked: result.checked,
          changed: result.upserted,
          upserted: result.upserted,
          retired: result.retired,
    """,
)
replace_once(
    "src/app/api/cron/spatial-places/route.spec.ts",
    """
        mocks.syncSpatialPlaceMirror.mockResolvedValue({
          upserted: 1610,
          retired: 2,
    """,
    """
        mocks.syncSpatialPlaceMirror.mockResolvedValue({
          checked: 1610,
          upserted: 12,
          retired: 2,
    """,
)
replace_once(
    "src/app/api/cron/spatial-places/route.spec.ts",
    """
          current: true,
          upserted: 1610,
          retired: 2,
    """,
    """
          current: true,
          checked: 1610,
          changed: 12,
          upserted: 12,
          retired: 2,
    """,
)

# ---------------------------------------------------------------------------
# Archive cadence and comments: background jobs own provider work.
# ---------------------------------------------------------------------------
replace_once(
    "vercel.json",
    """
          "path": "/api/cron/event-archive",
          "schedule": "11 */2 * * *"
    """,
    """
          "path": "/api/cron/event-archive",
          "schedule": "4,34 * * * *"
    """,
)
replace_once(
    "src/app/api/cron/warm-events/route.ts",
    """
     * /today + /events + /map read assembleUnifiedEvents (unstable_cache, 840s);
     * the /events/[slug] resolver reads getCachedLiveEvents (840s).
    """,
    """
     * /today + /events + /map read assembleUnifiedEvents (unstable_cache, 840s);
     * the durable event-archive worker reads getCachedLiveEvents (840s).
     * Visitor event details stay on seed/archive/database-only fallbacks and
     * never start this provider fanout.
    """,
)
replace_once(
    "src/app/api/cron/warm-events/route.ts",
    "  //  - getCachedLiveEvents(90) → compact source pages (/events/[slug])",
    "  //  - getCachedLiveEvents(90) → durable event-archive source horizon",
)
replace_once(
    "src/app/api/cron/warm-events/route.ts",
    """
      // Each source page stays below the persistent-cache byte ceiling; warming
      // the detail horizon prevents a visitor from paying its cold source read.
    """,
    """
      // Each source page stays below the persistent-cache byte ceiling; warming
      // the archive horizon keeps durable identity current without making a
      // visitor pay for a cold source read.
    """,
)

print("Production hardening patch applied successfully.")
