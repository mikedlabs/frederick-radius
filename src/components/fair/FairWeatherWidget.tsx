import { CloudRain, CloudSun, Wind } from "lucide-react";
import { MagicCard } from "../ui/MagicCard";
import { motion } from "framer-motion";

export default function FairWeatherWidget() {
  return (
    <motion.div
      initial={{ scale: 0.95 }}
      animate={{ scale: 1 }}
      transition={{ duration: 0.5, ease: "easeOut" }}
      className="mt-4"
    >
      <MagicCard
        className="relative overflow-hidden rounded-[var(--app-radius-xl)] border p-4 backdrop-blur-xl sm:p-5"
        style={{
          borderColor: "var(--app-control-border)",
          background: "linear-gradient(135deg, color-mix(in srgb, var(--app-cool) 6%, var(--app-bg-elevated-solid)), var(--app-bg-elevated-solid))",
          boxShadow: "var(--app-elev-1), var(--app-edge)",
        }}
      >
        <section
          data-fair-weather
          aria-label="Fair weather forecast"
          className="relative z-10 flex items-center justify-between gap-4"
        >
          <div className="min-w-0">
            <span className="text-[10.5px] font-extrabold uppercase tracking-[0.08em] text-[var(--app-cool)]">
              Forecast · Frederick Fairgrounds
            </span>
            <h2 className="mt-0.5 text-[18px] font-extrabold leading-tight tracking-[-0.025em] text-[var(--app-ink)]">
              Partly Cloudy
            </h2>
            <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[12.5px] font-medium leading-snug text-[var(--app-ink-2)]">
              <span className="flex items-center gap-1"><CloudRain className="h-3.5 w-3.5 text-[var(--app-cool)]" /> 15% rain</span>
              <span aria-hidden className="text-[var(--app-ink-3)]">·</span>
              <span className="flex items-center gap-1"><Wind className="h-3.5 w-3.5 text-[var(--app-ink-3)]" /> 8 mph breeze</span>
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2.5">
            <span className="text-[34px] font-extrabold tabular-nums tracking-tighter text-[var(--app-ink)]">78°</span>
            <CloudSun className="h-9 w-9 text-[var(--app-amber)]" />
          </div>
        </section>
      </MagicCard>
    </motion.div>
  );
}
