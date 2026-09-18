"use client";

import { Clock3, MapPin, ChevronRight, Star, MoonStar } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { MagicCard } from "../ui/MagicCard";
import { motion } from "framer-motion";
import { useEffect, useState } from "react";

function useFairCountdown() {
  const [timeLeft, setTimeLeft] = useState("");
  const [isUrgent, setIsUrgent] = useState(false);

  useEffect(() => {
    // The Fair starts on Friday, Sep 18, 2026 at 4:00 PM (gate opening).
    const targetDate = new Date("2026-09-18T16:00:00-04:00");
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
        setTimeLeft(`In ${days} day${days === 1 ? "" : "s"}`);
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

export default function FairUpNext({
  onAction,
  asOf,
}: {
  onAction?: () => void;
  asOf?: string;
} = {}) {
  const { timeLeft, isUrgent } = useFairCountdown();
  
  const isEvening = asOf ? new Date(asOf).getHours() >= 17 : false;

  if (isEvening) {
    return (
      <motion.div
        initial={{ y: 10, scale: 0.98 }}
        animate={{ y: 0, scale: 1 }}
        transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
        layoutId="fair-up-next"
      >
        <MagicCard
          className="mt-4 overflow-hidden rounded-[var(--app-radius-xl)] border backdrop-blur-xl"
          style={{
            borderColor: "var(--app-indigo)",
            background: "color-mix(in srgb, var(--app-indigo) 10%, var(--app-bg-elevated-solid))",
            boxShadow: "var(--app-elev-1), var(--app-edge)",
          }}
        >
          <section
            data-fair-up-next="evening"
            aria-label="Evening Highlights at the Fair"
          >
            <div
              className="flex items-center justify-between border-b px-4 py-2.5"
              style={{
                borderColor: "color-mix(in srgb, var(--app-indigo) 20%, transparent)",
                background: "color-mix(in srgb, var(--app-indigo) 15%, transparent)",
              }}
            >
              <h3 className="flex items-center gap-1.5 text-[11px] font-extrabold uppercase tracking-wider text-[var(--app-indigo-press)]">
                <MoonStar className="h-3.5 w-3.5" aria-hidden="true" />
                <span>Evening Highlights</span>
              </h3>
            </div>
            <div className="p-4 sm:p-5">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0 flex-1">
                  <h4 className="text-[18px] font-extrabold leading-tight tracking-[-0.025em] text-[var(--app-ink)]">
                    Tonight at the Fair
                  </h4>
                  <div className="mt-2 flex flex-col gap-1.5 text-[12.5px] font-medium leading-snug text-[var(--app-ink-2)]">
                    <span className="flex items-center gap-1.5"><Clock3 className="h-3.5 w-3.5 text-[var(--app-ink-3)]" /> Grandstand concerts, late-night rides & more</span>
                  </div>
                </div>
              </div>
              <div className="mt-4">
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={onAction}
                  href={onAction ? undefined : "/moments/great-frederick-fair-2026#find"}
                  className="w-full justify-between font-bold transition-transform active:scale-[0.99]"
                  style={{
                    borderColor: "color-mix(in srgb, var(--app-indigo) 30%, transparent)",
                    background: "var(--app-bg-sunken)",
                    color: "var(--app-indigo-press)",
                  }}
                  iconRight={<ChevronRight className="h-4 w-4" aria-hidden="true" />}
                >
                  View the evening schedule
                </Button>
              </div>
            </div>
          </section>
        </MagicCard>
      </motion.div>
    );
  }

  return (
    <motion.div
      initial={{ y: 10, scale: 0.98 }}
      animate={{ y: 0, scale: 1 }}
      transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
      layoutId="fair-up-next"
    >
      <motion.div
        animate={isUrgent ? { scale: [1, 1.01, 1], boxShadow: ["0px 0px 0px rgba(0,0,0,0)", "0px 4px 16px var(--app-brand)", "0px 0px 0px rgba(0,0,0,0)"] } : {}}
        transition={isUrgent ? { repeat: Infinity, duration: 2, ease: "easeInOut" } : {}}
        className="rounded-[var(--app-radius-xl)]"
      >
        <MagicCard
          className="mt-4 overflow-hidden rounded-[var(--app-radius-xl)] border backdrop-blur-xl"
          style={{
            borderColor: "var(--app-control-border)",
            background: "var(--app-bg-elevated-solid)",
            boxShadow: "var(--app-elev-1), var(--app-edge)",
          }}
        >
          <section
            data-fair-up-next
            aria-label="Up next at the Fair"
          >
            <div
              className="flex items-center justify-between border-b px-4 py-2.5"
              style={{
                borderColor: "var(--app-control-border)",
                background: "color-mix(in srgb, var(--app-brand) 6%, var(--app-bg-elevated-solid))",
              }}
            >
              <h3 className="flex items-center gap-1.5 text-[11px] font-extrabold uppercase tracking-wider text-[var(--app-brand-press)]">
                <Star className="h-3.5 w-3.5" aria-hidden="true" />
                <span>Opening Day Countdown</span>
              </h3>
              <span className="relative flex items-center gap-1.5 rounded-full bg-[var(--app-brand)] px-2.5 py-0.5 text-[10.5px] font-bold text-[var(--app-on-brand)] shadow-sm">
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
                  <h4 className="text-[18px] font-extrabold leading-tight tracking-[-0.025em] text-[var(--app-ink)]">
                    The Great Frederick Fair
                  </h4>
                  <div className="mt-2 flex flex-col gap-1.5 text-[12.5px] font-medium leading-snug text-[var(--app-ink-2)]">
                    <span className="flex items-center gap-1.5"><Clock3 className="h-3.5 w-3.5 text-[var(--app-ink-3)]" /> Sep 18–26 · Gates open 4 p.m. Friday</span>
                    <span className="flex items-center gap-1.5"><MapPin className="h-3.5 w-3.5 text-[var(--app-ink-3)]" /> Frederick Fairgrounds · 797 E Patrick St</span>
                  </div>
                </div>
              </div>
              <div className="mt-4">
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={onAction}
                  href={onAction ? undefined : "/moments/great-frederick-fair-2026#find"}
                  className="w-full justify-between font-bold transition-transform active:scale-[0.99]"
                  style={{
                    borderColor: "var(--app-control-border)",
                    background: "var(--app-bg-sunken)",
                  }}
                  iconRight={<ChevronRight className="h-4 w-4" aria-hidden="true" />}
                >
                  View the full schedule
                </Button>
              </div>
            </div>
          </section>
        </MagicCard>
      </motion.div>
    </motion.div>
  );
}
