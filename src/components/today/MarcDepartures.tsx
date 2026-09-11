import { getNextMarcDepartures } from "@/lib/loaders/marc";
import { Train } from "lucide-react";

export default function MarcDepartures() {
  const departures = getNextMarcDepartures("FREDERICK");
  
  if (departures.length === 0) return null;

  return (
    <div className="px-4">
      <div 
        className="flex items-center gap-3 rounded-[var(--app-radius-lg)] border px-4 py-3"
        style={{
          background: "var(--app-bg-elevated)",
          borderColor: "var(--app-border)",
          boxShadow: "var(--app-shadow-1)"
        }}
      >
        <div className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-orange-100 text-orange-600">
          <Train className="h-5 w-5" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[10px] font-bold uppercase tracking-wider" style={{ color: "var(--app-ink-3)" }}>
            Next MARC to Union Station
          </p>
          <div className="mt-1 flex items-baseline gap-2 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {departures.map((d, i) => {
              // Convert "HH:MM:SS" to "h:mm AM/PM"
              const [h, m] = d.departure_time.split(":");
              const date = new Date();
              date.setHours(parseInt(h, 10), parseInt(m, 10), 0);
              
              const timeStr = new Intl.DateTimeFormat("en-US", {
                hour: "numeric",
                minute: "2-digit"
              }).format(date);
              
              return (
                <span key={i} className="flex items-baseline gap-1.5 shrink-0">
                  <span className="font-bold text-[15px]" style={{ color: "var(--app-ink)" }}>
                    {timeStr}
                  </span>
                  {i < departures.length - 1 && (
                    <span className="text-[12px] opacity-40 px-1" style={{ color: "var(--app-ink-2)" }}>&bull;</span>
                  )}
                </span>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
