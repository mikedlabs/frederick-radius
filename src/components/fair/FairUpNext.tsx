import { Clock3, MapPin, ChevronRight, Star } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { MagicCard } from "../ui/MagicCard";
import { motion } from "framer-motion";

export default function FairUpNext() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
      layoutId="fair-up-next"
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
            <Clock3 className="h-4 w-4" /> Up Next
          </h3>
          <span className="relative flex items-center gap-1.5 rounded-full bg-[var(--app-brand)] pl-2 pr-2.5 py-0.5 text-[10px] font-bold text-[var(--app-on-brand)] shadow-sm">
            <span className="relative flex h-1.5 w-1.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[var(--app-on-brand)] opacity-75"></span>
              <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-[var(--app-on-brand)]"></span>
            </span>
            In 30 mins
          </span>
        </div>
        <div className="p-4 sm:p-5">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0 flex-1">
              <h4 className="text-[19px] font-extrabold leading-tight tracking-[-0.025em] text-[var(--app-ink)]">
                Demolition Derby: Cars
              </h4>
              <div className="mt-2.5 flex flex-col gap-2 text-[13px] font-semibold leading-snug text-[var(--app-ink-2)]">
                <span className="flex items-center gap-1.5"><Clock3 className="h-4 w-4 text-[var(--app-ink-3)]" /> 7:00 PM – 9:00 PM</span>
                <span className="flex items-center gap-1.5"><MapPin className="h-4 w-4 text-[var(--app-ink-3)]" /> Grandstand</span>
              </div>
            </div>
            <button
              type="button"
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border bg-[var(--app-bg-surface)] shadow-sm transition-transform active:scale-90"
              style={{ borderColor: "var(--app-border)" }}
              aria-label="Star this event"
            >
              <Star className="h-5 w-5 text-yellow-500 drop-shadow-sm" />
            </button>
          </div>
          <div className="mt-5">
            <Button
              size="sm"
              variant="secondary"
              className="w-full justify-between font-bold backdrop-blur-md"
              style={{ background: "color-mix(in srgb, var(--app-bg-sunken) 70%, transparent)" }}
              iconRight={<ChevronRight className="h-4 w-4" />}
            >
              View Full Schedule
            </Button>
          </div>
        </div>
      </section>
      </MagicCard>
    </motion.div>
  );
}
