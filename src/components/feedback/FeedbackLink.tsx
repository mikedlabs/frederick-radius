"use client";

import { MessageSquarePlus } from "lucide-react";
import { requestFeedback } from "@/lib/feedback-ui";

export default function FeedbackLink() {
  return (
    <button
      type="button"
      onClick={event => requestFeedback(event.currentTarget)}
      className="tap-44 inline-flex items-center gap-2 rounded-full border px-3.5 py-2.5 text-[12px] font-semibold"
      style={{ borderColor: "var(--app-border)", color: "var(--app-ink)" }}
    >
      <MessageSquarePlus className="h-4 w-4" strokeWidth={2} aria-hidden />
      Report a missing truck or wrong stop
    </button>
  );
}
