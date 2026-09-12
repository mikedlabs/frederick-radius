"use client";

import { useIsInItinerary, useToggleItinerary } from "@/hooks/useItinerary";
import { Plus, Check } from "lucide-react";
import { motion } from "framer-motion";
import { toast } from "sonner";

export default function ItineraryButton({
  eventId,
  label,
  className = "",
}: {
  eventId: string;
  label?: string;
  className?: string;
}) {
  const isSaved = useIsInItinerary(eventId);
  const toggle = useToggleItinerary();

  return (
    <button
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        toggle(eventId);
        if (!isSaved) {
          toast.success("Added to Day Plan");
        } else {
          toast("Removed from Day Plan");
        }
      }}
      aria-label={label || (isSaved ? "Remove from Itinerary" : "Add to Itinerary")}
      className={`relative flex items-center justify-center shrink-0 w-8 h-8 rounded-full border transition-all ${
        isSaved
          ? "bg-[var(--app-positive)] border-[var(--app-positive)] text-white shadow-sm"
          : "bg-white/90 dark:bg-zinc-800/90 border-[var(--app-border)] text-[var(--app-ink-2)] hover:border-[var(--app-ink)] hover:text-[var(--app-ink)]"
      } ${className}`}
    >
      <motion.div
        initial={false}
        animate={{ scale: isSaved ? 1 : 0.9, opacity: 1 }}
        transition={{ type: "spring", stiffness: 400, damping: 25 }}
      >
        {isSaved ? <Check className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
      </motion.div>
    </button>
  );
}
