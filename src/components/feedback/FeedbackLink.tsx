"use client";

import { MessageSquarePlus } from "lucide-react";
import {
  OPEN_FEEDBACK_EVENT,
  PENDING_FEEDBACK_KEY,
} from "@/lib/feedback-ui";

function openFeedback() {
  try {
    window.sessionStorage.setItem(PENDING_FEEDBACK_KEY, "1");
  } catch {
    // The event still works when storage is unavailable.
  }
  window.dispatchEvent(new Event(OPEN_FEEDBACK_EVENT));
}

export default function FeedbackLink() {
  return (
    <button
      type="button"
      onClick={openFeedback}
      className="tap-44 inline-flex items-center gap-2 rounded-full border px-3.5 py-2.5 text-[12px] font-semibold"
      style={{ borderColor: "var(--app-border)", color: "var(--app-ink)" }}
    >
      <MessageSquarePlus className="h-4 w-4" strokeWidth={2} aria-hidden />
      Report a missing truck or wrong stop
    </button>
  );
}
