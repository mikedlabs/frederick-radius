import { CloudRain, CloudSun, Wind } from "lucide-react";
import { MagicCard } from "../ui/MagicCard";
import { motion } from "framer-motion";

export default function FairWeatherWidget() {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.5, ease: "easeOut" }}
      className="mt-4"
    >
      <MagicCard
        className="relative overflow-hidden border-0 p-4 shadow-[0_8px_32px_rgba(0,0,0,0.08)] backdrop-blur-2xl sm:p-5"
        style={{
          background: "linear-gradient(135deg, rgba(255,255,255,0.9), rgba(255,255,255,0.7))",
          boxShadow: "inset 0 0 0 1px rgba(255,255,255,0.5), 0 8px 32px rgba(0,0,0,0.08)",
        }}
      >
        <div className="pointer-events-none absolute -right-10 -top-10 h-40 w-40 rounded-full bg-blue-300/20 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-10 -left-10 h-40 w-40 rounded-full bg-yellow-300/20 blur-3xl" />
        
        <section
          data-fair-weather
          aria-label="Fair weather forecast"
          className="relative z-10 flex items-center justify-between gap-4"
        >
          <div className="min-w-0">
            <h3 className="text-[17px] font-extrabold leading-tight tracking-[-0.025em] text-[var(--app-ink)]">
              Partly Cloudy
            </h3>
            <p className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] font-semibold leading-snug text-[var(--app-ink-2)]">
              <span>Frederick Fairgrounds</span>
              <span aria-hidden className="text-[var(--app-ink-3)]">·</span>
              <span className="flex items-center gap-1"><CloudRain className="h-3.5 w-3.5 text-blue-500" /> 15%</span>
              <span aria-hidden className="text-[var(--app-ink-3)]">·</span>
              <span className="flex items-center gap-1"><Wind className="h-3.5 w-3.5 text-slate-500" /> 8 mph</span>
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <span className="text-[32px] font-extrabold tracking-tighter text-[var(--app-ink)] drop-shadow-sm">78°</span>
            <CloudSun className="h-10 w-10 text-yellow-500 drop-shadow-md" />
          </div>
        </section>
      </MagicCard>
    </motion.div>
  );
}
