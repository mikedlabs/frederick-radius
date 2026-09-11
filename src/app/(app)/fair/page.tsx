import { Metadata } from "next";
import Link from "next/link";
import { Map, Calendar, Music, CarFront, Ticket, Info, Tent } from "lucide-react";
import { FAIR_START_DATE, FAIR_END_DATE, FAIR_DAYS } from "@/data/fair";

export const metadata: Metadata = {
  title: "The Great Frederick Fair Hub",
  description: "Your digital guide to The Great Frederick Fair.",
};

export default function FairHubPage() {
  const now = new Date();
  const start = new Date(FAIR_START_DATE);
  const end = new Date(FAIR_END_DATE);
  
  const isLive = now >= start && now <= end;
  
  const todayStr = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
  const [month, day, year] = todayStr.split("/");
  const ymd = `${year}-${month}-${day}`;

  const currentDayIndex = FAIR_DAYS.findIndex(d => d.date === ymd);
  // Default to Opening Day if not currently running, or if outside the window
  const activeDayIndex = currentDayIndex >= 0 ? currentDayIndex : 0;
  
  // Calculate day out countdown if not live
  const msToStart = start.getTime() - now.getTime();
  const daysOut = Math.ceil(msToStart / (1000 * 60 * 60 * 24));

  return (
    <div className="mx-auto max-w-md pb-12">
      {/* 1. Hero / Header */}
      <div className="relative pt-6 px-4 pb-6 border-b" style={{ borderColor: "var(--app-border)" }}>
        <h1 className="text-3xl font-black tracking-tight" style={{ color: "var(--app-ink)" }}>
          The Great Frederick Fair
        </h1>
        {isLive ? (
          <p className="mt-1 font-bold" style={{ color: "var(--app-brand)" }}>
            Day {activeDayIndex + 1} of 9
          </p>
        ) : (
          <p className="mt-1 text-sm" style={{ color: "var(--app-ink-2)" }}>
            {daysOut > 0 ? `Starts in ${daysOut} days • Sept 18–26, 2026` : "Sept 18–26, 2026"}
          </p>
        )}
      </div>

      {/* 2. Interactive Map Teaser */}
      <div className="px-4 py-6">
        <Link 
          href="/map?mode=fair" 
          className="group block relative overflow-hidden rounded-[var(--app-radius-lg)] border"
          style={{ borderColor: "var(--app-border)", boxShadow: "var(--app-shadow-1)" }}
        >
          {/* Faux map background to draw them in */}
          <div className="absolute inset-0 bg-[#E8E6E0] opacity-40"></div>
          <div className="relative p-5 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-white text-[var(--app-brand)] shadow-sm">
                <Map className="h-5 w-5" />
              </span>
              <div>
                <h3 className="font-bold" style={{ color: "var(--app-ink)" }}>Interactive Fair Map</h3>
                <p className="text-xs" style={{ color: "var(--app-ink-2)" }}>Find food, rides, and restrooms</p>
              </div>
            </div>
            <span className="text-[var(--app-brand)] font-semibold text-sm transition group-hover:translate-x-1">
              Open &rarr;
            </span>
          </div>
        </Link>
      </div>

      {/* 3. Daily Headlines (The 9-day schedule) */}
      <div className="px-4">
        <h2 className="eyebrow mb-3" style={{ color: "var(--app-ink-3)" }}>Daily Headlines & Grandstand</h2>
        
        {/* Horizontal scroll of all days */}
        <div className="-mx-4 flex gap-3 overflow-x-auto px-4 pb-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {FAIR_DAYS.map((d, i) => {
            const isActive = i === activeDayIndex;
            const isPast = i < currentDayIndex;
            return (
              <div 
                key={d.date} 
                className="w-[260px] shrink-0 rounded-[var(--app-radius-md)] border p-4 transition-all"
                style={{ 
                  background: isActive ? "var(--app-bg-elevated)" : "transparent",
                  borderColor: isActive ? "var(--app-brand)" : "var(--app-border)",
                  opacity: isPast ? 0.6 : 1,
                  boxShadow: isActive ? "var(--app-shadow-2)" : "none"
                }}
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: isActive ? "var(--app-brand)" : "var(--app-ink-2)" }}>
                    {isActive ? "Today" : `Day ${i + 1}`}
                  </span>
                  <span className="text-xs font-semibold" style={{ color: "var(--app-ink-3)" }}>
                    {new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" }).format(new Date(d.date + "T12:00:00Z"))}
                  </span>
                </div>
                <h3 className="font-bold leading-tight" style={{ color: "var(--app-ink)" }}>
                  {d.theme}
                </h3>
                <p className="mt-1 text-xs" style={{ color: "var(--app-ink-2)" }}>
                  {d.admission_special}
                </p>

                <div className="mt-4 pt-4 border-t" style={{ borderColor: "var(--app-border)" }}>
                  <div className="flex items-center gap-1.5 mb-1 text-[11px] font-semibold uppercase tracking-wider" style={{ color: "var(--app-ink-3)" }}>
                    <Ticket className="h-3 w-3" /> Grandstand at {d.grandstand_time}
                  </div>
                  <p className="font-bold text-[15px]" style={{ color: "var(--app-brand)" }}>
                    {d.grandstand_headline}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* 4. Quick Links / Schedule Explorer */}
      <div className="mt-2 px-4 space-y-4">
        <h2 className="eyebrow" style={{ color: "var(--app-ink-3)" }}>Essential Info</h2>
        <div className="grid grid-cols-2 gap-3">
          <Link href="/events" className="flex items-center gap-2 rounded-[var(--app-radius-sm)] border p-3 bg-[var(--app-bg-elevated)] active:scale-[0.98]" style={{ borderColor: "var(--app-border)" }}>
            <Calendar className="h-4 w-4" style={{ color: "var(--app-cool)" }} />
            <span className="text-sm font-semibold" style={{ color: "var(--app-ink)" }}>Full Schedule</span>
          </Link>
          <button className="flex items-center gap-2 rounded-[var(--app-radius-sm)] border p-3 bg-[var(--app-bg-elevated)] active:scale-[0.98]" style={{ borderColor: "var(--app-border)" }}>
            <Music className="h-4 w-4" style={{ color: "var(--app-accent)" }} />
            <span className="text-sm font-semibold" style={{ color: "var(--app-ink)" }}>Buy Tickets</span>
          </button>
          <button className="flex items-center gap-2 rounded-[var(--app-radius-sm)] border p-3 bg-[var(--app-bg-elevated)] active:scale-[0.98]" style={{ borderColor: "var(--app-border)" }}>
            <CarFront className="h-4 w-4" style={{ color: "var(--app-ink-2)" }} />
            <span className="text-sm font-semibold" style={{ color: "var(--app-ink)" }}>Parking Guide</span>
          </button>
          <button className="flex items-center gap-2 rounded-[var(--app-radius-sm)] border p-3 bg-[var(--app-bg-elevated)] active:scale-[0.98]" style={{ borderColor: "var(--app-border)" }}>
            <Info className="h-4 w-4" style={{ color: "var(--app-ink-2)" }} />
            <span className="text-sm font-semibold" style={{ color: "var(--app-ink)" }}>Fair FAQs</span>
          </button>
        </div>
      </div>
      
    </div>
  );
}
