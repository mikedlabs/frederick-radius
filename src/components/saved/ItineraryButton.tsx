"use client";

import { useIsInItinerary, useSetItinerary } from "@/hooks/useItinerary";
import { Plus, Check } from "lucide-react";
import { motion } from "framer-motion";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { useMounted } from "@/hooks/useSaved";

export default function ItineraryButton({
  eventId,
  eventTitle,
  label,
  className = "",
}: {
  eventId: string;
  eventTitle?: string;
  label?: string;
  className?: string;
}) {
  const isSaved = useIsInItinerary(eventId);
  const setMembership = useSetItinerary();
  const router = useRouter();
  const mounted = useMounted();

  return (
    <button
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        try { setMembership(eventId, !isSaved); } catch {
          toast.error("This device could not update Day Plan. Try again.");
          return;
        }
        if (!isSaved) {
          toast.success("Added to Day Plan", {
            action: { label: "View Day Plan", onClick: () => router.push("/itinerary") },
          });
        } else {
          toast("Removed from Day Plan");
        }
      }}
      disabled={!mounted}
      aria-label={label || (eventTitle
        ? `${isSaved ? "Remove" : "Add"} ${eventTitle} ${isSaved ? "from" : "to"} Day Plan`
        : isSaved ? "Remove from Day Plan" : "Add to Day Plan")}
      className={`relative tap-44 flex items-center justify-center shrink-0 w-8 h-8 disabled:opacity-50 rounded-full border transition-all ${
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
