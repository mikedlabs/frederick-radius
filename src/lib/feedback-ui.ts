/** Opens the shared feedback sheet from an inline page affordance. */
export const OPEN_FEEDBACK_EVENT = "fr:open-feedback";

/**
 * Keeps an inline feedback request alive if its button hydrates a moment
 * before the shared layout widget. The widget consumes and clears this flag.
 */
export const PENDING_FEEDBACK_KEY = "fr:pending-feedback";
