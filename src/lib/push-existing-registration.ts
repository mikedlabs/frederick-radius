import {
  isPublicFixedPushTopic,
  type PushTopic,
} from "@/lib/push-topics";

type ExistingPushSubscription = Pick<
  PushSubscription,
  "endpoint" | "toJSON"
>;

type PushFetch = (
  input: RequestInfo | URL,
  init?: RequestInit,
) => Promise<Response>;

type ReconcileExistingPushRegistrationOptions = {
  subscription: ExistingPushSubscription;
  topicsResponse: Response;
  managedTopics: readonly PushTopic[];
  fetcher?: PushFetch;
  deviceId?: string;
  homeTown?: string | null;
};

export type ExistingPushRegistrationResult = {
  connected: boolean;
  topics: PushTopic[];
};

/**
 * Verify that a browser-owned PushSubscription still has a matching server
 * row. A provider can invalidate a subscription and cause fanout to prune the
 * row before the browser drops its local object. In that state the browser API
 * alone is not proof that Radius can deliver anything.
 *
 * The topics read deliberately carries an explicit `registered` bit. We only
 * recreate a row after a successful, authoritative "missing" response; a
 * network/DB failure never gets mistaken for an empty preference set (which
 * would otherwise overwrite a healthy subscriber's selections).
 */
export async function reconcileExistingPushRegistration({
  subscription,
  topicsResponse,
  managedTopics,
  fetcher = fetch,
  deviceId,
  homeTown,
}: ReconcileExistingPushRegistrationOptions): Promise<ExistingPushRegistrationResult> {
  if (!topicsResponse.ok) return { connected: false, topics: [] };

  let payload: { registered?: unknown; topics?: unknown };
  try {
    payload = (await topicsResponse.json()) as {
      registered?: unknown;
      topics?: unknown;
    };
  } catch {
    return { connected: false, topics: [] };
  }

  const managed = new Set<string>(managedTopics);
  const topics = Array.isArray(payload.topics)
    ? payload.topics.filter(
        (topic): topic is PushTopic =>
          isPublicFixedPushTopic(topic) && managed.has(topic),
      )
    : [];

  if (payload.registered === true) return { connected: true, topics };
  if (payload.registered !== false) return { connected: false, topics: [] };

  try {
    const repaired = await fetcher("/api/push/subscribe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        subscription: subscription.toJSON(),
        topics,
        device_id: deviceId,
        home_town: homeTown ?? undefined,
      }),
    });
    return { connected: repaired.ok, topics };
  } catch {
    return { connected: false, topics: [] };
  }
}
