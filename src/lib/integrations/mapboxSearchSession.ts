import "server-only";

import { createHash } from "node:crypto";
import { getSql } from "@/lib/db/client";

/**
 * Search Box billing sessions are shorter-lived than a browser tab. Mapbox
 * closes one after a retrieve, 180 seconds, or 50 suggestions. This ledger is
 * the server-owned source of truth for that lifecycle; a client UUID is only
 * an opaque correlation value and can never reopen a closed session.
 */
export const MAPBOX_SEARCH_SESSION_TTL_SECONDS = 180;
export const MAPBOX_SEARCH_SESSION_MAX_SUGGESTIONS = 50;

export type MapboxSearchSessionAction =
  | { action: "suggest"; sessionToken: string }
  | { action: "retrieve"; sessionToken: string; mapboxId: string };

export type MapboxSearchSessionReservation =
  | {
      allowed: true;
      newSession: boolean;
      suggestionCount: number;
      /** The final allowed suggestion closes the provider session. */
      sessionClosed: boolean;
      dailyCount?: number;
    }
  | {
      allowed: false;
      reason:
        | "daily-cap-reached"
        | "session-missing"
        | "session-expired"
        | "session-closed"
        | "session-limit-reached";
      dailyCount?: number;
    };

type SessionRow = {
  state: "active" | "retrieved" | "expired" | "suggestion_limit";
  suggestion_count: number | string;
  expired: boolean;
};

class MapboxSearchBudgetExhaustedError extends Error {}

