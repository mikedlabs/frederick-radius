import {
  isPublicFixedPushTopic,
  type PushTopic,
} from "@/lib/push-topics";

type ReconcileExistingPushRegistrationOptions = {
  topicsResponse: Response;
  managedTopics: readonly PushTopic[];
};

export type ExistingPushRegistrationResult = {
  state: "connected" | "missing" | "unverified";
  topics: PushTopic[];
};

/**
 * Verify that a browser-owned PushSubscription still has a matching server
 * row. A provider can invalidate a subscription and cause fanout to prune the
 * row before the browser drops its local object. In that state the browser API
 * alone is not proof that Radius can deliver anything.
 *
 * The topics read deliberately carries an explicit `registered` bit. A
 * missing row must not be recreated with the same browser endpoint: the row
 * may have been pruned after that endpoint failed at the push provider. The UI
 * instead asks the user to reconnect and renews the browser subscription.
 */
export async function reconcileExistingPushRegistration({
  topicsResponse,
  managedTopics,
}: ReconcileExistingPushRegistrationOptions): Promise<ExistingPushRegistrationResult> {
  if (!topicsResponse.ok) return { state: "unverified", topics: [] };

  let payload: { registered?: unknown; topics?: unknown };
  try {
    payload = (await topicsResponse.json()) as {
      registered?: unknown;
      topics?: unknown;
    };
  } catch {
    return { state: "unverified", topics: [] };
  }

  const managed = new Set<string>(managedTopics);
  const topics = Array.isArray(payload.topics)
    ? payload.topics.filter(
        (topic): topic is PushTopic =>
          isPublicFixedPushTopic(topic) && managed.has(topic),
      )
    : [];

  if (payload.registered === true) return { state: "connected", topics };
  if (payload.registered === false) return { state: "missing", topics: [] };
  return { state: "unverified", topics: [] };
}
