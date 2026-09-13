"use client";

import { Clock3, MapPin, ChevronRight, Star } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { MagicCard } from "../ui/MagicCard";
import { motion } from "framer-motion";
import { useEffect, useState } from "react";

function useFairCountdown() {
  const [timeLeft, setTimeLeft] = useState("");
  const [isUrgent, setIsUrgent] = useState(false);

  useEffect(() => {
    // The Fair starts on Sept 18, 2026.
    const targetDate = new Date("2026-09-18T09:00:00-04:00");
    const update = () => {
      const now = new Date();
      const diff = targetDate.getTime() - now.getTime();
      
      if (diff <= 0) {
        setTimeLeft("Open Now");
        setIsUrgent(true);
        return;
      }
      
      const mins = Math.floor(diff / 60000);
      const hrs = Math.floor(mins / 60);
      const days = Math.floor(hrs / 24);

      if (days > 0) {
        setTimeLeft(`In ${days} day${days === 1 ? '' : 's'}`);
        setIsUrgent(false);
      } else if (hrs > 0) {
        setTimeLeft(`In ${hrs}h ${mins % 60}m`);
        setIsUrgent(false);
      } else {
        const secs = Math.floor((diff % 60000) / 1000);
        setTimeLeft(`In ${mins}m ${secs}s`);
        setIsUrgent(mins < 15);
      }
    };
    
    update();
    const interval = setInterval(update, 1000);
    return () => clearInterval(interval);
  }, []);

  return { timeLeft, isUrgent };
}

export default function FairUpNext() {
  const { timeLeft, isUrgent } = useFairCountdown();

  return (
    <motion.div
      initial={{ opacity: 0, y: 10, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
      layoutId="fair-up-next"
    >
      <motion.div
        animate={isUrgent ? { scale: [1, 1.02, 1], boxShadow: ["0px 0px 0px rgba(0,0,0,0)", "0px 4px 20px var(--app-brand)", "0px 0px 0px rgba(0,0,0,0)"] } : {}}
        transition={isUrgent ? { repeat: Infinity, duration: 2, ease: "easeInOut" } : {}}
        className="rounded-xl"
      >
        <MagicCard className="mt-4 overflow-hidden border-0 bg-[var(--app-bg-surface)]/80 shadow-lg backdrop-blur-xl">
        <section
          data-fair-up-next
          aria-label="Up next at the Fair"
        >
          <div
            className="flex items-center justify-between border-b px-4 py-3 backdrop-blur-md"
            style={{ borderColor: "color-mix(in srgb, var(--app-border-strong) 40%, transparent)", background: "color-mix(in srgb, var(--app-brand) 8%, transparent)" }}
          >
            <h3 className="flex items-center gap-2 text-[12px] font-bold uppercase tracking-wider text-[var(--app-brand-press)]">
              <Star className="h-4 w-4" /> Coming Soon
            </h3>
            <span className="relative flex items-center gap-1.5 rounded-full bg-[var(--app-brand)] pl-2 pr-2.5 py-0.5 text-[10px] font-bold text-[var(--app-on-brand)] shadow-sm">
              <span className="relative flex h-1.5 w-1.5">
                {isUrgent && <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[var(--app-on-brand)] opacity-75"></span>}
                <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-[var(--app-on-brand)]"></span>
              </span>
              {timeLeft}
            </span>
          </div>
          <div className="p-4 sm:p-5">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0 flex-1">
                <h4 className="text-[19px] font-extrabold leading-tight tracking-[-0.025em] text-[var(--app-ink)]">
                  The Great Frederick Fair
                </h4>
                <div className="mt-2.5 flex flex-col gap-2 text-[13px] font-semibold leading-snug text-[var(--app-ink-2)]">
                  <span className="flex items-center gap-1.5"><Clock3 className="h-4 w-4 text-[var(--app-ink-3)]" /> Sept 18 – 26</span>
                  <span className="flex items-center gap-1.5"><MapPin className="h-4 w-4 text-[var(--app-ink-3)]" /> Frederick Fairgrounds</span>
                </div>
              </div>
            </div>
            <div className="mt-5">
              <Button
                size="sm"
                variant="secondary"
                href="/moments/great-frederick-fair-2026#now"
                className="w-full justify-between font-bold backdrop-blur-md transition-transform hover:scale-[1.02] active:scale-[0.98]"
                style={{ background: "color-mix(in srgb, var(--app-bg-sunken) 70%, transparent)" }}
                iconRight={<ChevronRight className="h-4 w-4" />}
              >
                Plan Your Visit
              </Button>
            </div>
          </div>
        </section>
      </MagicCard>
      </motion.div>
    </motion.div>
  );
}