function digest(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function validLimit(limit: number): boolean {
  return Number.isSafeInteger(limit) && limit > 0;
}

function normalizeCount(value: number | string): number | null {
  const count = Number(value);
  return Number.isSafeInteger(count) && count >= 0 ? count : null;
}

/**
 * Atomically validate one Search Box action and, for a new suggest session,
 * reserve its Eastern-day billing unit. `null` means lifecycle storage could
 * not prove the action safe, so callers must not contact Mapbox.
 */
export async function reserveMapboxSearchSessionAction(
  input: MapboxSearchSessionAction,
  dailyLimit: number,
): Promise<MapboxSearchSessionReservation | null> {
  if (!validLimit(dailyLimit) || !input.sessionToken) return null;

  const tokenHash = digest(input.sessionToken);
  const mapboxIdHash =
    input.action === "retrieve" ? digest(input.mapboxId) : null;

  try {
    const sql = getSql();
    if (!sql) return null;

    return await sql.begin(async (tx) => {
      if (input.action === "suggest") {
        // The insert is the ownership boundary. Concurrent first suggestions
        // for the same UUID serialize on the primary key, and only the winner
        // reserves a daily billing unit below.
        const inserted = await tx<Array<{ suggestion_count: number | string }>>`
          insert into mapbox_search_sessions (
            session_token_hash,
            state,
            suggestion_count,
            started_at,
            expires_at
          )
          values (
            ${tokenHash},
            'active',
            1,
            now(),
            now() + (${MAPBOX_SEARCH_SESSION_TTL_SECONDS} * interval '1 second')
          )
          on conflict (session_token_hash) do nothing
          returning suggestion_count
        `;

        if (inserted.length > 0) {
          const budgetRows = await tx<Array<{ count: number | string }>>`
            insert into usage_counters (day, upstream, count)
            values (
              (now() at time zone 'America/New_York')::date,
              'mapbox_search_box',
              1
            )
            on conflict (day, upstream)
            do update set count = usage_counters.count + 1
            where usage_counters.count + 1 <= ${dailyLimit}
            returning count
          `;
          const dailyCount = normalizeCount(budgetRows[0]?.count ?? -1);
          if (budgetRows.length === 0 || dailyCount === null) {
            // Throw so the new lifecycle row rolls back with the rejected
            // budget reservation. A later day may safely try this unused UUID.
            throw new MapboxSearchBudgetExhaustedError();
          }
          return {
            allowed: true,
            newSession: true,
            suggestionCount: 1,
            sessionClosed: false,
            dailyCount,
          } satisfies MapboxSearchSessionReservation;
        }
      }

      const rows = await tx<SessionRow[]>`
        select
          state,
          suggestion_count,
          expires_at <= now() as expired
        from mapbox_search_sessions
        where session_token_hash = ${tokenHash}
        for update
      `;
      const row = rows[0];
      if (!row) {
        // Retrieve may never bootstrap a session. Suggest can only arrive here
        // after a conflicting insert, so a missing row is an unsafe DB state.
        return input.action === "retrieve"
          ? ({ allowed: false, reason: "session-missing" } as const)
          : null;
      }

      const suggestionCount = normalizeCount(row.suggestion_count);
      if (suggestionCount === null) return null;

      if (row.expired) {
        if (row.state === "active") {
          await tx`
            update mapbox_search_sessions
            set state = 'expired', closed_at = coalesce(closed_at, now())
            where session_token_hash = ${tokenHash}
              and state = 'active'
          `;
        }
        return { allowed: false, reason: "session-expired" } as const;
      }

      if (row.state === "suggestion_limit") {
        return { allowed: false, reason: "session-limit-reached" } as const;
      }
      if (row.state !== "active") {
        return { allowed: false, reason: "session-closed" } as const;
      }

      if (input.action === "retrieve") {
        if (suggestionCount < 1) return null;
        const closed = await tx<Array<{ suggestion_count: number | string }>>`
          update mapbox_search_sessions
          set
            state = 'retrieved',
            closed_at = now(),
            retrieved_mapbox_id_hash = ${mapboxIdHash}
          where session_token_hash = ${tokenHash}
            and state = 'active'
            and expires_at > now()
          returning suggestion_count
        `;
        const closedCount = normalizeCount(closed[0]?.suggestion_count ?? -1);
        if (closed.length === 0 || closedCount === null) return null;
        return {
          allowed: true,
          newSession: false,
          suggestionCount: closedCount,
          sessionClosed: true,
        } satisfies MapboxSearchSessionReservation;
      }

      if (suggestionCount >= MAPBOX_SEARCH_SESSION_MAX_SUGGESTIONS) {
        await tx`
          update mapbox_search_sessions
          set state = 'suggestion_limit', closed_at = coalesce(closed_at, now())
          where session_token_hash = ${tokenHash}
            and state = 'active'
        `;
        return { allowed: false, reason: "session-limit-reached" } as const;
      }

      const advanced = await tx<
        Array<{ state: SessionRow["state"]; suggestion_count: number | string }>
      >`
        update mapbox_search_sessions
        set
          suggestion_count = suggestion_count + 1,
          state = case
            when suggestion_count + 1 >= ${MAPBOX_SEARCH_SESSION_MAX_SUGGESTIONS}
              then 'suggestion_limit'
            else state
          end,
          closed_at = case
            when suggestion_count + 1 >= ${MAPBOX_SEARCH_SESSION_MAX_SUGGESTIONS}
              then now()
            else closed_at
          end
        where session_token_hash = ${tokenHash}
          and state = 'active'
          and expires_at > now()
          and suggestion_count < ${MAPBOX_SEARCH_SESSION_MAX_SUGGESTIONS}
        returning state, suggestion_count
      `;
      const nextCount = normalizeCount(advanced[0]?.suggestion_count ?? -1);
      if (advanced.length === 0 || nextCount === null) return null;
      return {
        allowed: true,
        newSession: false,
        suggestionCount: nextCount,
        sessionClosed: advanced[0]?.state === "suggestion_limit",
      } satisfies MapboxSearchSessionReservation;
    });
  } catch (error) {
    return error instanceof MapboxSearchBudgetExhaustedError
      ? { allowed: false, reason: "daily-cap-reached", dailyCount: dailyLimit }
      : null;
  }
}
