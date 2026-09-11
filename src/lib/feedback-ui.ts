import {
  FAIR_FEEDBACK_MAX_CONTEXT,
  isFairFeedbackReason,
  type FairFeedbackReason,
} from "@/lib/feedback";

/** Opens the shared feedback sheet from an inline page affordance. */
export const OPEN_FEEDBACK_EVENT = "fr:open-feedback";

export type FeedbackOpenDetail = {
  fairIssue: FairFeedbackReason;
  fairContext?: string;
};

/**
 * CustomEvent detail is untrusted even when it originated in our UI. Keep the
 * handoff fixed to the Fair vocabulary and a small, display-safe context.
 */
export function parseFeedbackOpenDetail(
  value: unknown,
): FeedbackOpenDetail | null {
  if (typeof value !== "object" || value === null) return null;
  const detail = value as Record<string, unknown>;
  if (!isFairFeedbackReason(detail.fairIssue)) return null;

  if (detail.fairContext == null || detail.fairContext === "") {
    return { fairIssue: detail.fairIssue };
  }
  if (typeof detail.fairContext !== "string") return null;

  const fairContext = detail.fairContext.replace(/\s+/g, " ").trim();
  if (!fairContext) return { fairIssue: detail.fairIssue };

  return {
    fairIssue: detail.fairIssue,
    fairContext: fairContext.slice(0, FAIR_FEEDBACK_MAX_CONTEXT),
  };
}

/**
 * Keeps an inline feedback request alive if its button hydrates a moment
 * before the shared layout widget. The widget consumes and clears this flag.
 */
export const PENDING_FEEDBACK_KEY = "fr:pending-feedback";
