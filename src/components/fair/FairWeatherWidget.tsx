import { CloudRain, CloudSun, Wind } from "lucide-react";
import { MagicCard } from "../ui/MagicCard";

export default function FairWeatherWidget() {
  return (
    <MagicCard
      className="mt-4 p-4 sm:p-5"
    >
      <section
        data-fair-weather
        aria-label="Fair weather forecast"
        className="flex items-center justify-between gap-4"
      >
        <div className="min-w-0">
          <h3 className="text-[16px] font-extrabold leading-tight tracking-[-0.02em] text-[var(--app-ink)]">
            Partly Cloudy
          </h3>
          <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] font-medium leading-snug text-[var(--app-ink-2)]">
            <span>Frederick Fairgrounds</span>
            <span aria-hidden className="text-[var(--app-ink-3)]">·</span>
            <span className="flex items-center gap-1"><CloudRain className="h-3.5 w-3.5 text-blue-500" /> 15%</span>
            <span aria-hidden className="text-[var(--app-ink-3)]">·</span>
            <span className="flex items-center gap-1"><Wind className="h-3.5 w-3.5 text-slate-400" /> 8 mph</span>
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <span className="text-[28px] font-bold tracking-tighter text-[var(--app-ink)]">78°</span>
          <CloudSun className="h-9 w-9 text-yellow-500 drop-shadow-sm" />
        </div>
      </section>
    </MagicCard>
  );
}
